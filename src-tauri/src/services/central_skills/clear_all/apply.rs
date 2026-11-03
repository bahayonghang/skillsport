//! Locked apply for Central clear-all.
//!
//! Order (one mutation guard, one remote connection):
//! recovery → locked rescan + intersection → project links → skills
//! (journaled batch delete) → untracked Central entries → orphan links →
//! finalize. Cancellation is checked between chunks; committed deletes are
//! never rolled back.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use crate::db::repos::{
    fs_db_operations_repo, pending_additions_repo, projects_repo, update_inventory_repo,
};
use crate::db::DbPool;
use crate::services::central_mutation::{
    acquire_target_mutation_guard, DEFAULT_CENTRAL_MUTATION_TIMEOUT,
};
use crate::targets::{connect_remote_target, ActiveTarget, ConnectedRemoteTarget};

use super::super::delete::{
    delete_central_skills_under_guard, ensure_remote_child_path, public_delete_batch_result,
    recover_selected_pending_operations_under_guard,
};
use super::super::error::CentralSkillsError;
use super::super::types::{
    BatchDeleteCentralSkillRequest, BatchDeleteCentralSkillResult, FailedCentralSkillDelete,
};
use super::candidates::{load_plan, CentralRootRef, ClearPlan, ProjectLinkCandidate, RootDefaults};
use super::progress::{ClearJob, ProgressTracker};
use super::remote::{
    run_remote_remove_entries, run_remote_remove_links, RemoteRemoveStatus, REMOTE_REMOVE_BATCH,
};
use super::sweep::{
    remove_local_link_if_attributable, remove_local_untracked_entry, LocalRemoveOutcome,
};
use super::types::{
    ClearCentralPathFailure, ClearCentralPathItem, ClearCentralPathOutcome, ClearCentralPhase,
    ClearCentralProgressStatus, ClearCentralRecoveryOutcome, ClearCentralRequest,
    ClearCentralResult, CLEAR_ALL_WILDCARD_KEY, CLEAR_ERROR_PATH_OUTSIDE_SCOPE,
    CLEAR_ERROR_REMOVE_FAILED,
};

const SKILL_CHUNK: usize = 25;
const LOCAL_PATH_CHUNK: usize = 64;

/// Per-item outcome normalized across Local and remote removal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ItemOutcome {
    Removed,
    Gone,
    Changed,
    Failed(&'static str),
}

impl From<LocalRemoveOutcome> for ItemOutcome {
    fn from(value: LocalRemoveOutcome) -> Self {
        match value {
            LocalRemoveOutcome::Removed => Self::Removed,
            LocalRemoveOutcome::Gone => Self::Gone,
            LocalRemoveOutcome::Changed => Self::Changed,
            LocalRemoveOutcome::Failed => Self::Failed(CLEAR_ERROR_REMOVE_FAILED),
            LocalRemoveOutcome::OutsideScope => Self::Failed(CLEAR_ERROR_PATH_OUTSIDE_SCOPE),
        }
    }
}

impl From<RemoteRemoveStatus> for ItemOutcome {
    fn from(value: RemoteRemoveStatus) -> Self {
        match value {
            RemoteRemoveStatus::Removed => Self::Removed,
            RemoteRemoveStatus::Gone => Self::Gone,
            RemoteRemoveStatus::Skipped => Self::Changed,
            RemoteRemoveStatus::Failed => Self::Failed(CLEAR_ERROR_REMOVE_FAILED),
        }
    }
}

#[derive(Clone, Copy)]
enum PathKind {
    Link,
    UntrackedEntry,
}

struct ApplyState<'a> {
    tracker: ProgressTracker<'a>,
    job: ClearJob<'a>,
    cancelled: bool,
    skipped_changed: usize,
}

impl ApplyState<'_> {
    fn check_cancel(&mut self) -> bool {
        if !self.cancelled && self.job.is_cancelled() {
            self.cancelled = true;
        }
        self.cancelled
    }
}

/// Select plan items whose key is requested (or all when `"*"` is present).
/// Requested keys absent from the rescanned plan count as skipped.
fn select_by_keys<T: Clone>(
    items: &[T],
    key_of: impl Fn(&T) -> &str,
    requested: &[String],
) -> (Vec<T>, usize) {
    if requested.iter().any(|key| key == CLEAR_ALL_WILDCARD_KEY) {
        return (items.to_vec(), 0);
    }
    let by_key: HashMap<&str, &T> = items.iter().map(|item| (key_of(item), item)).collect();
    let mut selected = Vec::new();
    let mut seen = HashSet::new();
    let mut skipped = 0;
    for key in requested {
        if !seen.insert(key.as_str()) {
            continue;
        }
        match by_key.get(key.as_str()) {
            Some(item) => selected.push((*item).clone()),
            None => skipped += 1,
        }
    }
    (selected, skipped)
}

pub(super) async fn apply_clear(
    pool: &DbPool,
    target: &ActiveTarget,
    injected_remote: Option<Arc<ConnectedRemoteTarget>>,
    request: &ClearCentralRequest,
    job: ClearJob<'_>,
    defaults: &RootDefaults,
) -> Result<ClearCentralResult, CentralSkillsError> {
    if let Some(connection) = injected_remote.as_ref() {
        if connection.target_id() != target.id()
            || connection.active_target().kind() != target.kind()
        {
            return Err(CentralSkillsError::Remote(
                "Selected target connection identity mismatch.".to_string(),
            ));
        }
    }
    let mut state = ApplyState {
        tracker: ProgressTracker::new(job, 0),
        job,
        cancelled: false,
        skipped_changed: 0,
    };
    let result = apply_locked(pool, target, injected_remote, request, defaults, &mut state).await;
    match &result {
        Ok(result) if result.cancelled => {
            state.tracker.finish(ClearCentralProgressStatus::Cancelled)
        }
        Ok(_) => state.tracker.finish(ClearCentralProgressStatus::Completed),
        Err(_) => state.tracker.finish(ClearCentralProgressStatus::Failed),
    }
    result
}

async fn apply_locked(
    pool: &DbPool,
    target: &ActiveTarget,
    injected_remote: Option<Arc<ConnectedRemoteTarget>>,
    request: &ClearCentralRequest,
    defaults: &RootDefaults,
    state: &mut ApplyState<'_>,
) -> Result<ClearCentralResult, CentralSkillsError> {
    let _mutation_guard = acquire_target_mutation_guard(
        target,
        "clear all Central skills",
        DEFAULT_CENTRAL_MUTATION_TIMEOUT,
    )
    .await?;
    let remote = match injected_remote {
        Some(connection) => Some(connection),
        None if target.is_remote_like() => Some(Arc::new(
            connect_remote_target(target).await.map_err(|_| {
                CentralSkillsError::Remote("Failed to connect to the selected target.".to_string())
            })?,
        )),
        None => None,
    };

    // 1. Recover every pending journal row of this target.
    let mut pending_skill_ids = Vec::new();
    for row in fs_db_operations_repo::list_pending_fs_db_operations(pool, target.id()).await? {
        if !pending_skill_ids.contains(&row.skill_id) {
            pending_skill_ids.push(row.skill_id);
        }
    }
    state.tracker.set_total(pending_skill_ids.len());
    state.tracker.start_phase(ClearCentralPhase::Recovery);
    let recovery_failures = if pending_skill_ids.is_empty() {
        HashMap::new()
    } else {
        recover_selected_pending_operations_under_guard(
            pool,
            target,
            remote.as_ref(),
            &pending_skill_ids,
        )
        .await?
    };
    let recovery = ClearCentralRecoveryOutcome {
        recovered: pending_skill_ids.len() - recovery_failures.len(),
        failed: recovery_failures.len(),
    };
    let mut skills = BatchDeleteCentralSkillResult {
        succeeded: Vec::new(),
        failed: Vec::new(),
    };
    let mut recovery_failed_ids = HashSet::new();
    let mut recovery_failures = recovery_failures.into_iter().collect::<Vec<_>>();
    recovery_failures.sort_by(|left, right| left.0.cmp(&right.0));
    for (skill_id, failure) in recovery_failures {
        recovery_failed_ids.insert(skill_id.clone());
        skills.failed.push(FailedCentralSkillDelete::from_error(
            skill_id,
            failure.phase,
            &failure.error,
        ));
    }
    state.tracker.advance(pending_skill_ids.len());

    // 2. Locked rescan; delete only "rescanned ∩ requested".
    let plan = load_plan(pool, target, remote.as_deref(), defaults).await?;
    let plan_skill_ids = plan
        .skill_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut skill_ids = Vec::new();
    let mut seen = HashSet::new();
    for skill_id in &request.skill_ids {
        if !seen.insert(skill_id.as_str()) || recovery_failed_ids.contains(skill_id) {
            continue;
        }
        if plan_skill_ids.contains(skill_id.as_str()) {
            skill_ids.push(skill_id.clone());
        } else {
            state.skipped_changed += 1;
        }
    }
    let (project_links, skipped) = select_by_keys(
        &plan.project_links,
        |item: &ProjectLinkCandidate| item.item.key.as_str(),
        &request.project_link_keys,
    );
    state.skipped_changed += skipped;
    let (untracked, skipped) = select_by_keys(
        &plan.untracked,
        |item: &ClearCentralPathItem| item.key.as_str(),
        &request.untracked_entry_keys,
    );
    state.skipped_changed += skipped;
    let (orphans, skipped) = select_by_keys(
        &plan.orphan_links,
        |item: &ClearCentralPathItem| item.key.as_str(),
        &request.orphan_link_keys,
    );
    state.skipped_changed += skipped;
    state.tracker.set_total(
        state.tracker.completed()
            + project_links.len()
            + skill_ids.len()
            + untracked.len()
            + orphans.len(),
    );

    // 3. Project links (before skills, so no known project link points at a
    //    Central directory while it is removed).
    let project_outcome = if state.check_cancel() {
        ClearCentralPathOutcome::default()
    } else {
        state.tracker.start_phase(ClearCentralPhase::ProjectLinks);
        clear_project_links(pool, &plan, remote.as_deref(), &project_links, state).await?
    };

    // 4. Skills through the journaled batch delete (no second lock).
    if !state.check_cancel() && !skill_ids.is_empty() {
        state.tracker.start_phase(ClearCentralPhase::Skills);
        let remove_copy = request
            .remove_copy_agent_ids
            .iter()
            .map(String::as_str)
            .collect::<HashSet<_>>();
        let batch_id = uuid::Uuid::new_v4().to_string();
        for chunk in skill_ids.chunks(SKILL_CHUNK) {
            if state.check_cancel() {
                break;
            }
            let requests = delete_requests(&plan, chunk, &remove_copy);
            let outcomes = delete_central_skills_under_guard(
                pool,
                target,
                requests,
                Some(&batch_id),
                remote.as_ref(),
            )
            .await?;
            let chunk_result = public_delete_batch_result(outcomes);
            skills.succeeded.extend(chunk_result.succeeded);
            skills.failed.extend(chunk_result.failed);
            state.tracker.advance(chunk.len());
        }
    }

    // 5. Untracked Central entries.
    let untracked_outcome = if state.check_cancel() {
        ClearCentralPathOutcome::default()
    } else {
        state.tracker.start_phase(ClearCentralPhase::Untracked);
        let items = untracked.iter().collect::<Vec<_>>();
        clear_paths(
            &plan,
            remote.as_deref(),
            &items,
            PathKind::UntrackedEntry,
            state,
        )
        .await?
    };

    // 6. Orphan links (only those found by this rescan).
    let orphan_outcome = if state.check_cancel() {
        ClearCentralPathOutcome::default()
    } else {
        state.tracker.start_phase(ClearCentralPhase::OrphanLinks);
        let items = orphans.iter().collect::<Vec<_>>();
        clear_paths(&plan, remote.as_deref(), &items, PathKind::Link, state).await?
    };

    // 7. Finalize: stale update inventory must not resurrect deleted ids.
    state.tracker.start_phase(ClearCentralPhase::Finalize);
    if !skills.succeeded.is_empty() {
        update_inventory_repo::clear_all_skill_update_inventory(pool).await?;
        pending_additions_repo::clear_pending_additions(pool).await?;
    }

    Ok(ClearCentralResult {
        skills,
        project_links: project_outcome,
        orphan_links: orphan_outcome,
        untracked_central_entries: untracked_outcome,
        recovery,
        skipped_changed: state.skipped_changed,
        cancelled: state.cancelled,
    })
}

fn delete_requests(
    plan: &ClearPlan,
    skill_ids: &[String],
    remove_copy_agent_ids: &HashSet<&str>,
) -> Vec<BatchDeleteCentralSkillRequest> {
    skill_ids
        .iter()
        .map(|skill_id| {
            let mut remove_agent_ids: Vec<String> = Vec::new();
            for installation in plan.installations.get(skill_id).into_iter().flatten() {
                if installation.link_type == "copy"
                    && remove_copy_agent_ids.contains(installation.agent_id.as_str())
                    && !remove_agent_ids.contains(&installation.agent_id)
                {
                    remove_agent_ids.push(installation.agent_id.clone());
                }
            }
            BatchDeleteCentralSkillRequest {
                skill_id: skill_id.clone(),
                remove_agent_ids,
                force: false,
            }
        })
        .collect()
}

fn record(
    outcome: &mut ClearCentralPathOutcome,
    item: &ClearCentralPathItem,
    result: ItemOutcome,
    gone_counts_as_removed: bool,
    skipped_changed: &mut usize,
) {
    match result {
        ItemOutcome::Removed => outcome.removed += 1,
        ItemOutcome::Gone if gone_counts_as_removed => outcome.removed += 1,
        ItemOutcome::Gone | ItemOutcome::Changed => *skipped_changed += 1,
        ItemOutcome::Failed(code) => outcome.failed.push(ClearCentralPathFailure {
            key: item.key.clone(),
            path: item.path.clone(),
            error_code: code.to_string(),
        }),
    }
}

async fn clear_project_links(
    pool: &DbPool,
    plan: &ClearPlan,
    remote: Option<&ConnectedRemoteTarget>,
    candidates: &[ProjectLinkCandidate],
    state: &mut ApplyState<'_>,
) -> Result<ClearCentralPathOutcome, CentralSkillsError> {
    let mut outcome = ClearCentralPathOutcome::default();
    let mut psi_keys = Vec::new();
    let chunk_size = if remote.is_some() {
        REMOTE_REMOVE_BATCH
    } else {
        LOCAL_PATH_CHUNK
    };
    for chunk in candidates.chunks(chunk_size) {
        if state.check_cancel() {
            break;
        }
        let items = chunk
            .iter()
            .map(|candidate| &candidate.item)
            .collect::<Vec<_>>();
        let results = remove_paths(plan, remote, &items, PathKind::Link).await?;
        for (candidate, result) in chunk.iter().zip(results) {
            if matches!(result, ItemOutcome::Removed | ItemOutcome::Gone) {
                psi_keys.push((
                    candidate.project_id.clone(),
                    candidate.skill_id.clone(),
                    candidate.agent_id.clone(),
                ));
            }
            record(
                &mut outcome,
                &candidate.item,
                result,
                true,
                &mut state.skipped_changed,
            );
        }
        state.tracker.advance(chunk.len());
    }
    projects_repo::delete_project_skill_installations_batch(pool, &psi_keys).await?;
    Ok(outcome)
}

async fn clear_paths(
    plan: &ClearPlan,
    remote: Option<&ConnectedRemoteTarget>,
    items: &[&ClearCentralPathItem],
    kind: PathKind,
    state: &mut ApplyState<'_>,
) -> Result<ClearCentralPathOutcome, CentralSkillsError> {
    let mut outcome = ClearCentralPathOutcome::default();
    let chunk_size = if remote.is_some() {
        REMOTE_REMOVE_BATCH
    } else {
        LOCAL_PATH_CHUNK
    };
    for chunk in items.chunks(chunk_size) {
        if state.check_cancel() {
            break;
        }
        let results = remove_paths(plan, remote, chunk, kind).await?;
        for (item, result) in chunk.iter().zip(results) {
            record(
                &mut outcome,
                item,
                result,
                false,
                &mut state.skipped_changed,
            );
        }
        state.tracker.advance(chunk.len());
    }
    Ok(outcome)
}

async fn remove_paths(
    plan: &ClearPlan,
    remote: Option<&ConnectedRemoteTarget>,
    items: &[&ClearCentralPathItem],
    kind: PathKind,
) -> Result<Vec<ItemOutcome>, CentralSkillsError> {
    match (&plan.central_root, remote) {
        (CentralRootRef::Local(central_root), _) => {
            let paths = items
                .iter()
                .map(|item| PathBuf::from(&item.path))
                .collect::<Vec<_>>();
            let root_keys = plan.root_keys.clone();
            let central_root = central_root.clone();
            let skill_dir_keys = plan.central_skill_dir_keys.clone();
            crate::fs_util::run_blocking_fs_with(
                "Central clear-all removal",
                move || {
                    Ok(paths
                        .iter()
                        .map(|path| match kind {
                            PathKind::Link => {
                                remove_local_link_if_attributable(path, &root_keys).into()
                            }
                            PathKind::UntrackedEntry => {
                                remove_local_untracked_entry(&central_root, path, &skill_dir_keys)
                                    .into()
                            }
                        })
                        .collect())
                },
                CentralSkillsError::task_join,
            )
            .await
        }
        (CentralRootRef::Remote(central_root), Some(connection)) => {
            let mut results =
                vec![ItemOutcome::Failed(CLEAR_ERROR_PATH_OUTSIDE_SCOPE); items.len()];
            let mut indexes = Vec::new();
            match kind {
                PathKind::Link => {
                    // Each link is removed only if its raw target still equals
                    // the value captured by this locked rescan.
                    let mut pairs = Vec::new();
                    for (index, item) in items.iter().enumerate() {
                        match plan.remote_link_targets.get(&item.key) {
                            Some(target) => {
                                indexes.push(index);
                                pairs.push((item.path.clone(), target.clone()));
                            }
                            None => results[index] = ItemOutcome::Changed,
                        }
                    }
                    let statuses = run_remote_remove_links(connection, &pairs).await?;
                    for (index, status) in indexes.into_iter().zip(statuses) {
                        results[index] = status.into();
                    }
                }
                PathKind::UntrackedEntry => {
                    let mut paths = Vec::new();
                    for (index, item) in items.iter().enumerate() {
                        let valid = ensure_remote_child_path(central_root, &item.path, "central")
                            .is_ok_and(|path| {
                                crate::targets::remote_parent(&path).as_deref()
                                    == Some(central_root.as_str())
                                    && !plan.central_skill_dir_keys.contains(&path)
                            });
                        if valid {
                            indexes.push(index);
                            paths.push(item.path.clone());
                        }
                    }
                    let statuses = run_remote_remove_entries(connection, &paths).await?;
                    for (index, status) in indexes.into_iter().zip(statuses) {
                        results[index] = status.into();
                    }
                }
            }
            Ok(results)
        }
        (CentralRootRef::Remote(_), None) => Err(CentralSkillsError::Remote(
            "Failed to connect to the selected target.".to_string(),
        )),
    }
}
