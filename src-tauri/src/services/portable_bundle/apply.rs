//! Import apply: preview token + decisions → journaled Central writes →
//! provenance → metadata merge.
//!
//! Every decision is validated before the first write. Skill content goes
//! through `journaled_bundle_content_upsert`, which owns locking, staging,
//! backup/swap, the DB/provenance transaction, and rollback on Local, SSH,
//! and WSL. Cancellation is checked between batches: finished skills stay,
//! the in-flight batch rolls back unstarted items, the rest are skipped.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Arc;

use chrono::Utc;

use crate::db::{DbPool, Skill};
use crate::fs_util::run_blocking_fs_with;
use crate::services::central_updates::{
    content_digest_of, journaled_bundle_content_upsert, normalize_repo_path, BundleContentUpsert,
    BundleGitHubSource, CentralFs, CentralUpdatesError,
};
use crate::services::local_archive_import::inventory::fingerprint_of;
use crate::services::resource_budget::ResourceBudget;

use super::classify::{central_root, central_target_dir, existing_skill_rows};
use super::collect::is_portable_skill_id;
use super::error::PortableBundleError;
use super::metadata_merge::{apply_metadata, plan_metadata};
use super::preview_cache::PreviewCache;
use super::progress::BundleJob;
use super::reader::{read_bundle_bytes, read_skill_payload};
use super::types::{
    BundleProvenance, BundleSkill, PortableBundleDecision, PortableBundleDecisionAction,
    PortableBundleImportResult, PortableBundleJobStatus, PortableBundlePhase,
    PortableBundleRenamedSkill, PortableBundleSkillIssue, PortableBundleSkillStatus,
};

/// Skills written per journaled batch; also the cancellation granularity.
const APPLY_BATCH_SIZE: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WriteKind {
    Create,
    Overwrite,
    Rename,
}

struct PlannedWrite<'a> {
    skill: &'a BundleSkill,
    final_id: String,
    kind: WriteKind,
}

pub(crate) async fn apply_import(
    pool: &DbPool,
    fs: &CentralFs,
    target_id: &str,
    token: &str,
    decisions: &[PortableBundleDecision],
    cache: &PreviewCache,
    job: BundleJob<'_>,
) -> Result<PortableBundleImportResult, PortableBundleError> {
    let entry = cache.get(token, target_id)?;
    job.emit(
        PortableBundlePhase::Read,
        PortableBundleJobStatus::Running,
        0,
        0,
        None,
    );
    let budget = ResourceBudget::portable_bundle();
    let read_path = entry.path.clone();
    let bytes = run_blocking_fs_with(
        "portable bundle reread",
        move || read_bundle_bytes(&read_path, budget),
        PortableBundleError::task_join,
    )
    .await?;
    if fingerprint_of(&bytes) != entry.fingerprint {
        return Err(PortableBundleError::PreviewStale);
    }
    let bytes = Arc::new(bytes);
    job.check_cancel()?;

    let root = central_root(pool).await?;
    let mut result = PortableBundleImportResult::default();
    let (writes, identical) = resolve_decisions(
        pool,
        fs,
        &root,
        &entry.manifest.skills,
        &entry.statuses,
        decisions,
        &mut result,
    )
    .await?;

    let total = writes.len();
    let mut completed = 0;
    let mut tagged_skills = identical
        .iter()
        .map(|skill| (skill.id.clone(), skill.tag_keys.clone()))
        .collect::<Vec<_>>();
    let mut remaining = writes.into_iter().peekable();
    while remaining.peek().is_some() {
        if job.check_cancel().is_err() {
            result.cancelled = true;
            for write in remaining.by_ref() {
                result.skipped.push(issue(&write.final_id, "cancelled"));
            }
            break;
        }
        let batch = remaining
            .by_ref()
            .take(APPLY_BATCH_SIZE)
            .collect::<Vec<_>>();
        job.emit(
            PortableBundlePhase::Apply,
            PortableBundleJobStatus::Running,
            total,
            completed,
            batch.first().map(|write| write.skill.name.as_str()),
        );
        let inputs = build_inputs(fs, &root, &bytes, &batch).await?;
        let outcomes = journaled_bundle_content_upsert(pool, fs, inputs, job.cancel).await?;
        for (write, outcome) in batch.iter().zip(outcomes) {
            completed += 1;
            match outcome.result {
                Ok(_) => {
                    tagged_skills.push((write.final_id.clone(), write.skill.tag_keys.clone()));
                    match write.kind {
                        WriteKind::Create => result.imported.push(write.final_id.clone()),
                        WriteKind::Overwrite => result.overwritten.push(write.final_id.clone()),
                        WriteKind::Rename => result.renamed.push(PortableBundleRenamedSkill {
                            from: write.skill.id.clone(),
                            to: write.final_id.clone(),
                        }),
                    }
                }
                Err(error) => match error.error() {
                    CentralUpdatesError::BatchCancelled => {
                        result.cancelled = true;
                        result.skipped.push(issue(&write.final_id, "cancelled"));
                    }
                    other => {
                        // Item errors may carry target paths; log only codes.
                        tracing::warn!(
                            code = item_failure_code(other),
                            phase = ?error.phase,
                            "portable bundle skill import failed"
                        );
                        result
                            .failed
                            .push(issue(&write.final_id, item_failure_code(other)));
                    }
                },
            }
        }
    }

    job.emit(
        PortableBundlePhase::Metadata,
        PortableBundleJobStatus::Running,
        total,
        completed,
        None,
    );
    let mut transaction = pool.begin().await?;
    let plan = plan_metadata(&mut transaction, &entry.manifest).await?;
    result.metadata =
        apply_metadata(&mut transaction, &entry.manifest, &plan, &tagged_skills).await?;
    transaction.commit().await?;

    job.emit(
        PortableBundlePhase::Apply,
        if result.cancelled {
            PortableBundleJobStatus::Cancelled
        } else {
            PortableBundleJobStatus::Completed
        },
        total,
        completed,
        None,
    );
    Ok(result)
}

/// Turn preview statuses plus user decisions into writes. Fails closed: a
/// missing or invalid decision aborts before anything is written.
async fn resolve_decisions<'a>(
    pool: &DbPool,
    fs: &CentralFs,
    root: &std::path::Path,
    skills: &'a [BundleSkill],
    statuses: &std::collections::BTreeMap<String, PortableBundleSkillStatus>,
    decisions: &[PortableBundleDecision],
    result: &mut PortableBundleImportResult,
) -> Result<(Vec<PlannedWrite<'a>>, Vec<&'a BundleSkill>), PortableBundleError> {
    let decisions = decisions
        .iter()
        .map(|decision| (decision.skill_id.as_str(), decision))
        .collect::<HashMap<_, _>>();
    let mut writes = Vec::new();
    let mut identical = Vec::new();
    let mut rename_targets = Vec::new();
    for skill in skills {
        let status = statuses
            .get(&skill.id)
            .copied()
            .unwrap_or(PortableBundleSkillStatus::Invalid);
        if status == PortableBundleSkillStatus::Invalid {
            result.skipped.push(issue(&skill.id, "invalid"));
            continue;
        }
        let action = match (decisions.get(skill.id.as_str()), status) {
            (Some(decision), _) => decision.action,
            (None, PortableBundleSkillStatus::New) => PortableBundleDecisionAction::Overwrite,
            (None, PortableBundleSkillStatus::Identical) => PortableBundleDecisionAction::Skip,
            (None, _) => return Err(PortableBundleError::DecisionRequired(skill.id.clone())),
        };
        match action {
            PortableBundleDecisionAction::Skip => {
                if status == PortableBundleSkillStatus::Identical {
                    identical.push(skill);
                }
                let reason = if status == PortableBundleSkillStatus::Identical {
                    "identical"
                } else {
                    "user_skipped"
                };
                result.skipped.push(issue(&skill.id, reason));
            }
            PortableBundleDecisionAction::Overwrite => writes.push(PlannedWrite {
                skill,
                final_id: skill.id.clone(),
                kind: if status == PortableBundleSkillStatus::New {
                    WriteKind::Create
                } else {
                    WriteKind::Overwrite
                },
            }),
            PortableBundleDecisionAction::Rename => {
                let target = decisions
                    .get(skill.id.as_str())
                    .and_then(|decision| decision.rename_to.as_deref())
                    .map(str::trim)
                    .filter(|target| is_portable_skill_id(target) && *target != skill.id)
                    .ok_or_else(|| PortableBundleError::RenameInvalid(skill.id.clone()))?;
                rename_targets.push((skill.id.clone(), target.to_string()));
                writes.push(PlannedWrite {
                    skill,
                    final_id: target.to_string(),
                    kind: WriteKind::Rename,
                });
            }
        }
    }
    validate_rename_targets(pool, fs, root, skills, &rename_targets).await?;
    Ok((writes, identical))
}

/// A rename target must be unused on the target and unique in this import.
async fn validate_rename_targets(
    pool: &DbPool,
    fs: &CentralFs,
    root: &std::path::Path,
    skills: &[BundleSkill],
    renames: &[(String, String)],
) -> Result<(), PortableBundleError> {
    if renames.is_empty() {
        return Ok(());
    }
    let bundle_ids = skills
        .iter()
        .map(|skill| skill.id.to_ascii_lowercase())
        .collect::<HashSet<_>>();
    let mut seen = HashSet::new();
    for (source, target) in renames {
        let key = target.to_ascii_lowercase();
        if bundle_ids.contains(&key) || !seen.insert(key) {
            return Err(PortableBundleError::RenameInvalid(source.clone()));
        }
    }
    let targets = renames
        .iter()
        .map(|(_, target)| target.as_str())
        .collect::<Vec<_>>();
    let rows = existing_skill_rows(pool, &targets).await?;
    let dirs = targets
        .iter()
        .map(|target| central_target_dir(fs, root, target))
        .collect::<Vec<_>>();
    let hashes = fs.hash_directories(&dirs).await?;
    let empty = content_digest_of(Vec::new());
    for ((source, target), dir) in renames.iter().zip(&dirs) {
        let occupied = hashes.get(dir).is_some_and(|hash| *hash != empty);
        if rows.contains_key(target) || occupied {
            return Err(PortableBundleError::RenameInvalid(source.clone()));
        }
    }
    Ok(())
}

async fn build_inputs(
    fs: &CentralFs,
    root: &std::path::Path,
    bytes: &Arc<Vec<u8>>,
    batch: &[PlannedWrite<'_>],
) -> Result<Vec<BundleContentUpsert>, PortableBundleError> {
    let skills = batch
        .iter()
        .map(|write| write.skill.clone())
        .collect::<Vec<_>>();
    let payload_bytes = Arc::clone(bytes);
    let payloads = run_blocking_fs_with(
        "portable bundle payload read",
        move || {
            skills
                .iter()
                .map(|skill| read_skill_payload(&payload_bytes, skill))
                .collect::<Result<Vec<_>, _>>()
        },
        PortableBundleError::task_join,
    )
    .await?;
    let now = Utc::now().to_rfc3339();
    Ok(batch
        .iter()
        .zip(payloads)
        .map(|(write, files)| {
            let target_dir = central_target_dir(fs, root, &write.final_id);
            BundleContentUpsert {
                skill: Skill {
                    id: write.final_id.clone(),
                    uid: uuid::Uuid::new_v4().to_string(),
                    name: write.skill.name.clone(),
                    description: write.skill.description.clone(),
                    file_path: skill_md_path(fs, &target_dir),
                    canonical_path: Some(target_dir.to_string_lossy().into_owned()),
                    is_central: true,
                    source: None,
                    content: None,
                    scanned_at: now.clone(),
                    fs_created_at: None,
                    fs_updated_at: None,
                },
                target_dir,
                files,
                content_digest: write.skill.content_digest.clone(),
                github: github_source(&write.skill.provenance),
                allow_existing_target: write.kind == WriteKind::Overwrite,
            }
        })
        .collect())
}

fn skill_md_path(fs: &CentralFs, target_dir: &Path) -> String {
    match fs {
        CentralFs::Local => target_dir.join("SKILL.md").to_string_lossy().into_owned(),
        CentralFs::Remote(_) => {
            crate::targets::remote_join(&target_dir.to_string_lossy(), "SKILL.md")
        }
    }
}

/// Bundle provenance → update-center source. An unsafe `sourcePath` drops
/// provenance instead of failing the skill.
fn github_source(provenance: &BundleProvenance) -> Option<BundleGitHubSource> {
    match provenance {
        BundleProvenance::Github {
            owner,
            repo,
            branch,
            source_path,
            ..
        } if !owner.trim().is_empty() && !repo.trim().is_empty() => {
            let source_path = normalize_repo_path(source_path).ok()?;
            Some(BundleGitHubSource {
                owner: owner.clone(),
                repo: repo.clone(),
                branch: branch.clone().filter(|branch| !branch.trim().is_empty()),
                source_path,
            })
        }
        _ => None,
    }
}

fn item_failure_code(error: &CentralUpdatesError) -> &'static str {
    match error {
        CentralUpdatesError::FirstUpsertTargetExists(_) => "target_exists",
        _ => "write_failed",
    }
}

fn issue(id: &str, code: &str) -> PortableBundleSkillIssue {
    PortableBundleSkillIssue {
        id: id.to_string(),
        code: code.to_string(),
    }
}
