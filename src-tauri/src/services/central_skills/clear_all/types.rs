//! IPC DTOs for Central clear-all. Shapes follow the cross-layer contract in
//! `.trellis/tasks/11-02-central-clear-all/design.md` (camelCase on the wire).

use serde::{Deserialize, Serialize};

use super::super::types::{BatchDeleteCentralSkillResult, FailedCentralSkillDelete};

/// Progress event emitted by `clear_central_skills`.
pub const CENTRAL_CLEAR_PROGRESS_EVENT: &str = "central://clear-progress";

/// The only wildcard key: "every item of this category that is still valid
/// after the locked rescan". Used when the preview list was truncated.
pub const CLEAR_ALL_WILDCARD_KEY: &str = "*";

/// Maximum path items returned per preview category.
pub const CLEAR_PREVIEW_PATH_LIMIT: usize = 2000;

pub const CLEAR_ERROR_REMOVE_FAILED: &str = "central_clear.remove_failed";
pub const CLEAR_ERROR_PATH_OUTSIDE_SCOPE: &str = "central_clear.path_outside_scope";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClearCentralOwnerKind {
    Agent,
    Project,
    Central,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralPathItem {
    /// Normalized comparison key (lowercase on Windows); apply intersects on it.
    pub key: String,
    pub path: String,
    pub owner_kind: ClearCentralOwnerKind,
    /// agentId / projectId / "central".
    pub owner_id: String,
    pub skill_name: Option<String>,
    pub dangling: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralAgentSummary {
    pub agent_id: String,
    /// DB-registered symlink/native installs removed with their skill.
    pub link_count: usize,
    /// DB-registered copy installs; kept unless the agent is selected.
    pub copy_count: usize,
    pub orphan_link_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralSweepWarning {
    pub path: String,
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralPreview {
    /// Correlation only; never an authorization token.
    pub preview_id: String,
    pub target_kind: String,
    pub central_root: String,
    pub skill_ids: Vec<String>,
    pub skill_preview_failed: Vec<FailedCentralSkillDelete>,
    pub agent_summaries: Vec<ClearCentralAgentSummary>,
    pub project_links: Vec<ClearCentralPathItem>,
    pub orphan_links: Vec<ClearCentralPathItem>,
    pub untracked_central_entries: Vec<ClearCentralPathItem>,
    /// Accurate counts even when the lists are truncated.
    pub project_link_count: usize,
    pub orphan_link_count: usize,
    pub untracked_central_entry_count: usize,
    pub skipped_unmanaged_count: usize,
    pub pending_recovery_count: usize,
    pub sweep_warnings: Vec<ClearCentralSweepWarning>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralRequest {
    #[serde(default)]
    pub preview_id: String,
    #[serde(default)]
    pub skill_ids: Vec<String>,
    #[serde(default)]
    pub remove_copy_agent_ids: Vec<String>,
    #[serde(default)]
    pub project_link_keys: Vec<String>,
    #[serde(default)]
    pub orphan_link_keys: Vec<String>,
    #[serde(default)]
    pub untracked_entry_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralPathFailure {
    pub key: String,
    pub path: String,
    pub error_code: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralPathOutcome {
    pub removed: usize,
    pub failed: Vec<ClearCentralPathFailure>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralRecoveryOutcome {
    pub recovered: usize,
    pub failed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralResult {
    pub skills: BatchDeleteCentralSkillResult,
    pub project_links: ClearCentralPathOutcome,
    pub orphan_links: ClearCentralPathOutcome,
    pub untracked_central_entries: ClearCentralPathOutcome,
    pub recovery: ClearCentralRecoveryOutcome,
    /// Requested items that no longer qualified after the locked rescan.
    pub skipped_changed: usize,
    pub cancelled: bool,
}

impl ClearCentralResult {
    pub fn succeeded_count(&self) -> usize {
        self.skills.succeeded.len()
            + self.project_links.removed
            + self.orphan_links.removed
            + self.untracked_central_entries.removed
    }

    pub fn failed_count(&self) -> usize {
        self.skills.failed.len()
            + self.project_links.failed.len()
            + self.orphan_links.failed.len()
            + self.untracked_central_entries.failed.len()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClearCentralPhase {
    Recovery,
    ProjectLinks,
    Skills,
    Untracked,
    OrphanLinks,
    Finalize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ClearCentralProgressStatus {
    Started,
    Running,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearCentralProgress {
    pub job_id: String,
    pub phase: ClearCentralPhase,
    pub status: ClearCentralProgressStatus,
    pub completed: usize,
    pub total: usize,
}
