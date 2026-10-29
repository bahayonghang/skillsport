//! Tauri IPC shells for SkillPort portable bundles (format v2).
//!
//! Business logic lives in `crate::services::portable_bundle`. The renderer
//! passes file paths, job ids, preview tokens, and per-skill decisions; skill
//! bytes never cross the IPC boundary. Errors use the reviewed
//! `portable_bundle.*` codes and never echo paths.

use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::ipc_error::IpcError;
use crate::observability::{
    CommandLogPolicy, OperationContext, OperationDefinition, OperationTarget, OperationTargetKind,
    ReviewedDiagnostic, ReviewedFailure, SafeDetailKey, SafeOperationResult,
};
use crate::services::central_updates::CentralFs;
use crate::services::portable_bundle::{
    apply_import, export_bundle, export_summary, preview_cache, preview_import, BundleJob,
    PortableBundleDecision, PortableBundleError, PortableBundleExportResult,
    PortableBundleExportSummary, PortableBundleImportPreview, PortableBundleImportResult,
    PortableBundleJobStatus, PortableBundlePhase,
};
use crate::targets::{ActiveTarget, TargetKind};
use crate::AppState;

fn operation_definition(command: &'static str) -> OperationDefinition {
    match crate::ipc_registry::command_policy(command)
        .expect("portable-bundle command must be registered")
        .policy
    {
        CommandLogPolicy::Operation(definition) => definition,
        _ => panic!("portable-bundle mutation must use Operation policy"),
    }
}

fn operation_target(target: &ActiveTarget) -> OperationTarget {
    match target {
        ActiveTarget::Local => OperationTarget::local(),
        ActiveTarget::Ssh(_) => OperationTarget::new(OperationTargetKind::Ssh, target.id()),
        ActiveTarget::Wsl(_) => OperationTarget::new(OperationTargetKind::Wsl, target.id()),
    }
}

fn target_kind_name(target: &ActiveTarget) -> &'static str {
    match target.kind() {
        TargetKind::Local => "local",
        TargetKind::Ssh => "ssh",
        TargetKind::Wsl => "wsl",
    }
}

fn reviewed_failure(definition: OperationDefinition, ipc: IpcError) -> ReviewedFailure {
    let code = crate::ipc_error::REVIEWED_IPC_ERROR_CODES
        .iter()
        .copied()
        .find(|code| *code == ipc.safe_code())
        .unwrap_or("internal.unexpected");
    let message = crate::ipc_error::public_message_for_code(code)
        .unwrap_or("The operation failed. See runtime logs for details.");
    ReviewedFailure::new(ReviewedDiagnostic::new(
        code,
        definition.category().as_str(),
        definition.default_phase(),
        message,
        ipc.retryable,
    ))
}

#[tauri::command]
pub async fn get_portable_bundle_export_summary(
    state: State<'_, AppState>,
) -> crate::ipc_error::IpcResult<PortableBundleExportSummary> {
    crate::ipc_boundary!(
        "get_portable_bundle_export_summary",
        async move {
            let request_context = state
                .resolve_target_context()
                .await
                .map_err(IpcError::from)?;
            let kind = target_kind_name(request_context.target());
            export_summary(request_context.db(), kind)
                .await
                .map_err(|error| {
                    tracing::warn!(code = error.code(), "portable bundle summary failed");
                    error.to_ipc_error()
                })
        }
        .await
    )
}

#[tauri::command]
pub async fn export_portable_bundle(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    path: String,
) -> crate::ipc_error::IpcResult<PortableBundleExportResult> {
    crate::ipc_boundary!(
        "export_portable_bundle",
        async move {
            let request_context = state
                .resolve_target_context()
                .await
                .map_err(IpcError::from)?;
            let active_target = request_context.target().clone();
            let pool = request_context.db().clone();
            let definition = operation_definition("export_portable_bundle");
            let lease = state
                .portable_state_jobs
                .acquire(&job_id)
                .map_err(IpcError::from_display)?;
            crate::observability::run_operation(
                &state,
                definition,
                OperationContext::new(operation_target(&active_target)),
                |result: &PortableBundleExportResult| {
                    let base = if result.skipped_skills.is_empty() {
                        SafeOperationResult::succeeded("Exported portable SkillPort bundle.")
                    } else {
                        SafeOperationResult::partial(
                            "Exported portable SkillPort bundle with skipped skills.",
                        )
                    };
                    base.count(SafeDetailKey::SucceededCount, result.skills_exported as u64)
                        .count(
                            SafeDetailKey::SkippedCount,
                            result.skipped_skills.len() as u64,
                        )
                },
                || async move {
                    let job = BundleJob {
                        job_id: lease.job_id(),
                        app: Some(&app),
                        cancel: Some(lease.cancel_flag()),
                    };
                    let result = async {
                        let fs = CentralFs::from_active_target(active_target.clone()).await?;
                        export_bundle(
                            &pool,
                            &fs,
                            target_kind_name(&active_target),
                            PathBuf::from(path),
                            job,
                        )
                        .await
                    }
                    .await;
                    if let Err(error) = &result {
                        log_job_failure(job, PortableBundlePhase::Export, error);
                    }
                    result.map_err(|error| reviewed_failure(definition, error.to_ipc_error()))
                },
            )
            .await
        }
        .await
    )
}

fn log_job_failure(job: BundleJob<'_>, phase: PortableBundlePhase, error: &PortableBundleError) {
    tracing::warn!(code = error.code(), "portable bundle job failed");
    let status = if matches!(error, PortableBundleError::Cancelled) {
        PortableBundleJobStatus::Cancelled
    } else {
        PortableBundleJobStatus::Failed
    };
    job.emit(phase, status, 0, 0, None);
}

#[tauri::command]
pub async fn preview_portable_bundle_import(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    path: String,
) -> crate::ipc_error::IpcResult<PortableBundleImportPreview> {
    crate::ipc_boundary!(
        "preview_portable_bundle_import",
        async move {
            let request_context = state
                .resolve_target_context()
                .await
                .map_err(IpcError::from)?;
            let active_target = request_context.target().clone();
            let pool = request_context.db().clone();
            let definition = operation_definition("preview_portable_bundle_import");
            let lease = state
                .portable_state_jobs
                .acquire(&job_id)
                .map_err(IpcError::from_display)?;
            crate::observability::run_operation(
                &state,
                definition,
                OperationContext::new(operation_target(&active_target)),
                |preview: &PortableBundleImportPreview| {
                    SafeOperationResult::succeeded("Previewed portable SkillPort bundle.")
                        .count(SafeDetailKey::AffectedCount, preview.skills.len() as u64)
                },
                || async move {
                    let job = BundleJob {
                        job_id: lease.job_id(),
                        app: Some(&app),
                        cancel: Some(lease.cancel_flag()),
                    };
                    let result = async {
                        let fs = CentralFs::from_active_target(active_target.clone()).await?;
                        preview_import(
                            &pool,
                            &fs,
                            active_target.id(),
                            PathBuf::from(path),
                            preview_cache(),
                            job,
                        )
                        .await
                    }
                    .await;
                    if let Err(error) = &result {
                        log_job_failure(job, PortableBundlePhase::Inspect, error);
                    }
                    result.map_err(|error| reviewed_failure(definition, error.to_ipc_error()))
                },
            )
            .await
        }
        .await
    )
}

#[tauri::command]
pub async fn apply_portable_bundle_import(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    preview_token: String,
    decisions: Vec<PortableBundleDecision>,
) -> crate::ipc_error::IpcResult<PortableBundleImportResult> {
    crate::ipc_boundary!(
        "apply_portable_bundle_import",
        async move {
            let request_context = state
                .resolve_target_context()
                .await
                .map_err(IpcError::from)?;
            let active_target = request_context.target().clone();
            let pool = request_context.db().clone();
            let definition = operation_definition("apply_portable_bundle_import");
            let lease = state
                .portable_state_jobs
                .acquire(&job_id)
                .map_err(IpcError::from_display)?;
            crate::observability::run_operation(
                &state,
                definition,
                OperationContext::new(operation_target(&active_target)),
                |result: &PortableBundleImportResult| {
                    let written =
                        result.imported.len() + result.overwritten.len() + result.renamed.len();
                    let base = if result.cancelled {
                        SafeOperationResult::partial("Portable bundle import was cancelled.")
                    } else if result.failed.is_empty() {
                        SafeOperationResult::succeeded("Imported portable SkillPort bundle.")
                    } else {
                        SafeOperationResult::partial(
                            "Imported portable SkillPort bundle with failed skills.",
                        )
                    };
                    base.count(SafeDetailKey::SucceededCount, written as u64)
                        .count(SafeDetailKey::SkippedCount, result.skipped.len() as u64)
                        .count(SafeDetailKey::FailedCount, result.failed.len() as u64)
                },
                || async move {
                    let job = BundleJob {
                        job_id: lease.job_id(),
                        app: Some(&app),
                        cancel: Some(lease.cancel_flag()),
                    };
                    let result = async {
                        let fs = CentralFs::from_active_target(active_target.clone()).await?;
                        apply_import(
                            &pool,
                            &fs,
                            active_target.id(),
                            &preview_token,
                            &decisions,
                            preview_cache(),
                            job,
                        )
                        .await
                    }
                    .await;
                    if let Err(error) = &result {
                        log_job_failure(job, PortableBundlePhase::Apply, error);
                    }
                    result.map_err(|error| reviewed_failure(definition, error.to_ipc_error()))
                },
            )
            .await
        }
        .await
    )
}

#[tauri::command]
pub async fn discard_portable_bundle_preview(
    preview_token: String,
) -> crate::ipc_error::IpcResult<()> {
    crate::ipc_boundary!(
        "discard_portable_bundle_preview",
        async move {
            preview_cache().discard(&preview_token);
            Ok::<(), IpcError>(())
        }
        .await
    )
}

#[tauri::command]
pub async fn cancel_portable_bundle_job(
    state: State<'_, AppState>,
    job_id: String,
) -> crate::ipc_error::IpcResult<()> {
    crate::ipc_boundary!(
        "cancel_portable_bundle_job",
        async move {
            let definition = operation_definition("cancel_portable_bundle_job");
            crate::observability::run_operation(
                &state,
                definition,
                OperationContext::new(OperationTarget::local()),
                |changed: &bool| {
                    SafeOperationResult::succeeded("Requested portable bundle cancellation.")
                        .flag(SafeDetailKey::Changed, *changed)
                },
                || async {
                    state.portable_state_jobs.cancel(&job_id).map_err(|error| {
                        reviewed_failure(definition, IpcError::from_display(error))
                    })
                },
            )
            .await
            .map(|_| ())
        }
        .await
    )
}
