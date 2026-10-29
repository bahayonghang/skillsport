//! Portable bundle v2 manifest and command DTOs.
//!
//! Everything serialized here is either written into `manifest.json` or
//! returned over IPC, so no type may carry database ids, `uid`, absolute
//! paths, hostnames, or credentials.

use serde::{Deserialize, Serialize};

pub(crate) const BUNDLE_KIND: &str = "skillport/bundle";
pub(crate) const BUNDLE_FORMAT_VERSION: u32 = 2;
pub(crate) const LEGACY_V1_KIND: &str = "skillport/state-export";
pub(crate) const MANIFEST_PATH: &str = "manifest.json";
pub(crate) const SKILLS_DIR: &str = "skills";
pub(crate) const MANIFEST_MAX_BYTES: u64 = 32 * 1024 * 1024;
pub(crate) const BUNDLE_PROGRESS_EVENT: &str = "central://portable-bundle-progress";
pub(crate) const BUNDLE_EXTENSIONS: &[&str] = &["skillport", "zip"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleManifest {
    pub kind: String,
    pub format_version: u32,
    pub created_at: String,
    pub app: BundleApp,
    pub origin: BundleOrigin,
    #[serde(default)]
    pub registries: Vec<BundleRegistry>,
    #[serde(default)]
    pub tag_groups: Vec<BundleTagGroup>,
    #[serde(default)]
    pub tags: Vec<BundleTag>,
    #[serde(default)]
    pub saved_views: Vec<BundleSavedView>,
    pub skills: Vec<BundleSkill>,
    #[serde(default)]
    pub skipped_skills: Vec<BundleSkippedSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleApp {
    pub name: String,
    pub version: String,
}

/// Only the target kind is recorded: SSH/WSL labels are user-chosen and often
/// equal a hostname, which must not leave the machine inside a bundle.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleOrigin {
    pub target_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleRegistry {
    pub name: String,
    pub url: String,
    pub source_type: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleTagGroup {
    pub key: String,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleTag {
    pub key: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub group_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleSavedView {
    pub name: String,
    pub query: String,
    pub sort_order: i64,
    pub icon: Option<String>,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleSkill {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    /// `skills/<id>`; payload entries live below this directory.
    pub payload_dir: String,
    /// Same algorithm as `CentralFs::hash_directories`.
    pub content_digest: String,
    pub files: Vec<BundleFile>,
    pub provenance: BundleProvenance,
    #[serde(default)]
    pub tag_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleFile {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BundleProvenance {
    #[serde(rename_all = "camelCase")]
    Github {
        owner: String,
        repo: String,
        /// `None` when the source branch was never recorded; import lets the
        /// update center resolve the default branch instead of guessing.
        branch: Option<String>,
        /// Normalized repository-relative skill directory (`.` for root).
        source_path: String,
        commit_sha: Option<String>,
    },
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BundleSkippedSkill {
    pub id: String,
    pub name: String,
    /// Stable reason code: `invalid_id`, `manifest_missing`, `read_failed`,
    /// `budget_exceeded`.
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleExportSummary {
    pub target_kind: String,
    pub skills: usize,
    pub skills_with_github_source: usize,
    pub tags: usize,
    pub tag_groups: usize,
    pub saved_views: usize,
    pub registries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleExportResult {
    pub skills_exported: usize,
    pub skipped_skills: Vec<BundleSkippedSkill>,
    pub file_count: usize,
    /// Sum of uncompressed payload bytes.
    pub content_bytes: u64,
    /// Size of the written bundle file.
    pub bundle_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PortableBundlePhase {
    Export,
    Read,
    Inspect,
    Classify,
    Apply,
    Metadata,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PortableBundleJobStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleProgressPayload {
    pub job_id: String,
    pub phase: PortableBundlePhase,
    pub status: PortableBundleJobStatus,
    pub total: usize,
    pub completed: usize,
    pub current_item: Option<String>,
}

/// How one bundle skill relates to the active target.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PortableBundleSkillStatus {
    /// No skill with this id exists on the target.
    New,
    /// A Central skill with this id has byte-identical content.
    Identical,
    /// A Central skill with this id has different content.
    Changed,
    /// The id is taken by a non-Central skill or an unregistered directory.
    ExistsUnmanaged,
    /// The bundle entry failed verification and cannot be imported.
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleSkillPreview {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: PortableBundleSkillStatus,
    /// Stable reason code for `invalid` entries.
    pub invalid_reason: Option<String>,
    pub has_github_source: bool,
    pub file_count: usize,
    pub content_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleMetadataCounts {
    pub add: usize,
    pub exists: usize,
    pub update: usize,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleMetadataPreview {
    pub registries: PortableBundleMetadataCounts,
    pub tag_groups: PortableBundleMetadataCounts,
    pub tags: PortableBundleMetadataCounts,
    pub saved_views: PortableBundleMetadataCounts,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleImportPreview {
    /// Opaque handle for apply/discard; bound to the active target.
    pub preview_token: String,
    pub created_at: String,
    pub app_version: String,
    pub origin_target_kind: String,
    pub skills: Vec<PortableBundleSkillPreview>,
    pub metadata: PortableBundleMetadataPreview,
    /// Skills the exporting side could not include.
    pub bundle_skipped_skills: Vec<BundleSkippedSkill>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PortableBundleDecisionAction {
    Skip,
    Overwrite,
    Rename,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleDecision {
    pub skill_id: String,
    pub action: PortableBundleDecisionAction,
    /// Required for `rename`: the new Central skill id.
    pub rename_to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleRenamedSkill {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleSkillIssue {
    pub id: String,
    /// Stable reason or error code; never a path or raw error text.
    pub code: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleMetadataResult {
    pub added: usize,
    pub updated: usize,
    pub unchanged: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PortableBundleImportResult {
    pub imported: Vec<String>,
    pub overwritten: Vec<String>,
    pub renamed: Vec<PortableBundleRenamedSkill>,
    pub skipped: Vec<PortableBundleSkillIssue>,
    pub failed: Vec<PortableBundleSkillIssue>,
    pub metadata: PortableBundleMetadataResult,
    pub cancelled: bool,
}
