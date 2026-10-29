//! SkillPort portable bundle (format v2): a ZIP holding `manifest.json` plus
//! every Central skill's files, so a library can move between installations
//! and targets without GitHub access.
//!
//! - [`collect`] reads Central metadata from the target database and re-keys
//!   it to bundle-local keys (no database ids or `uid` leave the machine).
//! - [`export`] reads skill trees through `CentralFs` (Local/SSH/WSL) and
//!   streams them into [`writer::BundleWriter`], which persists atomically.
//! - [`reader`] is the fail-closed inspector used by import: bounded read,
//!   shared ZIP safety inventory, manifest parsing, per-file verification.
//! - [`preview`] classifies bundle skills against the target ([`classify`],
//!   [`metadata_merge`]) and caches the result behind a token
//!   ([`preview_cache`]); [`apply`] re-verifies the file and writes through
//!   the journaled Central content upsert.
//!
//! `contentDigest` uses the same algorithm as `CentralFs::hash_directories`,
//! so import can compare bundle content with an existing Central directory.
//! Tauri commands live in `crate::commands::portable_bundle`.

mod apply;
mod classify;
mod collect;
mod error;
mod export;
mod metadata_merge;
mod preview;
mod preview_cache;
mod progress;
mod reader;
mod types;
mod writer;

#[cfg(test)]
mod import_tests;
#[cfg(test)]
mod tests;

pub(crate) use apply::apply_import;
pub(crate) use collect::export_summary;
pub use error::PortableBundleError;
pub(crate) use export::export_bundle;
pub(crate) use preview::preview_import;
pub(crate) use preview_cache::preview_cache;
pub(crate) use progress::BundleJob;
pub use types::{
    BundleApp, BundleFile, BundleManifest, BundleOrigin, BundleProvenance, BundleRegistry,
    BundleSavedView, BundleSkill, BundleSkippedSkill, BundleTag, BundleTagGroup,
    PortableBundleDecision, PortableBundleDecisionAction, PortableBundleExportResult,
    PortableBundleExportSummary, PortableBundleImportPreview, PortableBundleImportResult,
    PortableBundleJobStatus, PortableBundleMetadataCounts, PortableBundleMetadataPreview,
    PortableBundleMetadataResult, PortableBundlePhase, PortableBundleProgressPayload,
    PortableBundleRenamedSkill, PortableBundleSkillIssue, PortableBundleSkillPreview,
    PortableBundleSkillStatus,
};
