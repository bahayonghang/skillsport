//! Whole-tree reads of one skill directory for portable bundle export.

use std::collections::VecDeque;
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::fs_util::run_blocking_fs_with;
use crate::targets::ConnectedRemoteTarget;

use super::{
    hash_entries, hex_digest, is_safe_relative_path, posix_path, relative_path_string,
    remote_relative_path, CentralFs, CentralUpdatesError,
};

impl CentralFs {
    /// Read every regular file below one skill directory.
    ///
    /// Uses the same inclusion rules as [`Self::hash_directories`] (regular
    /// files only, symlinks and special entries skipped), so
    /// [`content_digest_of`] over the result equals the directory hash.
    /// `entry_limit` bounds each file; files are returned sorted by path.
    pub(crate) async fn read_skill_tree(
        &self,
        root: &Path,
        entry_limit: u64,
    ) -> Result<Vec<SkillTreeFile>, CentralUpdatesError> {
        match self {
            Self::Local => {
                let root = root.to_path_buf();
                run_blocking_fs_with(
                    "central skill tree read",
                    move || {
                        let mut files = Vec::new();
                        collect_local_tree_files(&root, &root, entry_limit, &mut files)?;
                        files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
                        Ok(files)
                    },
                    CentralUpdatesError::task_join,
                )
                .await
            }
            Self::Remote(conn) => {
                read_remote_skill_tree(conn, &posix_path(root), entry_limit).await
            }
        }
    }
}

/// One regular file read by [`CentralFs::read_skill_tree`].
#[derive(Debug, Clone)]
pub(crate) struct SkillTreeFile {
    /// Forward-slash path relative to the skill directory.
    pub relative_path: String,
    pub bytes: Vec<u8>,
}

/// Directory digest over `(relative_path, lowercase hex sha256)` pairs.
///
/// Identical to the value [`CentralFs::hash_directories`] reports for a
/// directory containing exactly these files.
pub(crate) fn content_digest_of(entries: Vec<(String, String)>) -> String {
    hash_entries(entries)
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    hex_digest(&Sha256::digest(bytes))
}

fn collect_local_tree_files(
    root: &Path,
    current: &Path,
    entry_limit: u64,
    files: &mut Vec<SkillTreeFile>,
) -> Result<(), CentralUpdatesError> {
    for entry in std::fs::read_dir(current).map_err(|e| {
        CentralUpdatesError::io(
            format!(
                "Failed to read local skill directory '{}'",
                current.display()
            ),
            e,
        )
    })? {
        let entry =
            entry.map_err(|e| CentralUpdatesError::io("Failed to read local skill entry", e))?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|e| {
            CentralUpdatesError::io(
                format!("Failed to inspect local skill entry '{}'", path.display()),
                e,
            )
        })?;
        if file_type.is_dir() {
            collect_local_tree_files(root, &path, entry_limit, files)?;
        } else if file_type.is_file() {
            let relative_path = relative_path_string(root, &path)?;
            let len = entry
                .metadata()
                .map_err(|e| {
                    CentralUpdatesError::io(
                        format!("Failed to inspect local skill file '{}'", path.display()),
                        e,
                    )
                })?
                .len();
            if len > entry_limit {
                return Err(CentralUpdatesError::SkillFileTooLarge {
                    path: relative_path,
                    limit: entry_limit,
                });
            }
            let bytes = std::fs::read(&path).map_err(|e| {
                CentralUpdatesError::io(
                    format!("Failed to read local skill file '{}'", path.display()),
                    e,
                )
            })?;
            files.push(SkillTreeFile {
                relative_path,
                bytes,
            });
        }
    }
    Ok(())
}

async fn read_remote_skill_tree(
    conn: &ConnectedRemoteTarget,
    root: &str,
    entry_limit: u64,
) -> Result<Vec<SkillTreeFile>, CentralUpdatesError> {
    let mut files = Vec::new();
    let mut queue: VecDeque<String> = VecDeque::new();
    queue.push_back(root.to_string());

    while let Some(current) = queue.pop_front() {
        let dir_entries = conn
            .list_dir(&current)
            .await
            .map_err(|e| CentralUpdatesError::Remote(e.to_string()))?;
        for entry in dir_entries {
            let child_path = format!("{}/{}", current.trim_end_matches('/'), entry.name);
            match entry.file_type.as_str() {
                "dir" => queue.push_back(child_path),
                "file" => {
                    let relative_path = remote_relative_path(root, &child_path)?;
                    if !is_safe_relative_path(&relative_path) {
                        return Err(CentralUpdatesError::UnsupportedRemotePath(child_path));
                    }
                    let bytes = conn
                        .read_file_bounded(&child_path, entry_limit)
                        .await
                        .map_err(|e| CentralUpdatesError::Remote(e.to_string()))?;
                    files.push(SkillTreeFile {
                        relative_path,
                        bytes,
                    });
                }
                // Same rule as `hash_remote_directory`: symlinks and special
                // entries never contribute to managed skill content.
                _ => {}
            }
        }
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}
