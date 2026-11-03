//! Import preview: bounded read → verify → classify → cache. No writes to
//! Central, the database, or the network.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Instant;

use crate::db::DbPool;
use crate::fs_util::run_blocking_fs_with;
use crate::services::central_updates::CentralFs;
use crate::services::resource_budget::ResourceBudget;

use super::classify::{central_root, classify_skills};
use super::error::PortableBundleError;
use super::metadata_merge::plan_metadata;
use super::preview_cache::{BundlePreviewEntry, PreviewCache};
use super::progress::BundleJob;
use super::reader::{parse_bundle, read_bundle_bytes};
use super::types::{
    BundleProvenance, PortableBundleImportPreview, PortableBundleJobStatus, PortableBundlePhase,
    PortableBundleSkillPreview, PortableBundleSkillStatus,
};
use super::writer::validate_bundle_path;

pub(crate) async fn preview_import(
    pool: &DbPool,
    fs: &CentralFs,
    target_id: &str,
    path: PathBuf,
    cache: &PreviewCache,
    job: BundleJob<'_>,
) -> Result<PortableBundleImportPreview, PortableBundleError> {
    validate_bundle_path(&path)?;
    job.emit(
        PortableBundlePhase::Read,
        PortableBundleJobStatus::Running,
        0,
        0,
        None,
    );
    let budget = ResourceBudget::portable_bundle();
    let read_path = path.clone();
    let parsed = run_blocking_fs_with(
        "portable bundle inspect",
        move || {
            let bytes = read_bundle_bytes(&read_path, budget)?;
            parse_bundle(&bytes, budget)
        },
        PortableBundleError::task_join,
    )
    .await?;
    job.check_cancel()?;

    let total = parsed.manifest.skills.len();
    job.emit(
        PortableBundlePhase::Classify,
        PortableBundleJobStatus::Running,
        total,
        0,
        None,
    );
    let root = central_root(pool).await?;
    let statuses =
        classify_skills(pool, fs, &root, &parsed.manifest, &parsed.invalid_skills).await?;
    let metadata = {
        let mut conn = pool.acquire().await?;
        plan_metadata(&mut conn, &parsed.manifest).await?.preview()
    };
    job.check_cancel()?;

    let skills = parsed
        .manifest
        .skills
        .iter()
        .map(|skill| PortableBundleSkillPreview {
            id: skill.id.clone(),
            name: skill.name.clone(),
            description: skill.description.clone(),
            status: statuses
                .get(&skill.id)
                .copied()
                .unwrap_or(PortableBundleSkillStatus::Invalid),
            invalid_reason: parsed.invalid_skills.get(&skill.id).cloned(),
            has_github_source: matches!(skill.provenance, BundleProvenance::Github { .. }),
            file_count: skill.files.len(),
            content_bytes: skill.files.iter().map(|file| file.size).sum(),
        })
        .collect();
    let preview = PortableBundleImportPreview {
        preview_token: String::new(),
        created_at: parsed.manifest.created_at.clone(),
        app_version: parsed.manifest.app.version.clone(),
        origin_target_kind: parsed.manifest.origin.target_kind.clone(),
        skills,
        metadata,
        bundle_skipped_skills: parsed.manifest.skipped_skills.clone(),
    };
    let token = cache.insert(BundlePreviewEntry {
        path,
        fingerprint: parsed.fingerprint,
        manifest: parsed.manifest,
        statuses: statuses.into_iter().collect::<BTreeMap<_, _>>(),
        target_id: target_id.to_string(),
        created_at: Instant::now(),
    });
    job.emit(
        PortableBundlePhase::Classify,
        PortableBundleJobStatus::Completed,
        total,
        total,
        None,
    );
    Ok(PortableBundleImportPreview {
        preview_token: token,
        ..preview
    })
}
