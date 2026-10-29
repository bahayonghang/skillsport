//! Export orchestration: database metadata + Central skill trees → bundle.

use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::db::{DbPool, Skill};
use crate::fs_util::run_blocking_fs_with;
use crate::services::central_updates::{
    content_digest_of, sha256_hex, CentralFs, CentralUpdatesError, SkillTreeFile,
};
use crate::services::resource_budget::ResourceBudget;

use super::collect::{collect_metadata, collect_skills, is_portable_skill_id};
use super::error::PortableBundleError;
use super::progress::{BundleJob, ProgressThrottle};
use super::types::{
    BundleApp, BundleFile, BundleManifest, BundleOrigin, BundleSkill, BundleSkippedSkill,
    PortableBundleExportResult, PortableBundleJobStatus, PortableBundlePhase,
    BUNDLE_FORMAT_VERSION, BUNDLE_KIND, SKILLS_DIR,
};
use super::writer::{validate_bundle_path, BundleWriter};

pub(crate) async fn export_bundle(
    pool: &DbPool,
    fs: &CentralFs,
    target_kind: &str,
    destination: PathBuf,
    job: BundleJob<'_>,
) -> Result<PortableBundleExportResult, PortableBundleError> {
    validate_bundle_path(&destination)?;
    job.check_cancel()?;
    let metadata = collect_metadata(pool).await?;
    let collected = collect_skills(pool, &metadata).await?;
    let total = collected.len();
    let budget = ResourceBudget::portable_bundle();
    job.emit(
        PortableBundlePhase::Export,
        PortableBundleJobStatus::Running,
        total,
        0,
        None,
    );

    let create_destination = destination.clone();
    let mut writer = run_blocking_fs_with(
        "portable bundle create",
        move || BundleWriter::create(&create_destination, budget),
        PortableBundleError::task_join,
    )
    .await?;

    let mut result = PortableBundleExportResult::default();
    let mut skills = Vec::with_capacity(total);
    let mut throttle = ProgressThrottle::new();
    for (index, entry) in collected.into_iter().enumerate() {
        job.check_cancel()?;
        if throttle.ready() {
            job.emit(
                PortableBundlePhase::Export,
                PortableBundleJobStatus::Running,
                total,
                index,
                Some(&entry.skill.name),
            );
        }
        let skill = entry.skill;
        if !is_portable_skill_id(&skill.id) {
            result.skipped_skills.push(skipped(&skill, "invalid_id"));
            continue;
        }
        let files = match fs
            .read_skill_tree(&skill_dir(&skill), budget.archive_entry_bytes)
            .await
        {
            Ok(files) => files,
            Err(CentralUpdatesError::SkillFileTooLarge { .. }) => {
                result
                    .skipped_skills
                    .push(skipped(&skill, "budget_exceeded"));
                continue;
            }
            Err(CentralUpdatesError::Io { .. }) => {
                // The IO error carries the target path; log only the reason.
                tracing::warn!(
                    reason = "read_failed",
                    "skipping unreadable skill during bundle export"
                );
                result.skipped_skills.push(skipped(&skill, "read_failed"));
                continue;
            }
            Err(error) => return Err(error.into()),
        };
        if !files
            .iter()
            .any(|file| file.relative_path.eq_ignore_ascii_case("SKILL.md"))
        {
            result
                .skipped_skills
                .push(skipped(&skill, "manifest_missing"));
            continue;
        }

        let payload_dir = format!("{SKILLS_DIR}/{}", skill.id);
        let bundle_files = describe_files(&files);
        let content_digest = content_digest_of(
            bundle_files
                .iter()
                .map(|file| (file.path.clone(), file.sha256.clone()))
                .collect(),
        );
        result.file_count += files.len();
        result.content_bytes += bundle_files.iter().map(|file| file.size).sum::<u64>();

        let write_dir = payload_dir.clone();
        writer = run_blocking_fs_with(
            "portable bundle write",
            move || {
                writer.add_skill(&write_dir, &files)?;
                Ok(writer)
            },
            PortableBundleError::task_join,
        )
        .await?;

        skills.push(BundleSkill {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            payload_dir,
            content_digest,
            files: bundle_files,
            provenance: entry.provenance,
            tag_keys: entry.tag_keys,
        });
    }
    job.check_cancel()?;

    result.skills_exported = skills.len();
    let manifest = BundleManifest {
        kind: BUNDLE_KIND.to_string(),
        format_version: BUNDLE_FORMAT_VERSION,
        created_at: Utc::now().to_rfc3339(),
        app: BundleApp {
            name: "SkillPort".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        },
        origin: BundleOrigin {
            target_kind: target_kind.to_string(),
        },
        registries: metadata.registries,
        tag_groups: metadata.tag_groups,
        tags: metadata.tags,
        saved_views: metadata.saved_views,
        skills,
        skipped_skills: result.skipped_skills.clone(),
    };
    let manifest_json = serde_json::to_vec_pretty(&manifest)?;
    result.bundle_bytes = run_blocking_fs_with(
        "portable bundle finish",
        move || writer.finish(&manifest_json),
        PortableBundleError::task_join,
    )
    .await?;
    job.emit(
        PortableBundlePhase::Export,
        PortableBundleJobStatus::Completed,
        total,
        total,
        None,
    );
    Ok(result)
}

fn describe_files(files: &[SkillTreeFile]) -> Vec<BundleFile> {
    files
        .iter()
        .map(|file| BundleFile {
            path: file.relative_path.clone(),
            size: file.bytes.len() as u64,
            sha256: sha256_hex(&file.bytes),
        })
        .collect()
}

fn skill_dir(skill: &Skill) -> PathBuf {
    skill
        .canonical_path
        .as_deref()
        .map(PathBuf::from)
        .or_else(|| Path::new(&skill.file_path).parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from(&skill.file_path))
}

fn skipped(skill: &Skill, reason: &str) -> BundleSkippedSkill {
    BundleSkippedSkill {
        id: skill.id.clone(),
        name: skill.name.clone(),
        reason: reason.to_string(),
    }
}
