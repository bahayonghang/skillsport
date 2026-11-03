//! Local one-level sweep for Central clear-all.
//!
//! Every directory is read exactly one level deep. Entries are classified
//! with `symlink_metadata` (never following links); link targets are read
//! from the link itself so dangling junctions/symlinks are still visible.
//! Nothing here parses `SKILL.md`, recurses, or canonicalizes link targets.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use crate::paths::{key_is_within, path_comparison_key};
use crate::services::installation::fs_util::{
    inspect_link_kind_and_target, is_reparse_or_symlink, remove_directory_link_slot,
    resolved_symlink_target,
};

use super::types::{ClearCentralOwnerKind, ClearCentralPathItem, ClearCentralSweepWarning};

pub(super) const SWEEP_WARNING_UNREADABLE: &str = "unreadable";

/// Backup/marker names written by the operation journal.
pub(super) const JOURNAL_ENTRY_PREFIX: &str = ".skillport-";

#[derive(Debug, Clone)]
pub(super) struct ScanDir {
    pub owner_kind: ClearCentralOwnerKind,
    pub owner_id: String,
    pub dir: PathBuf,
}

#[derive(Debug, Default)]
pub(super) struct SweepOutput {
    pub orphans: Vec<ClearCentralPathItem>,
    pub untracked: Vec<ClearCentralPathItem>,
    pub skipped_unmanaged: usize,
    pub warnings: Vec<ClearCentralSweepWarning>,
}

pub(super) struct LocalSweepInput<'a> {
    pub scan_dirs: &'a [ScanDir],
    pub root_keys: &'a [String],
    /// Comparison keys of DB-registered installation/project paths. These
    /// belong to the skills / project-link phases, never to the orphan set.
    pub registered_keys: &'a HashSet<String>,
    pub central_root: &'a Path,
    pub central_skill_dir_keys: &'a HashSet<String>,
}

pub(super) fn sweep_local(input: &LocalSweepInput<'_>) -> SweepOutput {
    let mut output = SweepOutput::default();
    sweep_central_root(input, &mut output);

    let next = AtomicUsize::new(0);
    let collected = Mutex::new(Vec::with_capacity(input.scan_dirs.len()));
    let workers = crate::services::scanner::scan_parallelism_limit()
        .min(input.scan_dirs.len())
        .max(1);
    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| loop {
                let index = next.fetch_add(1, Ordering::SeqCst);
                let Some(dir) = input.scan_dirs.get(index) else {
                    break;
                };
                let result = sweep_dir(dir, input.root_keys, input.registered_keys);
                if let Ok(mut collected) = collected.lock() {
                    collected.push(result);
                }
            });
        }
    });

    for dir in collected.into_inner().unwrap_or_default() {
        output.orphans.extend(dir.orphans);
        output.skipped_unmanaged += dir.skipped_unmanaged;
        output.warnings.extend(dir.warnings);
    }
    output
        .orphans
        .sort_by(|left, right| left.key.cmp(&right.key));
    output.orphans.dedup_by(|left, right| left.key == right.key);
    output
        .warnings
        .sort_by(|left, right| left.path.cmp(&right.path));
    output
}

fn sweep_central_root(input: &LocalSweepInput<'_>, output: &mut SweepOutput) {
    let entries = match std::fs::read_dir(input.central_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(_) => {
            output.warnings.push(unreadable(input.central_root));
            return;
        }
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        let is_link = is_reparse_or_symlink(&metadata);
        if !is_link && !metadata.is_dir() {
            continue;
        }
        if is_central_skill_dir(&path, input.central_skill_dir_keys) {
            continue;
        }
        let key = path_comparison_key(&path);
        output.untracked.push(ClearCentralPathItem {
            key,
            dangling: is_link && !path.exists(),
            path: path.to_string_lossy().into_owned(),
            owner_kind: ClearCentralOwnerKind::Central,
            owner_id: "central".to_string(),
            skill_name: Some(name),
        });
    }
    output
        .untracked
        .sort_by(|left, right| left.key.cmp(&right.key));
}

#[derive(Default)]
struct DirSweep {
    orphans: Vec<ClearCentralPathItem>,
    skipped_unmanaged: usize,
    warnings: Vec<ClearCentralSweepWarning>,
}

fn sweep_dir(dir: &ScanDir, root_keys: &[String], registered: &HashSet<String>) -> DirSweep {
    let mut result = DirSweep::default();
    let entries = match std::fs::read_dir(&dir.dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return result,
        Err(_) => {
            result.warnings.push(unreadable(&dir.dir));
            return result;
        }
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with(JOURNAL_ENTRY_PREFIX) {
            continue;
        }
        let path = entry.path();
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        let key = path_comparison_key(&path);
        if is_reparse_or_symlink(&metadata) {
            if registered.contains(&key) {
                continue;
            }
            let Some(target) = local_link_target(&path) else {
                continue;
            };
            if target_is_attributable(&target, root_keys) {
                result.orphans.push(ClearCentralPathItem {
                    key,
                    dangling: !path.exists(),
                    path: path.to_string_lossy().into_owned(),
                    owner_kind: dir.owner_kind,
                    owner_id: dir.owner_id.clone(),
                    skill_name: Some(name),
                });
            }
        } else if metadata.is_dir() && !registered.contains(&key) {
            result.skipped_unmanaged += 1;
        }
    }
    result
}

fn unreadable(path: &Path) -> ClearCentralSweepWarning {
    ClearCentralSweepWarning {
        path: path.to_string_lossy().into_owned(),
        code: SWEEP_WARNING_UNREADABLE.to_string(),
    }
}

/// Raw link target, resolved against the link's parent when relative. Works
/// for dangling Windows junctions and symlinks.
pub(super) fn local_link_target(link: &Path) -> Option<PathBuf> {
    match inspect_link_kind_and_target(link) {
        Ok((_, target)) => Some(target),
        Err(_) => std::fs::read_link(link)
            .ok()
            .map(|raw| resolved_symlink_target(link, &raw)),
    }
}

/// Comparison key of a directory slot with its ancestors canonicalized but
/// the leaf never followed, so `<link-to-root>/a` and `<real-root>/a` agree.
/// Used next to the lexical key wherever a DB skill dir must be recognized.
pub(super) fn slot_comparison_key(path: &Path) -> Option<String> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())?;
    let name = path.file_name()?;
    Some(path_comparison_key(
        &crate::paths::canonicalize_path_with_missing(parent).join(name),
    ))
}

fn is_central_skill_dir(path: &Path, central_skill_dir_keys: &HashSet<String>) -> bool {
    central_skill_dir_keys.contains(&path_comparison_key(path))
        || slot_comparison_key(path).is_some_and(|key| central_skill_dir_keys.contains(&key))
}

pub(super) fn target_is_attributable(target: &Path, root_keys: &[String]) -> bool {
    let target_key = path_comparison_key(target);
    root_keys
        .iter()
        .any(|root_key| key_is_within(root_key, &target_key))
}

/// Per-item local removal outcome during apply.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum LocalRemoveOutcome {
    Removed,
    /// Path no longer exists.
    Gone,
    /// Path exists but is no longer a qualifying link/entry.
    Changed,
    Failed,
    OutsideScope,
}

/// Re-observe one link slot and remove only the link itself when it still
/// points into an attributable Central root.
pub(super) fn remove_local_link_if_attributable(
    path: &Path,
    root_keys: &[String],
) -> LocalRemoveOutcome {
    match std::fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return LocalRemoveOutcome::Gone;
        }
        Err(_) => return LocalRemoveOutcome::Failed,
        Ok(metadata) if !is_reparse_or_symlink(&metadata) => return LocalRemoveOutcome::Changed,
        Ok(_) => {}
    }
    let Some(target) = local_link_target(path) else {
        return LocalRemoveOutcome::Changed;
    };
    if !target_is_attributable(&target, root_keys) {
        return LocalRemoveOutcome::Changed;
    }
    match remove_directory_link_slot(path) {
        Ok(true) => LocalRemoveOutcome::Removed,
        Ok(false) => LocalRemoveOutcome::Changed,
        Err(_) => LocalRemoveOutcome::Failed,
    }
}

/// Remove one untracked direct child of the Central root. Links are removed
/// without following; real directories are removed recursively.
pub(super) fn remove_local_untracked_entry(
    central_root: &Path,
    path: &Path,
    central_skill_dir_keys: &HashSet<String>,
) -> LocalRemoveOutcome {
    let is_direct_child = path
        .parent()
        .is_some_and(|parent| crate::paths::paths_equivalent(parent, central_root))
        && path
            .file_name()
            .is_some_and(|name| !name.to_string_lossy().starts_with('.'));
    if !is_direct_child {
        return LocalRemoveOutcome::OutsideScope;
    }
    if is_central_skill_dir(path, central_skill_dir_keys) {
        return LocalRemoveOutcome::Changed;
    }
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return LocalRemoveOutcome::Gone;
        }
        Err(_) => return LocalRemoveOutcome::Failed,
    };
    if is_reparse_or_symlink(&metadata) {
        return match remove_directory_link_slot(path) {
            Ok(true) => LocalRemoveOutcome::Removed,
            Ok(false) => LocalRemoveOutcome::Changed,
            Err(_) => LocalRemoveOutcome::Failed,
        };
    }
    if !metadata.is_dir() {
        return LocalRemoveOutcome::Changed;
    }
    if super::super::delete::validate_skill_dir_removal(path).is_err() {
        return LocalRemoveOutcome::Failed;
    }
    match std::fs::remove_dir_all(path) {
        Ok(()) => LocalRemoveOutcome::Removed,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => LocalRemoveOutcome::Gone,
        Err(_) => LocalRemoveOutcome::Failed,
    }
}
