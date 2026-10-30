//! Import an arbitrary local skill directory into the Local Central library.
//!
//! No earlier use case accepted an arbitrary directory with the Central lock
//! and rollback (see the CLI mutations task design, "Directory import audit").
//! This module reuses the primitives `ensure_centralized` uses and the
//! archive import's stage -> lock -> backup/swap -> upsert -> restore shape.
//!
//! Policy:
//! - The skill root may be a symlink (followed, as the scanner does). The id
//!   comes from the given path's final component, normalised like the scanner.
//! - Nested symlinks are rejected; `copy_dir_all` would dereference them.
//! - The canonical source must not overlap the canonical Central root.
//! - `SKILL.md` must exist and carry a frontmatter `name`.

use std::path::{Path, PathBuf};

use chrono::Utc;
use uuid::Uuid;

use crate::db::repos::{agents_repo, skills_repo};
use crate::db::{DbPool, Skill};
use crate::services::central_mutation::{
    acquire_target_mutation_guard, DEFAULT_CENTRAL_MUTATION_TIMEOUT,
};
use crate::services::resource_budget::ResourceBudget;
use crate::services::scanner::parse_skill_md;
use crate::targets::ActiveTarget;

use super::error::InstallationError;
use super::fs_util::{copy_dir_all_with_budget, run_blocking_fs};
use super::install::reject_pending_recovery;

const STAGING_PREFIX: &str = ".skillport-dir-import-";
const BACKUP_PREFIX: &str = ".skillport-dir-backup-";

/// Validated, read-only view of a directory import.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalDirImportPreview {
    pub skill_id: String,
    pub skill_name: String,
    pub description: Option<String>,
    /// Canonical source directory.
    pub source_dir: PathBuf,
    /// `<central root>/<skill_id>`.
    pub target_dir: PathBuf,
    /// A Central row or a directory already occupies the target.
    pub exists: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalDirImportResult {
    pub skill_id: String,
    pub skill_name: String,
    pub replaced_existing: bool,
}

/// Validate a local skill directory without writing anything.
pub async fn preview_local_dir_import(
    pool: &DbPool,
    source: &Path,
) -> Result<LocalDirImportPreview, InstallationError> {
    let central = agents_repo::get_agent_by_id(pool, "central")
        .await?
        .ok_or(InstallationError::CentralAgentMissing)?;
    let central_root = PathBuf::from(&central.global_skills_dir);
    let source_owned = source.to_path_buf();
    let (source_dir, skill_id, info, target_exists) =
        run_blocking_fs("local directory import validation", move || {
            validate_source_blocking(&source_owned, &central_root)
        })
        .await?;
    let row_exists = skills_repo::get_skill_by_id(pool, &skill_id)
        .await?
        .is_some_and(|skill| skill.is_central);
    let target_dir = PathBuf::from(&central.global_skills_dir).join(&skill_id);
    Ok(LocalDirImportPreview {
        skill_id,
        skill_name: info.name,
        description: info.description,
        source_dir,
        target_dir,
        exists: row_exists || target_exists,
    })
}

/// Copy a local skill directory into Central and persist it as a Central skill.
///
/// Owns the Local Central mutation lock for the pending-recovery check, the
/// existence recheck, the swap, and the DB upsert. Staging happens before the
/// lock and is discarded on every failure.
pub async fn import_local_dir(
    pool: &DbPool,
    source: &Path,
    replace: bool,
) -> Result<LocalDirImportResult, InstallationError> {
    let preview = preview_local_dir_import(pool, source).await?;
    if preview.exists && !replace {
        return Err(InstallationError::LocalImportTargetExists(preview.skill_id));
    }
    let central_root = preview
        .target_dir
        .parent()
        .ok_or_else(|| {
            InstallationError::PathHasNoParent(preview.target_dir.display().to_string())
        })?
        .to_path_buf();

    let staging = central_root.join(format!("{STAGING_PREFIX}{}", Uuid::new_v4()));
    let stage_source = preview.source_dir.clone();
    let stage_target = staging.clone();
    let staged = run_blocking_fs("local directory import staging", move || {
        std::fs::create_dir_all(stage_target.parent().unwrap_or(&stage_target))
            .map_err(|e| InstallationError::io("Failed to create Central skills directory", e))?;
        copy_dir_all_with_budget(
            &stage_source,
            &stage_target,
            ResourceBudget::default_skill(),
        )?;
        reject_nested_symlinks(&stage_source)?;
        Ok(())
    })
    .await;
    if let Err(error) = staged {
        discard_dir(&staging).await;
        return Err(error);
    }

    let guard = acquire_target_mutation_guard(
        &ActiveTarget::Local,
        "Local directory skill import",
        DEFAULT_CENTRAL_MUTATION_TIMEOUT,
    )
    .await;
    let _guard = match guard {
        Ok(guard) => guard,
        Err(error) => {
            discard_dir(&staging).await;
            return Err(error.into());
        }
    };
    let result = apply_under_guard(pool, &preview, &central_root, &staging, replace).await;
    if result.is_err() {
        discard_dir(&staging).await;
    }
    result
}

async fn apply_under_guard(
    pool: &DbPool,
    preview: &LocalDirImportPreview,
    central_root: &Path,
    staging: &Path,
    replace: bool,
) -> Result<LocalDirImportResult, InstallationError> {
    reject_pending_recovery(pool, &ActiveTarget::Local, &preview.skill_id).await?;
    let existing = skills_repo::get_skill_by_id(pool, &preview.skill_id).await?;
    let row_exists = existing.as_ref().is_some_and(|skill| skill.is_central);

    let target = preview.target_dir.clone();
    let backup_path = central_root.join(format!("{BACKUP_PREFIX}{}", Uuid::new_v4()));
    let staging_owned = staging.to_path_buf();
    let swap_target = target.clone();
    let swap_backup = backup_path.clone();
    let backup = run_blocking_fs("local directory import swap", move || {
        let target_exists = std::fs::symlink_metadata(&swap_target).is_ok();
        if (target_exists || row_exists) && !replace {
            return Err(InstallationError::LocalImportTargetExists(
                swap_target
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default(),
            ));
        }
        let backup = if target_exists {
            crate::fs_util::rename_with_retry(&swap_target, &swap_backup).map_err(|e| {
                InstallationError::io("Failed to back up existing Central skill", e)
            })?;
            Some(swap_backup)
        } else {
            None
        };
        if let Err(error) = crate::fs_util::rename_with_retry(&staging_owned, &swap_target) {
            if let Some(backup) = &backup {
                let _ = crate::fs_util::rename_with_retry(backup, &swap_target);
            }
            return Err(InstallationError::io(
                "Failed to move imported skill into Central",
                error,
            ));
        }
        Ok(backup)
    })
    .await?;

    let skill = Skill {
        id: preview.skill_id.clone(),
        // The upsert never updates `uid`, so an existing row keeps its identity.
        uid: existing
            .as_ref()
            .map(|skill| skill.uid.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        name: preview.skill_name.clone(),
        description: preview.description.clone(),
        file_path: target.join("SKILL.md").to_string_lossy().into_owned(),
        canonical_path: Some(target.to_string_lossy().into_owned()),
        is_central: true,
        source: Some("local-dir".to_string()),
        content: None,
        scanned_at: Utc::now().to_rfc3339(),
        fs_created_at: None,
        fs_updated_at: None,
    };
    if let Err(error) = skills_repo::upsert_skill(pool, &skill).await {
        restore_target(&target, backup).await?;
        return Err(error.into());
    }
    let replaced_existing = backup.is_some();
    if let Some(backup) = backup {
        discard_dir(&backup).await;
    }
    Ok(LocalDirImportResult {
        skill_id: preview.skill_id.clone(),
        skill_name: preview.skill_name.clone(),
        replaced_existing,
    })
}

type ValidatedSource = (PathBuf, String, crate::services::scanner::SkillInfo, bool);

fn validate_source_blocking(
    source: &Path,
    central_root: &Path,
) -> Result<ValidatedSource, InstallationError> {
    let display = source.display().to_string();
    let source_dir = std::fs::canonicalize(source)
        .map_err(|_| InstallationError::LocalImportSourceInvalid(display.clone()))?;
    if !source_dir.is_dir() {
        return Err(InstallationError::LocalImportSourceInvalid(display));
    }
    let central_canonical = crate::paths::canonicalize_path_with_missing(central_root);
    if overlaps(&source_dir, &central_canonical) {
        return Err(InstallationError::LocalImportOverlapsCentral(display));
    }

    let name = source
        .file_name()
        .or_else(|| source_dir.file_name())
        .and_then(|name| name.to_str())
        .ok_or_else(|| InstallationError::LocalImportSkillIdInvalid(display.clone()))?;
    let skill_id = name.to_lowercase().replace(' ', "-");
    if skill_id.is_empty()
        || skill_id.starts_with('.')
        || skill_id.contains(['/', '\\'])
        || skill_id == "central"
    {
        return Err(InstallationError::LocalImportSkillIdInvalid(display));
    }

    let manifest = source_dir.join("SKILL.md");
    match std::fs::symlink_metadata(&manifest) {
        Ok(meta) if meta.is_file() => {}
        _ => return Err(InstallationError::LocalImportManifestMissing(display)),
    }
    let info = parse_skill_md(&manifest)
        .ok_or_else(|| InstallationError::LocalImportManifestInvalid(display.clone()))?;
    reject_nested_symlinks(&source_dir)?;

    let target_exists = std::fs::symlink_metadata(central_root.join(&skill_id)).is_ok();
    Ok((source_dir, skill_id, info, target_exists))
}

/// True when either canonical path equals or contains the other.
fn overlaps(source: &Path, central: &Path) -> bool {
    let equivalent = |left: &Path, right: &Path| {
        if cfg!(windows) {
            let left = left.to_string_lossy().to_lowercase();
            let right = right.to_string_lossy().to_lowercase();
            Path::new(&left).starts_with(Path::new(&right))
        } else {
            left.starts_with(right)
        }
    };
    equivalent(source, central) || equivalent(central, source)
}

fn reject_nested_symlinks(root: &Path) -> Result<(), InstallationError> {
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let entries = std::fs::read_dir(&dir)
            .map_err(|e| InstallationError::io("Failed to read import source directory", e))?;
        for entry in entries {
            let entry =
                entry.map_err(|e| InstallationError::io("Failed to read directory entry", e))?;
            let kind = entry
                .file_type()
                .map_err(|e| InstallationError::io("Failed to determine file type", e))?;
            let path = entry.path();
            if kind.is_symlink() {
                let relative = path.strip_prefix(root).unwrap_or(&path);
                return Err(InstallationError::LocalImportSymlinkRejected(
                    relative.display().to_string(),
                ));
            }
            if kind.is_dir() {
                pending.push(path);
            }
        }
    }
    Ok(())
}

async fn discard_dir(path: &Path) {
    let path = path.to_path_buf();
    let _ = run_blocking_fs("local directory import cleanup", move || {
        if std::fs::symlink_metadata(&path).is_ok() {
            let _ = std::fs::remove_dir_all(&path);
        }
        Ok(())
    })
    .await;
}

async fn restore_target(target: &Path, backup: Option<PathBuf>) -> Result<(), InstallationError> {
    let target = target.to_path_buf();
    run_blocking_fs("local directory import restore", move || {
        if std::fs::symlink_metadata(&target).is_ok() {
            std::fs::remove_dir_all(&target)
                .map_err(|e| InstallationError::io("Failed to remove imported skill", e))?;
        }
        if let Some(backup) = backup {
            crate::fs_util::rename_with_retry(&backup, &target)
                .map_err(|e| InstallationError::io("Failed to restore previous skill", e))?;
        }
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{mem_pool, set_agent_dir, write_skill_md};

    #[test]
    fn overlap_detects_equal_nested_and_parent_paths() {
        let root = Path::new("/home/u/.skillsmanage/skills");
        assert!(overlaps(root, root));
        assert!(overlaps(&root.join("demo"), root));
        assert!(overlaps(Path::new("/home/u"), root));
        assert!(!overlaps(
            Path::new("/home/u/.skillsmanage/skills-extra"),
            root
        ));
        assert!(!overlaps(Path::new("/home/u/src/demo"), root));
    }

    #[tokio::test]
    async fn upsert_failure_restores_previous_directory_and_cleans_staging() {
        let pool = mem_pool().await;
        let temp = tempfile::tempdir().unwrap();
        let central = temp.path().join("central");
        set_agent_dir(&pool, "central", &central).await;
        crate::test_support::seed_central_skill(&pool, &central.join("demo"), "demo", "old").await;
        let source = temp.path().join("src").join("demo");
        write_skill_md(&source, "Demo", Some("new"));
        std::fs::write(source.join("new.txt"), "new").unwrap();
        sqlx::query(
            "CREATE TRIGGER fail_skill_update BEFORE UPDATE ON skills
             BEGIN SELECT RAISE(ABORT, 'forced upsert failure'); END",
        )
        .execute(&pool)
        .await
        .unwrap();

        let error = import_local_dir(&pool, &source, true).await.unwrap_err();
        assert!(matches!(error, InstallationError::Db(_)));
        assert!(central.join("demo").join("SKILL.md").is_file());
        assert!(!central.join("demo").join("new.txt").exists());
        let leftovers = std::fs::read_dir(&central)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert_eq!(leftovers, ["demo"]);
    }
}
