//! Central clear-all: remove every Central skill of the current target plus
//! SkillPort-owned leftovers (project links, orphan links into Central,
//! untracked Central entries).
//!
//! Preview takes no mutation lock and writes nothing. Apply takes the target
//! mutation guard once, recovers all pending journal rows, rescans under the
//! guard, and deletes only "rescanned ∩ requested" items. Skill deletion
//! reuses the journaled batch delete without re-acquiring the guard. Contract:
//! `.trellis/spec/backend/central-clear-all.md`.

mod apply;
mod candidates;
mod progress;
mod remote;
mod sweep;
mod types;

#[cfg(test)]
mod perf_tests;
#[cfg(test)]
mod tests;

#[cfg(test)]
use std::sync::Arc;

use crate::db::repos::fs_db_operations_repo;
use crate::db::DbPool;
use crate::targets::{connect_remote_target, ActiveTarget, ConnectedRemoteTarget, TargetKind};

use super::error::CentralSkillsError;
use candidates::{load_plan, RootDefaults};

pub use progress::{ClearJob, ClearProgressSink};
use types::CLEAR_PREVIEW_PATH_LIMIT;
pub use types::{
    ClearCentralAgentSummary, ClearCentralOwnerKind, ClearCentralPathFailure, ClearCentralPathItem,
    ClearCentralPathOutcome, ClearCentralPhase, ClearCentralPreview, ClearCentralProgress,
    ClearCentralProgressStatus, ClearCentralRecoveryOutcome, ClearCentralRequest,
    ClearCentralResult, ClearCentralSweepWarning, CENTRAL_CLEAR_PROGRESS_EVENT,
    CLEAR_ALL_WILDCARD_KEY,
};

fn target_kind_name(target: &ActiveTarget) -> &'static str {
    match target.kind() {
        TargetKind::Local => "local",
        TargetKind::Ssh => "ssh",
        TargetKind::Wsl => "wsl",
    }
}

fn truncate<T>(items: &mut Vec<T>) -> bool {
    if items.len() > CLEAR_PREVIEW_PATH_LIMIT {
        items.truncate(CLEAR_PREVIEW_PATH_LIMIT);
        true
    } else {
        false
    }
}

pub async fn preview_clear_central_skills_impl(
    pool: &DbPool,
    target: &ActiveTarget,
) -> Result<ClearCentralPreview, CentralSkillsError> {
    let remote = if target.is_remote_like() {
        Some(connect_remote_target(target).await.map_err(|_| {
            CentralSkillsError::Remote("Failed to connect to the selected target.".to_string())
        })?)
    } else {
        None
    };
    preview_with(pool, target, remote.as_ref(), &RootDefaults::default()).await
}

async fn preview_with(
    pool: &DbPool,
    target: &ActiveTarget,
    remote: Option<&ConnectedRemoteTarget>,
    defaults: &RootDefaults,
) -> Result<ClearCentralPreview, CentralSkillsError> {
    let plan = load_plan(pool, target, remote, defaults).await?;
    let pending_recovery_count =
        fs_db_operations_repo::list_pending_fs_db_operations(pool, target.id())
            .await?
            .len();
    let agent_summaries = plan.agent_summaries();
    let central_root = plan.central_root_display();
    let project_link_count = plan.project_links.len();
    let orphan_link_count = plan.orphan_links.len();
    let untracked_central_entry_count = plan.untracked.len();
    let mut project_links = plan
        .project_links
        .into_iter()
        .map(|candidate| candidate.item)
        .collect::<Vec<_>>();
    let mut orphan_links = plan.orphan_links;
    let mut untracked = plan.untracked;
    let truncated =
        truncate(&mut project_links) | truncate(&mut orphan_links) | truncate(&mut untracked);
    Ok(ClearCentralPreview {
        preview_id: uuid::Uuid::new_v4().to_string(),
        target_kind: target_kind_name(target).to_string(),
        central_root,
        skill_ids: plan.skill_ids,
        skill_preview_failed: plan.skill_preview_failed,
        agent_summaries,
        project_links,
        orphan_links,
        untracked_central_entries: untracked,
        project_link_count,
        orphan_link_count,
        untracked_central_entry_count,
        skipped_unmanaged_count: plan.skipped_unmanaged,
        pending_recovery_count,
        sweep_warnings: plan.warnings,
        truncated,
    })
}

pub async fn clear_central_skills_impl(
    pool: &DbPool,
    target: &ActiveTarget,
    request: &ClearCentralRequest,
    job: ClearJob<'_>,
) -> Result<ClearCentralResult, CentralSkillsError> {
    apply::apply_clear(pool, target, None, request, job, &RootDefaults::default()).await
}

#[cfg(test)]
async fn clear_with_for_tests(
    pool: &DbPool,
    target: &ActiveTarget,
    remote: Option<Arc<ConnectedRemoteTarget>>,
    request: &ClearCentralRequest,
    job: ClearJob<'_>,
    defaults: &RootDefaults,
) -> Result<ClearCentralResult, CentralSkillsError> {
    apply::apply_clear(pool, target, remote, request, job, defaults).await
}
