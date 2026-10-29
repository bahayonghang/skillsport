//! Tauri IPC shells for SkillPort portable bundles (format v2).
//!
//! Business logic lives in `crate::services::portable_bundle`. The renderer
//! only passes a destination path and a job id; the manifest and skill bytes
//! never cross the IPC boundary. Errors use the reviewed
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
    export_bundle, export_summary, BundleJob, PortableBundleError, PortableBundleExportResult,
    PortableBundleExportSummary, PortableBundleJobStatus, PortableBundlePhase,
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
                    tracing::warn!(code = error.code(), %error, "portable bundle summary failed");
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
                        tracing::warn!(code = error.code(), %error, "portable bundle export failed");
                        let status = if matches!(error, PortableBundleError::Cancelled) {
                            PortableBundleJobStatus::Cancelled
                        } else {
                            PortableBundleJobStatus::Failed
                        };
                        job.emit(PortableBundlePhase::Export, status, 0, 0, None);
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
