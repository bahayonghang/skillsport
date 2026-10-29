//! Journaled Central upsert for portable-bundle skill directories.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

use crate::db::repos::skills_repo;
use crate::db::{DbPool, Skill};

use super::batch::{update_skills_batch_with_progress, SkillUpdateBatchOutcome, SkillUpdatePlan};
use super::content_upsert::ensure_target_identity;
use crate::services::central_updates::error::CentralUpdatesError;
use crate::services::central_updates::fs::{
    content_digest_of, ensure_remote_skill_manifest, sha256_hex, CentralFs, RemoteSkillFile,
    SkillTreeFile,
};
use crate::services::central_updates::types::{
    BundleGitHubSource, CentralUpdateFailurePhase, CentralUpdateItemError, ContentSource,
    RemoteSkillContent,
};

/// One portable-bundle skill directory to upsert into Central.
pub(crate) struct BundleContentUpsert {
    pub(crate) skill: Skill,
    pub(crate) target_dir: PathBuf,
    pub(crate) files: Vec<SkillTreeFile>,
    /// `contentDigest` from the bundle manifest; recomputed before staging.
    pub(crate) content_digest: String,
    pub(crate) github: Option<BundleGitHubSource>,
    /// The user chose to overwrite: an existing target directory is backed
    /// up and replaced instead of failing the first-upsert check.
    pub(crate) allow_existing_target: bool,
}

/// Durably upsert portable-bundle skills into Central in one batch.
///
/// Shares the GitHub path's boundary: the Central update batch owns target
/// locking, pending-operation recovery, the journaled stage/swap, the
/// DB/provenance transaction, and rollback for Local, SSH, and WSL targets.
/// Outcomes are returned in input order; items not started before `cancel`
/// is raised fail with `BatchCancelled`.
pub(crate) async fn journaled_bundle_content_upsert(
    pool: &DbPool,
    fs: &CentralFs,
    inputs: Vec<BundleContentUpsert>,
    cancel: Option<&AtomicBool>,
) -> Result<Vec<SkillUpdateBatchOutcome>, CentralUpdatesError> {
    let target_dirs = inputs
        .iter()
        .map(|input| input.target_dir.clone())
        .collect::<Vec<_>>();
    let mut local_hashes = fs.hash_directories(&target_dirs).await?;
    let mut outcomes: Vec<Option<SkillUpdateBatchOutcome>> = Vec::with_capacity(inputs.len());
    let mut plans = Vec::new();
    let mut plan_slots = Vec::new();
    for input in inputs {
        let skill_id = input.skill.id.clone();
        let existing = skills_repo::get_skill_by_id(pool, &skill_id).await?;
        let local_hash = local_hashes.remove(&input.target_dir).unwrap_or_default();
        match bundle_upsert_plan(input, local_hash, existing) {
            Ok(plan) => {
                plan_slots.push(outcomes.len());
                outcomes.push(None);
                plans.push(plan);
            }
            Err(error) => outcomes.push(Some(SkillUpdateBatchOutcome {
                skill_id,
                result: Err(CentralUpdateItemError::new(
                    CentralUpdateFailurePhase::Prepare,
                    error,
                )),
            })),
        }
    }
    let batch = update_skills_batch_with_progress(pool, fs, plans, cancel, None).await;
    for (slot, outcome) in plan_slots.into_iter().zip(batch) {
        outcomes[slot] = Some(outcome);
    }
    Ok(outcomes.into_iter().flatten().collect())
}

fn bundle_upsert_plan(
    input: BundleContentUpsert,
    local_hash: String,
    existing: Option<Skill>,
) -> Result<SkillUpdatePlan, CentralUpdatesError> {
    ensure_target_identity(&input.target_dir, &input.skill.id)?;
    let digest_entries = input
        .files
        .iter()
        .map(|file| (file.relative_path.clone(), sha256_hex(&file.bytes)))
        .collect::<Vec<_>>();
    let remote_hash = content_digest_of(digest_entries);
    if remote_hash != input.content_digest {
        return Err(CentralUpdatesError::Batch(
            "Bundle skill content does not match its recorded digest.".to_string(),
        ));
    }
    let files = input
        .files
        .into_iter()
        .map(|file| RemoteSkillFile {
            repo_path: format!("{}/{}", input.skill.id, file.relative_path),
            relative_path: file.relative_path,
            bytes: file.bytes,
        })
        .collect::<Vec<_>>();
    ensure_remote_skill_manifest(&files)?;
    let first_upsert =
        !input.allow_existing_target && !existing.as_ref().is_some_and(|skill| skill.is_central);
    let mut skill = input.skill;
    // Persisted `uid` belongs to the target: keep it for any existing row,
    // Central or not, and only mint one for a brand-new skill.
    if let Some(existing) = existing {
        skill.uid = existing.uid;
    }
    let remote = RemoteSkillContent {
        source: ContentSource::Bundle {
            github: input.github,
        },
        skill_name: skill.name.clone(),
        description: skill.description.clone(),
        files,
        remote_hash,
        local_hash,
        target_dir: input.target_dir,
        resolved_commit_sha: None,
        content_digest: None,
    };
    Ok(SkillUpdatePlan {
        skill,
        remote,
        refresh_copies: false,
        first_upsert,
    })
}
