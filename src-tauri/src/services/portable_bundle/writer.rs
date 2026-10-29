//! Blocking ZIP writer for portable bundles.
//!
//! Writes into a temporary file next to the destination and atomically
//! persists it on [`BundleWriter::finish`]. Dropping an unfinished writer
//! removes the temporary file. All methods block and must run inside
//! `run_blocking_fs_with`.

use std::io::Write;
use std::path::{Path, PathBuf};

use tempfile::NamedTempFile;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::services::central_updates::SkillTreeFile;
use crate::services::resource_budget::{BudgetExceeded, ResourceBudget};

use super::error::PortableBundleError;
use super::types::{BUNDLE_EXTENSIONS, MANIFEST_PATH};

const TEMP_FILE_PREFIX: &str = ".skillport-bundle-";

pub(crate) struct BundleWriter {
    zip: ZipWriter<NamedTempFile>,
    destination: PathBuf,
    budget: ResourceBudget,
    entries: usize,
    expanded_bytes: u64,
}

pub(crate) fn validate_bundle_path(path: &Path) -> Result<(), PortableBundleError> {
    let valid = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            BUNDLE_EXTENSIONS
                .iter()
                .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        });
    if valid {
        Ok(())
    } else {
        Err(PortableBundleError::InvalidPath)
    }
}

fn file_options() -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644)
        .large_file(false)
}

impl BundleWriter {
    pub(crate) fn create(
        destination: &Path,
        budget: ResourceBudget,
    ) -> Result<Self, PortableBundleError> {
        validate_bundle_path(destination)?;
        let parent = destination
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let temp = tempfile::Builder::new()
            .prefix(TEMP_FILE_PREFIX)
            .tempfile_in(parent)
            .map_err(|source| {
                PortableBundleError::io("Failed to create temporary bundle file", source)
            })?;
        Ok(Self {
            zip: ZipWriter::new(temp),
            destination: destination.to_path_buf(),
            budget,
            entries: 0,
            expanded_bytes: 0,
        })
    }

    /// Append one skill's files below `payload_dir`. Budget checks run before
    /// any byte of the skill is written.
    pub(crate) fn add_skill(
        &mut self,
        payload_dir: &str,
        files: &[SkillTreeFile],
    ) -> Result<(), PortableBundleError> {
        let added_bytes = files
            .iter()
            .map(|file| file.bytes.len() as u64)
            .sum::<u64>();
        self.reserve(files.len(), added_bytes)?;
        for file in files {
            self.zip.start_file(
                format!("{payload_dir}/{}", file.relative_path),
                file_options(),
            )?;
            self.zip.write_all(&file.bytes).map_err(|source| {
                PortableBundleError::io("Failed to write bundle entry", source)
            })?;
        }
        Ok(())
    }

    /// Write the manifest, close the archive, and atomically replace the
    /// destination. Returns the final bundle size in bytes.
    pub(crate) fn finish(mut self, manifest_json: &[u8]) -> Result<u64, PortableBundleError> {
        self.reserve(1, manifest_json.len() as u64)?;
        self.zip.start_file(MANIFEST_PATH, file_options())?;
        self.zip
            .write_all(manifest_json)
            .map_err(|source| PortableBundleError::io("Failed to write bundle manifest", source))?;
        let temp = self.zip.finish()?;
        temp.as_file()
            .sync_all()
            .map_err(|source| PortableBundleError::io("Failed to sync bundle file", source))?;
        let bundle_bytes = temp
            .as_file()
            .metadata()
            .map_err(|source| PortableBundleError::io("Failed to inspect bundle file", source))?
            .len();
        self.budget.reject_archive_size(bundle_bytes)?;
        temp.persist(&self.destination).map_err(|error| {
            PortableBundleError::io("Failed to replace bundle file", error.error)
        })?;
        Ok(bundle_bytes)
    }

    fn reserve(&mut self, entries: usize, bytes: u64) -> Result<(), PortableBundleError> {
        let next_entries = self.entries + entries;
        if next_entries > self.budget.archive_files {
            return Err(BudgetExceeded::new(
                "Portable bundle entries",
                next_entries as u64,
                self.budget.archive_files as u64,
            )
            .into());
        }
        let next_bytes = self.expanded_bytes.saturating_add(bytes);
        if next_bytes > self.budget.archive_expanded_bytes {
            return Err(BudgetExceeded::new(
                "Portable bundle expanded contents",
                next_bytes,
                self.budget.archive_expanded_bytes,
            )
            .into());
        }
        self.entries = next_entries;
        self.expanded_bytes = next_bytes;
        Ok(())
    }
}
