use super::*;
use crate::db::{self, OperationLogFilter};
use crate::observability::OperationLifecycle;
use crate::services::central_skills::{BatchDeleteCentralSkillResult, ClearCentralPathOutcome};
use std::sync::Arc;

fn test_app_state(pool: crate::db::DbPool) -> AppState {
    AppState {
        db: pool,
        ai_tag_jobs: crate::AiTagJobRegistry::default(),
        central_update_jobs: crate::services::exclusive_job::ExclusiveJobRegistry::new(
            "job.central_update_busy",
            "A Central update job is already running.",
        ),
        central_update_snapshots: crate::CentralUpdateSnapshotCache::default(),
        portable_bundle_jobs: crate::services::exclusive_job::ExclusiveJobRegistry::new(
            "job.portability_busy",
            "A portability job is already running.",
        ),
        skills_cli_jobs: crate::services::exclusive_job::ExclusiveJobRegistry::new(
            "job.skills_cli_busy",
            "A Skills CLI job is already running.",
        ),
        central_clear_jobs: crate::services::exclusive_job::ExclusiveJobRegistry::new(
            "job.central_clear_busy",
            "A Central clear job is already running.",
        ),
        secrets: Arc::new(crate::secrets::MockSecretStore::default()),
        targets: crate::targets::TargetRegistry::default(),
    }
}

#[test]
fn clear_commands_have_expected_policies() {
    let source = include_str!("central_clear.rs");
    let production = source.split("#[cfg(test)]").next().unwrap();
    let entry = crate::ipc_registry::command_policy("clear_central_skills").unwrap();
    let CommandLogPolicy::Operation(definition) = entry.policy else {
        panic!("clear_central_skills must have an Operation policy");
    };
    assert_eq!(
        definition.lifecycle(),
        OperationLifecycle::StartedThenTerminal
    );
    let entry = crate::ipc_registry::command_policy("cancel_central_clear").unwrap();
    assert!(matches!(entry.policy, CommandLogPolicy::Operation(_)));
    assert!(matches!(
        crate::ipc_registry::command_policy("preview_clear_central_skills")
            .unwrap()
            .policy,
        CommandLogPolicy::RuntimeOnly(crate::observability::RuntimeOnlyReason::Preview)
    ));
    assert!(production.contains("operation_definition(\"clear_central_skills\")"));
    assert!(!production.contains("OperationLogEvent"));
    assert!(!production.contains(".subject("));
    assert!(!production.contains(".details("));
}

#[test]
fn clear_failures_use_reviewed_codes_without_paths() {
    let definition = operation_definition("clear_central_skills");
    let planted = r"C:\Users\private\.skillsmanage\skills\secret ghp_private_token";
    let failure =
        reviewed_clear_failure(definition, &CentralSkillsError::Remote(planted.to_string()));
    let serialized = format!("{failure:?}");
    assert!(!serialized.contains(planted));
    assert!(serialized.contains("central.clear_failed"));

    let message = clear_command_error(CentralSkillsError::Remote(planted.to_string()));
    assert!(message.starts_with("central.clear_failed:"));
    assert!(!message.contains(planted));
    assert!(crate::ipc_error::REVIEWED_IPC_ERROR_CODES.contains(&"central.clear_failed"));
    assert!(crate::ipc_error::REVIEWED_IPC_ERROR_CODES.contains(&"job.central_clear_busy"));
}

#[test]
fn clear_job_family_is_exclusive_and_busy_code_is_stable() {
    let state_registry = crate::services::exclusive_job::ExclusiveJobRegistry::new(
        "job.central_clear_busy",
        "A Central clear job is already running.",
    );
    let lease = state_registry.acquire("clear-a").unwrap();
    let busy = state_registry.acquire("clear-b").err().unwrap().to_string();
    assert!(busy.starts_with("job.central_clear_busy:"));
    assert!(state_registry.cancel("clear-a").unwrap());
    assert!(lease
        .cancel_flag()
        .load(std::sync::atomic::Ordering::SeqCst));
}

#[tokio::test]
async fn clear_operation_log_contains_counts_only() {
    let pool = crate::test_support::mem_pool().await;
    let state = test_app_state(pool.clone());
    let definition = operation_definition("clear_central_skills");
    let planted_path = r"C:\Users\private\.skillsmanage\skills\secret-skill";
    let result = ClearCentralResult {
        skills: BatchDeleteCentralSkillResult {
            succeeded: Vec::new(),
            failed: Vec::new(),
        },
        project_links: ClearCentralPathOutcome::default(),
        orphan_links: ClearCentralPathOutcome {
            removed: 2,
            failed: vec![crate::services::central_skills::ClearCentralPathFailure {
                key: planted_path.to_lowercase(),
                path: planted_path.to_string(),
                error_code: "central_clear.remove_failed".to_string(),
            }],
        },
        untracked_central_entries: ClearCentralPathOutcome::default(),
        recovery: Default::default(),
        skipped_changed: 1,
        cancelled: false,
    };

    crate::observability::run_operation(
        &state,
        definition,
        OperationContext::new(OperationTarget::local()),
        clear_audit_result,
        || async { Ok::<_, ReviewedFailure>(result) },
    )
    .await
    .unwrap();

    let page = db::list_operation_logs(&pool, OperationLogFilter::default())
        .await
        .unwrap();
    assert_eq!(page.entries.len(), 1);
    let entry = &page.entries[0];
    assert_eq!(entry.action, "clear_central_skills");
    assert_eq!(entry.status, "partial");
    let details: serde_json::Value =
        serde_json::from_str(entry.details_json.as_deref().unwrap()).unwrap();
    assert_eq!(details["succeededCount"], 2);
    assert_eq!(details["failedCount"], 1);
    assert_eq!(details["skippedCount"], 1);
    let serialized = serde_json::to_string(entry).unwrap();
    assert!(!serialized.contains("secret-skill"));
    assert!(!serialized.to_lowercase().contains("skillsmanage"));
}
