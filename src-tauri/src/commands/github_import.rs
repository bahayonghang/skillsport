//! Tauri IPC shells for GitHub repository import.
//!
//! Business logic lives in `crate::services::github_import`. This module keeps
//! the existing command names and public type paths stable while translating
//! `State<AppState>` into service inputs.

use tauri::{AppHandle, State};

use crate::services::github_import;
use crate::targets::ActiveTarget;
use crate::AppState;
use crate::{
    ipc_error::{public_message_for_code, IpcError, REVIEWED_IPC_ERROR_CODES},
    observability::{
        OperationContext, OperationDefinition, OperationTarget, OperationTargetKind,
        ReviewedDiagnostic, ReviewedFailure, SafeDetailKey, SafeOperationResult,
    },
};

pub use crate::services::github_import::{
    DuplicateResolution, GitHubImportProgressPayload, GitHubImportProgressPhase, GitHubPatState,
    GitHubPatTestResult, GitHubRepoImportResult, GitHubRepoPreview, GitHubRepoRef,
    GitHubSkillConflict, GitHubSkillImportSelection, GitHubSkillPreview,
    ImportedGitHubSkillSummary,
};

fn operation_definition(command: &'static str) -> OperationDefinition {
    match crate::ipc_registry::command_policy(command)
        .expect("GitHub import command must be registered")
        .policy
    {
        crate::observability::CommandLogPolicy::Operation(definition) => definition,
        _ => panic!("GitHub import mutation must use Operation policy"),
    }
}

fn operation_target(target: &ActiveTarget) -> OperationTarget {
    match target {
        ActiveTarget::Local => OperationTarget::local(),
        ActiveTarget::Ssh(_) => OperationTarget::new(OperationTargetKind::Ssh, target.id()),
        ActiveTarget::Wsl(_) => OperationTarget::new(OperationTargetKind::Wsl, target.id()),
    }
}

fn reviewed_failure(definition: OperationDefinition, error: IpcError) -> ReviewedFailure {
    let code = REVIEWED_IPC_ERROR_CODES
        .iter()
        .copied()
        .find(|code| *code == error.safe_code())
        .unwrap_or("internal.unexpected");
    let message = public_message_for_code(code)
        .unwrap_or("The operation failed. See runtime logs for details.");
    ReviewedFailure::new(ReviewedDiagnostic::new(
        code,
        definition.category().as_str(),
        definition.default_phase(),
        message,
        error.retryable,
    ))
}

/// Reviewed diagnostic for a failed preview. Only static values cross into the
/// Operation Log: the stable code, the fine-grained transport category, the
/// failing step and the numeric HTTP status. The repository URL, branch and
/// any token stay out of the record.
fn preview_reviewed_failure(
    definition: OperationDefinition,
    failure: &github_import::PreviewFailure,
) -> ReviewedFailure {
    let envelope = IpcError::from(failure.error.to_ipc_error());
    let code = REVIEWED_IPC_ERROR_CODES
        .iter()
        .copied()
        .find(|code| *code == envelope.safe_code())
        .unwrap_or("internal.unexpected");
    let message = public_message_for_code(code)
        .unwrap_or("The operation failed. See runtime logs for details.");
    ReviewedFailure::new(
        ReviewedDiagnostic::new(
            code,
            failure.error.snapshot_diagnostic_category(),
            definition.default_phase(),
            message,
            envelope.retryable,
        )
        .with_failure_stage(failure.stage.as_str())
        .with_http_status(failure.error.http_status()),
    )
}

/// Preview a repository import. Success is read-only and writes no Operation
/// Log row; a failure writes one terminal row (`FailureOnly`) so the user can
/// find why GitHub refused or could not be reached.
#[tauri::command]
pub async fn preview_github_repo_import(
    state: State<'_, AppState>,
    repo_url: String,
    branch: Option<String>,
) -> crate::ipc_error::IpcResult<GitHubRepoPreview> {
    crate::ipc_boundary!(
        "preview_github_repo_import",
        async move {
            let request_context = state.resolve_target_context().await?;
            let active_target = request_context.target().clone();
            let pool = request_context.db().clone();
            let definition = operation_definition("preview_github_repo_import");
            let context = OperationContext::new(operation_target(&active_target));
            let settings_db = state.db.clone();
            let secrets = std::sync::Arc::clone(&state.secrets);
            crate::observability::run_operation(
                &state,
                definition,
                context,
                |_: &GitHubRepoPreview| {
                    SafeOperationResult::succeeded("Previewed a GitHub repository.")
                },
                || async move {
                    let auth = github_import::github_direct_auth_from_secret_store(
                        &settings_db,
                        secrets.as_ref(),
                    )
                    .await
                    .map_err(|error| github_import::PreviewFailure {
                        stage: github_import::PreviewStage::RepoInspect,
                        error,
                    });
                    let result = match auth {
                        Err(failure) => Err(failure),
                        Ok(auth) => match &active_target {
                            ActiveTarget::Local => {
                                github_import::preview_github_repo_import_staged(
                                    &pool,
                                    &repo_url,
                                    branch.as_deref(),
                                    auth.as_deref(),
                                )
                                .await
                            }
                            ActiveTarget::Ssh(_) | ActiveTarget::Wsl(_) => {
                                github_import::preview_github_repo_import_remote_staged(
                                    &pool,
                                    &active_target,
                                    &repo_url,
                                    branch.as_deref(),
                                    auth.as_deref(),
                                )
                                .await
                            }
                        },
                    };
                    result.map_err(|failure| preview_reviewed_failure(definition, &failure))
                },
            )
            .await
        }
        .await
    )
}

/// Import the skills confirmed in a registered preview snapshot.
///
/// `previewId` is required for every target. The command never falls back to
/// re-resolving the repository URL, so a branch that moved after preview cannot
/// change what is imported.
#[tauri::command]
pub async fn import_github_repo_skills(
    app: AppHandle,
    state: State<'_, AppState>,
    preview_id: String,
    repo_url: String,
    branch: Option<String>,
    selections: Vec<GitHubSkillImportSelection>,
) -> crate::ipc_error::IpcResult<GitHubRepoImportResult> {
    crate::ipc_boundary!(
        "import_github_repo_skills",
        async move {
            let request_context = state.resolve_target_context().await?;
            let active_target = request_context.target().clone();
            let pool = request_context.db().clone();
            let definition = operation_definition("import_github_repo_skills");
            let context = OperationContext::new(operation_target(&active_target));
            let requested = selections.len() as u64;
            crate::observability::run_operation(
                &state,
                definition,
                context,
                |result: &GitHubRepoImportResult| {
                    let imported = result.imported_skills.len() as u64;
                    let skipped = result.skipped_skills.len() as u64;
                    SafeOperationResult::succeeded("Imported skills from a GitHub repository.")
                        .count(SafeDetailKey::RequestedCount, requested)
                        .count(SafeDetailKey::SucceededCount, imported)
                        .count(SafeDetailKey::SkippedCount, skipped)
                },
                || async move {
                    github_import::import_github_repo_skills_from_preview_with_branch(
                        &pool,
                        &active_target,
                        &preview_id,
                        &repo_url,
                        branch.as_deref(),
                        selections,
                        Some(&app),
                    )
                    .await
                    .map_err(|error| {
                        reviewed_failure(definition, IpcError::from(error.to_ipc_error()))
                    })
                },
            )
            .await
        }
        .await
    )
}

#[tauri::command]
pub async fn fetch_github_skill_markdown(
    state: State<'_, AppState>,
    preview_id: String,
    repo: GitHubRepoRef,
    source_path: String,
) -> crate::ipc_error::IpcResult<String> {
    crate::ipc_boundary!(
        "fetch_github_skill_markdown",
        async move {
            let request_context = state.resolve_target_context().await?;
            github_import::fetch_github_skill_markdown_from_snapshot(
                request_context.target(),
                &preview_id,
                &repo,
                &source_path,
            )
            .await
            .map_err(|e| e.to_ipc_error())
        }
        .await
    )
}

#[tauri::command]
pub async fn discard_github_repo_preview_snapshot(
    state: State<'_, AppState>,
    preview_id: String,
) -> crate::ipc_error::IpcResult<()> {
    crate::ipc_boundary!(
        "discard_github_repo_preview_snapshot",
        async move {
            let request_context = state.resolve_target_context().await?;
            github_import::discard_preview_snapshot_for_target(
                request_context.target(),
                &preview_id,
            )
            .await;
            Ok::<(), IpcError>(())
        }
        .await
    )
}

#[tauri::command]
#[cfg_attr(feature = "ipc-codegen", specta::specta)]
pub async fn get_github_pat(
    state: State<'_, AppState>,
) -> crate::ipc_error::IpcResult<GitHubPatState> {
    crate::ipc_boundary!(
        "get_github_pat",
        async move {
            github_import::get_github_pat_state_impl(&state.db, state.secrets.as_ref())
                .await
                .map_err(|e| e.to_string())
        }
        .await
    )
}

#[tauri::command]
#[cfg_attr(feature = "ipc-codegen", specta::specta)]
pub async fn set_github_pat(
    state: State<'_, AppState>,
    value: String,
) -> crate::ipc_error::IpcResult<GitHubPatState> {
    crate::ipc_boundary!(
        "set_github_pat",
        async move {
            let definition = operation_definition("set_github_pat");
            crate::observability::run_operation(
                &state,
                definition,
                OperationTarget::local(),
                |result: &GitHubPatState| {
                    SafeOperationResult::succeeded("Saved the GitHub credential.")
                        .flag(SafeDetailKey::Changed, result.configured)
                },
                || async {
                    let result = github_import::set_github_pat_impl(
                        &state.db,
                        state.secrets.as_ref(),
                        value,
                    )
                    .await
                    .map_err(|error| reviewed_failure(definition, IpcError::from_display(error)));
                    if result.is_ok() {
                        state.central_update_snapshots.clear();
                    }
                    result
                },
            )
            .await
        }
        .await
    )
}

#[tauri::command]
#[cfg_attr(feature = "ipc-codegen", specta::specta)]
pub async fn clear_github_pat(
    state: State<'_, AppState>,
) -> crate::ipc_error::IpcResult<GitHubPatState> {
    crate::ipc_boundary!(
        "clear_github_pat",
        async move {
            let definition = operation_definition("clear_github_pat");
            crate::observability::run_operation(
                &state,
                definition,
                OperationTarget::local(),
                |_| SafeOperationResult::succeeded("Cleared the GitHub credential."),
                || async {
                    let result =
                        github_import::clear_github_pat_impl(&state.db, state.secrets.as_ref())
                            .await
                            .map_err(|error| {
                                reviewed_failure(definition, IpcError::from_display(error))
                            });
                    if result.is_ok() {
                        state.central_update_snapshots.clear();
                    }
                    result
                },
            )
            .await
        }
        .await
    )
}

#[tauri::command]
#[cfg_attr(feature = "ipc-codegen", specta::specta)]
pub async fn test_github_pat(
    state: State<'_, AppState>,
) -> crate::ipc_error::IpcResult<GitHubPatTestResult> {
    crate::ipc_boundary!(
        "test_github_pat",
        async move {
            let definition = operation_definition("test_github_pat");
            crate::observability::run_operation(
                &state,
                definition,
                OperationTarget::local(),
                |result: &GitHubPatTestResult| {
                    if result.ok {
                        SafeOperationResult::succeeded("Tested the GitHub credential successfully.")
                    } else {
                        SafeOperationResult::partial(
                            "The GitHub credential test completed with a failed result.",
                        )
                    }
                    .flag(SafeDetailKey::Changed, result.configured)
                },
                || async {
                    github_import::test_github_pat_impl(&state.db, state.secrets.as_ref())
                        .await
                        .map_err(|error| {
                            reviewed_failure(definition, IpcError::from_display(error))
                        })
                },
            )
            .await
        }
        .await
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_import_dynamic_inputs_do_not_enter_the_ipc_envelope() {
        let secret = r"https://user:ghp_secret@example.invalid/private?ref=deadbeef";
        let error = github_import::GithubImportError::InvalidUrl(secret.to_string());
        let ipc = IpcError::from(error.to_ipc_error());
        let serialized = serde_json::to_string(&ipc).unwrap();
        assert_eq!(ipc.code, "github_import.invalid_url");
        assert!(!serialized.contains(secret));
        assert!(!serialized.contains("ghp_secret"));
        assert!(!serialized.contains("deadbeef"));
    }

    fn test_app_state(pool: crate::db::DbPool) -> AppState {
        AppState {
            db: pool,
            ai_tag_jobs: crate::AiTagJobRegistry::default(),
            central_update_jobs: crate::services::exclusive_job::ExclusiveJobRegistry::new(
                "job.central_update_busy",
                "A Central update job is already running.",
            ),
            central_update_snapshots: crate::CentralUpdateSnapshotCache::default(),
            portable_state_jobs: crate::services::exclusive_job::ExclusiveJobRegistry::new(
                "job.portability_busy",
                "A portability job is already running.",
            ),
            skills_cli_jobs: crate::services::exclusive_job::ExclusiveJobRegistry::new(
                "job.skills_cli_busy",
                "A Skills CLI job is already running.",
            ),
            secrets: std::sync::Arc::new(crate::secrets::MockSecretStore::default()),
            targets: crate::targets::TargetRegistry::default(),
        }
    }

    async fn audited_preview_failure(
        failure: github_import::PreviewFailure,
    ) -> (IpcError, serde_json::Value, String) {
        let pool = crate::test_support::mem_pool().await;
        let state = test_app_state(pool.clone());
        let definition = operation_definition("preview_github_repo_import");
        let error = crate::observability::run_operation(
            &state,
            definition,
            OperationTarget::local(),
            |_: &()| SafeOperationResult::succeeded("Previewed a GitHub repository."),
            || async move { Err(preview_reviewed_failure(definition, &failure)) },
        )
        .await
        .unwrap_err();
        let page = crate::db::list_operation_logs(&pool, crate::db::OperationLogFilter::default())
            .await
            .unwrap();
        assert_eq!(page.entries.len(), 1);
        let serialized = serde_json::to_string(&page.entries[0]).unwrap();
        let details =
            serde_json::from_str(page.entries[0].details_json.as_deref().unwrap()).unwrap();
        (error, details, serialized)
    }

    #[tokio::test]
    async fn preview_branch_failure_is_audited_with_stage_and_status() {
        let (error, details, serialized) = audited_preview_failure(github_import::PreviewFailure {
            stage: github_import::PreviewStage::CommitResolve,
            error: github_import::GithubImportError::BranchNotFound,
        })
        .await;
        assert_eq!(error.code, "github_import.branch_not_found");
        assert!(!error.retryable);
        assert!(error.correlation_id.is_some());
        assert_eq!(details["errorCode"], "github_import.branch_not_found");
        assert_eq!(details["errorCategory"], "github_import.branch_not_found");
        assert_eq!(details["phase"], "network");
        assert_eq!(details["failureStage"], "commit_resolve");
        assert_eq!(details["httpStatus"], 422);
        assert!(serialized.contains("\"category\":\"import\""));
    }

    #[tokio::test]
    async fn preview_transport_failure_keeps_dynamic_text_out_of_the_audit_row() {
        let planted = "Failed to inspect GitHub repository: https://user:ghp_secret@example.invalid/owner/repo/tree/feature-x";
        let (error, details, serialized) = audited_preview_failure(github_import::PreviewFailure {
            stage: github_import::PreviewStage::RepoInspect,
            error: github_import::GithubImportError::Http(planted.to_string()),
        })
        .await;
        assert_eq!(error.code, "github_import.transport_failed");
        assert!(error.retryable);
        assert_eq!(details["errorCategory"], "github_import.transport_unknown");
        assert_eq!(details["failureStage"], "repo_inspect");
        assert!(details.get("httpStatus").is_none());
        for secret in ["ghp_secret", "example.invalid", "feature-x", "owner/repo"] {
            assert!(
                !serialized.contains(secret),
                "{secret} leaked: {serialized}"
            );
            assert!(
                !serde_json::to_string(&error).unwrap().contains(secret),
                "{secret} leaked into IPC error"
            );
        }
    }

    #[tokio::test]
    async fn preview_client_status_is_audited_as_request_rejected() {
        let (error, details, _) = audited_preview_failure(github_import::PreviewFailure {
            stage: github_import::PreviewStage::SnapshotAcquire,
            error: github_import::GithubImportError::HttpStatus {
                message: "Failed to fetch GitHub repository tree: HTTP 400 Bad Request".to_string(),
                status: 400,
            },
        })
        .await;
        assert_eq!(error.code, "github_import.request_rejected");
        assert!(!error.retryable);
        assert_eq!(details["errorCategory"], "github_import.http_client_error");
        assert_eq!(details["failureStage"], "snapshot_acquire");
        assert_eq!(details["httpStatus"], 400);
    }

    #[test]
    fn github_import_mutations_are_registered_as_operations() {
        for command in [
            "set_github_pat",
            "clear_github_pat",
            "test_github_pat",
            "import_github_repo_skills",
        ] {
            assert!(matches!(
                crate::ipc_registry::command_policy(command).unwrap().policy,
                crate::observability::CommandLogPolicy::Operation(_)
            ));
        }
    }
}
