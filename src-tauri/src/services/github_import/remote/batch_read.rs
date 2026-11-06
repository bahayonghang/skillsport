//! Read selected remote snapshot bytes in bounded batches, retaining the
//! confirmed manifest as authority rather than trusting a fresh file listing.

use super::*;
use crate::targets::shell_quote;

const BATCH_FILES: usize = 64;
// Matches the existing supervised BulkTransfer stdout budget. No encoding or
// archive overhead is needed: the manifest supplies each binary record length.
const BATCH_BYTES: u64 = crate::targets::ProcessPolicy::bulk_transfer().stdout_limit as u64;

pub(super) async fn read_verified_files(
    connection: &ConnectedRemoteTarget,
    repo_dir: &str,
    selected: &[&PreviewSnapshotFile],
) -> Result<GitHubRepoSnapshot, GithubImportError> {
    validate_selected_files(selected)?;
    let mut files = HashMap::new();
    let mut remaining = selected;
    while !remaining.is_empty() {
        let count = batch_len(remaining);
        let batch = &remaining[..count];
        let script = read_batch_script(repo_dir, batch);
        let output = connection
            .run_command_with_stdin_bytes_cancellable("sh -s --", script.as_bytes(), None)
            .await
            .map_err(|error| match error {
                crate::targets::TargetsError::RemoteCommandFailed { status, .. }
                | crate::targets::TargetsError::WslCommandFailed { status, .. }
                    if status.code() == Some(44) =>
                {
                    GithubImportError::PreviewSnapshotIntegrity
                }
                error => GithubImportError::Remote(error.to_string()),
            })?;
        decode_batch(batch, &output, &mut files)?;
        remaining = &remaining[count..];
    }
    Ok(GitHubRepoSnapshot { files })
}

fn validate_selected_files(files: &[&PreviewSnapshotFile]) -> Result<(), GithubImportError> {
    let budget = ResourceBudget::default_skill();
    if files.len() > budget.archive_files {
        return Err(GithubImportError::ArchiveFileBudgetExceeded(
            budget.archive_files,
        ));
    }
    let mut seen = HashSet::new();
    let mut total = 0_u64;
    for file in files {
        if file.repo_path.is_empty()
            || file.repo_path.contains('\0')
            || !is_safe_repo_relative_path(&file.repo_path)
            || !seen.insert(&file.repo_path)
        {
            return Err(GithubImportError::RemotePreviewInvalidFileManifest);
        }
        budget
            .reject_archive_entry_size(&file.repo_path, file.byte_len)
            .map_err(GithubImportError::Budget)?;
        total = total
            .checked_add(file.byte_len)
            .ok_or(GithubImportError::ArchiveSizeOverflow)?;
        budget
            .reject_archive_expanded_size(total)
            .map_err(GithubImportError::Budget)?;
    }
    Ok(())
}

fn batch_len(files: &[&PreviewSnapshotFile]) -> usize {
    let mut bytes = 0;
    files
        .iter()
        .take(BATCH_FILES)
        .take_while(|file| {
            bytes += file.byte_len;
            bytes <= BATCH_BYTES
        })
        .count()
}

fn read_batch_script(repo_dir: &str, files: &[&PreviewSnapshotFile]) -> String {
    let mut script = String::from("set -eu\n");
    for file in files {
        // Paths are shell-quoted in stdin, not exposed in SSH command arguments.
        // Check size before cat; the supervisor also bounds growth during cat.
        script.push_str(&format!(
            "p={}\n[ -f \"$p\" ] && [ ! -L \"$p\" ] || exit 44\nsize=$(LC_ALL=C wc -c < \"$p\")\n[ \"$size\" -eq {} ] || exit 44\ncat -- \"$p\"\n",
            shell_quote(&remote_join(repo_dir, &file.repo_path)),
            file.byte_len,
        ));
    }
    script
}

fn decode_batch(
    expected: &[&PreviewSnapshotFile],
    output: &[u8],
    files: &mut HashMap<String, Vec<u8>>,
) -> Result<(), GithubImportError> {
    let mut offset = 0_usize;
    for file in expected {
        let length = usize::try_from(file.byte_len)
            .map_err(|_| GithubImportError::PreviewSnapshotIntegrity)?;
        let end = offset
            .checked_add(length)
            .ok_or(GithubImportError::PreviewSnapshotIntegrity)?;
        let bytes = output
            .get(offset..end)
            .ok_or(GithubImportError::PreviewSnapshotIntegrity)?;
        if file_sha256(bytes) != file.sha256 {
            return Err(GithubImportError::PreviewSnapshotIntegrity);
        }
        files.insert(file.repo_path.clone(), bytes.to_vec());
        offset = end;
    }
    if offset != output.len() {
        return Err(GithubImportError::PreviewSnapshotIntegrity);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
