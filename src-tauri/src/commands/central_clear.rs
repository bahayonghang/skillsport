//! Tauri IPC shells for Central clear-all.
//!
//! Business logic lives in `crate::services::central_skills` (clear_all).
//! These shells resolve one `TargetContext`, own the `central_clear` job
//! lease, forward progress events, and record one Operation Log entry that
//! contains only the target kind and counts.

use tauri::{AppHandle, Emitter, State};

use crate::ipc_error::IpcError;
use crate::observability::{
    CommandLogPolicy, OperationContext, OperationDefinition, OperationTarget, OperationTargetKind,
    ReviewedDiagnostic, ReviewedFailure, SafeDetailKey, SafeOperationResult,
};
use crate::services::central_skills::{
    self, CentralSkillsError, ClearCentralPreview, ClearCentralProgress, ClearCentralRequest,
    ClearCentralResult, ClearJob, CENTRAL_CLEAR_PROGRESS_EVENT,
};
use crate::targets::ActiveTarget;
use crate::AppState;

fn operation_definition(command: &'static str) -> OperationDefinition {
    match crate::ipc_registry::command_policy(command)
        .expect("Central clear command must be registered")
        .policy
    {
        CommandLogPolicy::Operation(definition) => definition,
        _ => unreachable!("Central clear command must have an operation policy"),
    }
}

fn audit_target(target: &ActiveTarget) -> OperationTarget {
    match target {
        ActiveTarget::Local => OperationTarget::local(),
        ActiveTarget::Ssh(target) => OperationTarget::new(OperationTargetKind::Ssh, &target.id),
        ActiveTarget::Wsl(target) => OperationTarget::new(OperationTargetKind::Wsl, &target.id),
    }
}

fn bounded_count(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

fn is_mutation_lock_failure(error: &CentralSkillsError) -> bool {
    matches!(error, CentralSkillsError::CentralMutation(_))
}

pub(crate) fn clear_command_error(error: CentralSkillsError) -> String {
    if is_mutation_lock_failure(&error) {
        format!(
            "central_skills.mutation_lock_failed:{}",
            error.public_delete_message()
        )
    } else {
        format!(
            "central.clear_failed:{}",
            crate::ipc_error::public_message_for_code("central.clear_failed")
                .unwrap_or("Central skills could not be cleared.")
        )
    }
}

pub(crate) fn reviewed_clear_failure(
    definition: OperationDefinition,
    error: &CentralSkillsError,
) -> ReviewedFailure {
    let diagnostic = if is_mutation_lock_failure(error) {
        ReviewedDiagnostic::new(
            "central_skills.mutation_lock_failed",
            "central_skills.central_mutation",
            definition.default_phase(),
            "This Central operation could not acquire the mutation lock.",
            true,
        )
    } else {
        ReviewedDiagnostic::new(
            "central.clear_failed",
            "central_skills.clear_all",
            definition.default_phase(),
            "Central skills could not be cleared.",
            matches!(error, CentralSkillsError::Remote(_)),
        )
    };
    ReviewedFailure::new(diagnostic)
}

pub(crate) fn clear_audit_result(result: &ClearCentralResult) -> SafeOperationResult {
    let audit = if result.cancelled {
        SafeOperationResult::cancelled("Central clear-all cancelled.")
    } else if result.failed_count() > 0 {
        SafeOperationResult::partial("Central clear-all partially completed.")
    } else {
        SafeOperationResult::succeeded("Central clear-all completed.")
    };
    audit
        .count(
            SafeDetailKey::RequestedCount,
            bounded_count(result.succeeded_count() + result.failed_count()),
        )
        .count(
            SafeDetailKey::SucceededCount,
            bounded_count(result.succeeded_count()),
        )
        .count(
            SafeDetailKey::FailedCount,
            bounded_count(result.failed_count()),
        )
        .count(
            SafeDetailKey::SkippedCount,
            bounded_count(result.skipped_changed),
        )
        .count(
            SafeDetailKey::AffectedCount,
            bounded_count(result.skills.succeeded.len()),
        )
        .stable(SafeDetailKey::Scope, "central_clear_all")
}

#[tauri::command]
pub async fn preview_clear_central_skills(
    state: State<'_, AppState>,
) -> crate::ipc_error::IpcResult<ClearCentralPreview> {
    crate::ipc_boundary!(
        "preview_clear_central_skills",
        async move {
            let request_context = state.resolve_target_context().await?;
            let pool = request_context.db().clone();
            let active_target = request_context.target().clone();
            central_skills::preview_clear_central_skills_impl(&pool, &active_target)
                .await
                .map_err(clear_command_error)
        }
        .await
    )
}

#[tauri::command]
pub async fn clear_central_skills(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    request: ClearCentralRequest,
) -> crate::ipc_error::IpcResult<ClearCentralResult> {
    crate::ipc_boundary!(
        "clear_central_skills",
        async move {
            let lease = state
                .central_clear_jobs
                .acquire(&job_id)
                .map_err(IpcError::from_display)?;
            let request_context = state
                .resolve_target_context()
                .await
                .map_err(IpcError::from)?;
            let active_target = request_context.target().clone();
            let pool = request_context.db().clone();
            let definition = operation_definition("clear_central_skills");
            crate::observability::run_operation(
                &state,
                definition,
                OperationContext::new(audit_target(&active_target)),
                clear_audit_result,
                || async {
                    let emit = |payload: ClearCentralProgress| {
                        let _ = app.emit(CENTRAL_CLEAR_PROGRESS_EVENT, payload);
                    };
                    let job = ClearJob {
                        job_id: lease.job_id(),
                        cancel: lease.cancel_flag(),
                        progress: &emit,
                    };
                    central_skills::clear_central_skills_impl(&pool, &active_target, &request, job)
                        .await
                        .map_err(|error| {
                            tracing::warn!(
                                code = error.stable_delete_error_code().as_str(),
                                "Central clear-all failed"
                            );
                            reviewed_clear_failure(definition, &error)
                        })
                },
            )
            .await
        }
        .await
    )
}

#[tauri::command]
pub async fn cancel_central_clear(
    state: State<'_, AppState>,
    job_id: String,
) -> crate::ipc_error::IpcResult<bool> {
    crate::ipc_boundary!(
        "cancel_central_clear",
        async move {
            let definition = operation_definition("cancel_central_clear");
            crate::observability::run_operation(
                &state,
                definition,
                OperationContext::new(OperationTarget::local()),
                |changed: &bool| {
                    SafeOperationResult::succeeded("Requested Central clear-all cancellation.")
                        .flag(SafeDetailKey::Changed, *changed)
                },
                || async {
                    state.central_clear_jobs.cancel(&job_id).map_err(|error| {
                        let ipc = IpcError::from_display(error);
                        let code = crate::ipc_error::REVIEWED_IPC_ERROR_CODES
                            .iter()
                            .copied()
                            .find(|code| *code == ipc.safe_code())
                            .unwrap_or("internal.unexpected");
                        ReviewedFailure::new(ReviewedDiagnostic::new(
                            code,
                            definition.category().as_str(),
                            definition.default_phase(),
                            crate::ipc_error::public_message_for_code(code)
                                .unwrap_or("The operation failed. See runtime logs for details."),
                            ipc.retryable,
                        ))
                    })
                },
            )
            .await
        }
        .await
    )
}

#[cfg(test)]
#[path = "central_clear_tests.rs"]
mod tests;
