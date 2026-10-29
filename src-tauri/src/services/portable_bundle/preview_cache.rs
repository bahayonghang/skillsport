//! Short-lived import previews keyed by an opaque token.
//!
//! An entry holds the verified manifest and file fingerprint, never skill
//! bytes. Apply re-reads the file and compares the fingerprint, so a cached
//! preview can never be used to import content the user did not inspect.

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::services::local_archive_import::inventory::ArchiveFingerprint;

use super::error::PortableBundleError;
use super::types::{BundleManifest, PortableBundleSkillStatus};

pub(crate) const PREVIEW_TTL: Duration = Duration::from_secs(30 * 60);
const MAX_PREVIEWS_PER_TARGET: usize = 2;

#[derive(Debug, Clone)]
pub(crate) struct BundlePreviewEntry {
    pub(crate) path: PathBuf,
    pub(crate) fingerprint: ArchiveFingerprint,
    pub(crate) manifest: BundleManifest,
    /// Skill id → classification at preview time.
    pub(crate) statuses: BTreeMap<String, PortableBundleSkillStatus>,
    pub(crate) target_id: String,
    pub(crate) created_at: Instant,
}

#[derive(Default)]
pub(crate) struct PreviewCache {
    entries: Mutex<HashMap<String, BundlePreviewEntry>>,
}

/// Process-wide cache used by the Tauri commands. Tests build their own.
pub(crate) fn preview_cache() -> &'static PreviewCache {
    static CACHE: OnceLock<PreviewCache> = OnceLock::new();
    CACHE.get_or_init(PreviewCache::default)
}

impl PreviewCache {
    /// Store an entry and return its token. Expired entries are pruned and
    /// each target keeps only its newest previews.
    pub(crate) fn insert(&self, entry: BundlePreviewEntry) -> String {
        let token = uuid::Uuid::new_v4().simple().to_string();
        let mut entries = self.lock();
        entries.retain(|_, existing| existing.created_at.elapsed() < PREVIEW_TTL);
        let mut same_target = entries
            .iter()
            .filter(|(_, existing)| existing.target_id == entry.target_id)
            .map(|(token, existing)| (existing.created_at, token.clone()))
            .collect::<Vec<_>>();
        same_target.sort();
        let excess = (same_target.len() + 1).saturating_sub(MAX_PREVIEWS_PER_TARGET);
        for (_, stale) in same_target.into_iter().take(excess) {
            entries.remove(&stale);
        }
        entries.insert(token.clone(), entry);
        token
    }

    /// Fetch a live entry for `target_id`.
    pub(crate) fn get(
        &self,
        token: &str,
        target_id: &str,
    ) -> Result<BundlePreviewEntry, PortableBundleError> {
        let mut entries = self.lock();
        let Some(entry) = entries.get(token) else {
            return Err(PortableBundleError::PreviewExpired);
        };
        if entry.created_at.elapsed() >= PREVIEW_TTL {
            entries.remove(token);
            return Err(PortableBundleError::PreviewExpired);
        }
        if entry.target_id != target_id {
            return Err(PortableBundleError::TargetChanged);
        }
        Ok(entry.clone())
    }

    /// Remove an entry; returns whether one existed.
    pub(crate) fn discard(&self, token: &str) -> bool {
        self.lock().remove(token).is_some()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, BundlePreviewEntry>> {
        self.entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[cfg(test)]
    pub(crate) fn age_entry(&self, token: &str, by: Duration) {
        if let Some(entry) = self.lock().get_mut(token) {
            entry.created_at -= by;
        }
    }
}
