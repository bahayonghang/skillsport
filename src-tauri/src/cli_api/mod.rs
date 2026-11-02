mod agents;
pub mod confirm;
mod import;
mod notes;
mod projects;
mod skills;
mod tags;

pub use agents::CliAgent;
pub use confirm::{ConfirmDecision, MutationOutput};
pub use import::{
    ImportPlan, ImportResult, ImportSyncError, SkillImportRequest, SkillImportSource,
};
pub use notes::{CliNote, NoteInput, NotePlan};
pub use projects::{
    CliProject, CliProjectSkill, ProjectAddPlan, ProjectAddResult, ProjectInstallFailure,
    ProjectInstallPlan, ProjectInstallRequest, ProjectInstallResult, ProjectInstallSuccess,
};
pub use skills::{
    CliExplanation, CliSkillDetail, CliSkillProject, CliSkillTag, UnlinkFailure, UnlinkPlan,
    UnlinkResult,
};
pub use tags::{
    CliTag, CliTagGroup, TagAddRequest, TagCreatePlan, TagCreateResult, TagLinkPlan, TagLinkResult,
};

#[cfg(test)]
mod import_tests;
#[cfg(test)]
mod install_mutation_tests;
#[cfg(test)]
mod mutation_tests;
#[cfg(test)]
mod read_tests;

use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;

use crate::db::{self, DbPool};
use crate::secrets::{SecretStore, SystemSecretStore};
use crate::services::{central_skills, installation};
use crate::targets::ActiveTarget;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstallSource {
    SkillsSh { source: String, skill_id: String },
    GitHubUrl(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CliEntity {
    Skill,
    Agent,
    Project,
    Tag,
    TagGroup,
}

#[derive(Debug, thiserror::Error)]
pub enum CliApiError {
    #[error("{0}")]
    InvalidInput(String),
    /// A destructive or batch mutation was requested without `--yes`.
    /// `plans` is the dry-run plan list the caller should show for confirmation.
    #[error("{message}")]
    ConfirmationRequired { message: String, plans: Value },
    #[error("{0}")]
    InvalidPath(String),
    #[error("{message}")]
    NotFound { entity: CliEntity, message: String },
    #[error("{message}")]
    Ambiguous { entity: CliEntity, message: String },
    #[error("{0}")]
    Duplicate(String),
    /// The ZIP archive bytes changed between the preview read and the import read.
    #[error("{0}")]
    ArchiveChanged(String),
    #[error("{0}")]
    Busy(String),
    #[error("{0}")]
    Internal(String),
}

impl CliApiError {
    pub fn not_found(entity: CliEntity, message: impl Into<String>) -> Self {
        Self::NotFound {
            entity,
            message: message.into(),
        }
    }

    pub fn ambiguous(entity: CliEntity, message: impl Into<String>) -> Self {
        Self::Ambiguous {
            entity,
            message: message.into(),
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "input.invalid",
            Self::ConfirmationRequired { .. } => "input.confirmation_required",
            Self::InvalidPath(_) => "path.invalid",
            Self::NotFound { entity, .. } => match entity {
                CliEntity::Skill => "skill.not_found",
                CliEntity::Agent => "agent.not_found",
                CliEntity::Project => "project.not_found",
                CliEntity::Tag => "tag.not_found",
                CliEntity::TagGroup => "tag_group.not_found",
            },
            Self::Ambiguous { entity, .. } => match entity {
                CliEntity::Skill => "skill.ambiguous",
                CliEntity::Project => "project.ambiguous",
                CliEntity::TagGroup => "tag_group.ambiguous",
                // No production call site uses these yet. The arms exist so the
                // match stays exhaustive and the codes stay intentional.
                CliEntity::Agent => "agent.ambiguous",
                CliEntity::Tag => "tag.ambiguous",
            },
            Self::Duplicate(_) => "skill.duplicate",
            Self::ArchiveChanged(_) => "archive.fingerprint_mismatch",
            Self::Busy(_) => "mutation.busy",
            Self::Internal(_) => "internal.error",
        }
    }

    pub fn exit_code(&self) -> u8 {
        match self {
            Self::InvalidInput(_) | Self::ConfirmationRequired { .. } | Self::InvalidPath(_) => 2,
            Self::NotFound { .. }
            | Self::Ambiguous { .. }
            | Self::Duplicate(_)
            | Self::ArchiveChanged(_) => 3,
            Self::Busy(_) => 4,
            Self::Internal(_) => 1,
        }
    }

    /// Structured error details for the JSON envelope. Only the confirmation
    /// error carries details (`{ "plans": [...] }`); every other error is `{}`.
    pub fn details(&self) -> Value {
        match self {
            Self::ConfirmationRequired { plans, .. } => serde_json::json!({ "plans": plans }),
            _ => serde_json::json!({}),
        }
    }
}

impl From<crate::services::ai_tagging::AiTaggingError> for CliApiError {
    fn from(error: crate::services::ai_tagging::AiTaggingError) -> Self {
        Self::Internal(error.to_string())
    }
}

impl From<sqlx::Error> for CliApiError {
    fn from(error: sqlx::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

impl From<crate::services::ai_provider::AiProviderError> for CliApiError {
    fn from(error: crate::services::ai_provider::AiProviderError) -> Self {
        Self::Internal(error.to_string())
    }
}

impl From<crate::services::projects::ProjectsError> for CliApiError {
    fn from(error: crate::services::projects::ProjectsError) -> Self {
        use crate::services::projects::ProjectsError;
        match &error {
            ProjectsError::ProjectNotFound(_) => {
                Self::not_found(CliEntity::Project, error.to_string())
            }
            ProjectsError::ProjectPathEmpty
            | ProjectsError::ProjectPathInvalid(_)
            | ProjectsError::ProjectPathMissingOrNotDir(_) => Self::InvalidPath(error.to_string()),
            ProjectsError::AgentNotFound(_) => Self::not_found(CliEntity::Agent, error.to_string()),
            ProjectsError::SkillNotFoundInCentral(_) => {
                Self::not_found(CliEntity::Skill, error.to_string())
            }
            _ => Self::Internal(error.to_string()),
        }
    }
}

impl From<central_skills::CentralSkillsError> for CliApiError {
    fn from(error: central_skills::CentralSkillsError) -> Self {
        match error {
            central_skills::CentralSkillsError::SkillNotFound(reference) => {
                Self::not_found(CliEntity::Skill, format!("Skill '{reference}' not found"))
            }
            central_skills::CentralSkillsError::AmbiguousSkillReference(reference) => {
                Self::ambiguous(
                    CliEntity::Skill,
                    format!("Multiple skills are named '{reference}'; use uid or slug"),
                )
            }
            central_skills::CentralSkillsError::CentralMutation(error) => mutation_error(error),
            other => Self::Internal(other.to_string()),
        }
    }
}

fn mutation_error(error: crate::services::central_mutation::CentralMutationError) -> CliApiError {
    use crate::services::central_mutation::CentralMutationError;
    match error {
        CentralMutationError::Busy { .. } | CentralMutationError::Timeout { .. } => {
            CliApiError::Busy(error.to_string())
        }
        other => CliApiError::Internal(other.to_string()),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliSkill {
    pub uid: String,
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub canonical_path: Option<String>,
    pub linked_agents: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlanItem {
    pub uid: String,
    pub id: String,
    pub agent_id: String,
    pub target_path: String,
    pub method: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOutput {
    pub dry_run: bool,
    pub plans: Vec<SyncPlanItem>,
    pub result: Option<installation::CentralBatchInstallResult>,
}

impl SyncOutput {
    pub fn is_partial_failure(&self) -> bool {
        self.result
            .as_ref()
            .is_some_and(|result| !result.failed.is_empty())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFailure {
    pub source_path: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutput {
    pub imported_skill_ids: Vec<String>,
    pub failed: Vec<InstallFailure>,
    pub sync: Option<SyncOutput>,
}

impl InstallOutput {
    pub fn is_partial_failure(&self) -> bool {
        !self.failed.is_empty()
            || self
                .sync
                .as_ref()
                .is_some_and(SyncOutput::is_partial_failure)
    }
}

pub struct CliContext {
    db: DbPool,
    secrets: Arc<dyn SecretStore>,
    target: ActiveTarget,
}

impl CliContext {
    pub async fn open_default() -> Result<Self, CliApiError> {
        let app_dir = crate::paths::app_data_dir();
        std::fs::create_dir_all(&app_dir)
            .map_err(|error| CliApiError::Internal(error.to_string()))?;
        let db_path = app_dir.join("db.sqlite");
        let db = db::open_database(&db_path).await?;
        Ok(Self {
            db,
            secrets: Arc::new(SystemSecretStore::default()),
            target: ActiveTarget::Local,
        })
    }

    pub fn new(db: DbPool, secrets: Arc<dyn SecretStore>) -> Self {
        Self {
            db,
            secrets,
            target: ActiveTarget::Local,
        }
    }
}

/// Record a best-effort, redacted Operation Log row for a CLI mutation.
///
/// Category, action, and phase come from the registered GUI command that
/// performs the same mutation, so CLI and GUI rows share one audit taxonomy.
/// `phase_override` replaces the GUI phase only when the GUI command does
/// work the CLI does not (for example a network AI call).
/// The CLI never owns that command's lifecycle or correlation id: this writes
/// one terminal row with `source = "cli"`. `details` must contain only counts,
/// booleans, and static values.
async fn record_cli_mutation_log(
    pool: &DbPool,
    gui_command: &'static str,
    phase_override: Option<&'static str>,
    status: &str,
    summary: &'static str,
    error: Option<&'static str>,
    details: Value,
) {
    record_cli_mutation_log_as(
        pool,
        gui_command,
        gui_command,
        phase_override,
        status,
        summary,
        error,
        details,
    )
    .await;
}

/// Like [`record_cli_mutation_log`], but for a CLI mutation with no GUI
/// command of its own: category and phase come from `policy_command`, the
/// row's action is `action`.
#[allow(clippy::too_many_arguments)]
async fn record_cli_mutation_log_as(
    pool: &DbPool,
    policy_command: &'static str,
    action: &'static str,
    phase_override: Option<&'static str>,
    status: &str,
    summary: &'static str,
    error: Option<&'static str>,
    details: Value,
) {
    use crate::observability::CommandLogPolicy;
    use crate::operation_log::{
        local_target_context, record_operation_log_best_effort, OperationLogEvent,
    };

    let (category, phase) =
        match crate::ipc_registry::command_policy(policy_command).map(|entry| entry.policy) {
            Some(CommandLogPolicy::Operation(definition)) => (
                definition.category().as_str(),
                definition.default_phase().as_str(),
            ),
            _ => ("cli", "database"),
        };
    let mut details = match details {
        Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    details.insert("source".to_string(), Value::from("cli"));
    details.insert(
        "phase".to_string(),
        Value::from(phase_override.unwrap_or(phase)),
    );
    let mut event =
        OperationLogEvent::new(category, action, status, summary).details(Value::Object(details));
    if let Some(error) = error {
        event = event.error(error);
    }
    record_operation_log_best_effort(pool, local_target_context(), event).await;
}

pub fn parse_install_source(value: &str) -> Result<InstallSource, CliApiError> {
    let value = value.trim();
    if let Ok(url) = reqwest::Url::parse(value) {
        if matches!(url.scheme(), "http" | "https") && url.host_str() == Some("github.com") {
            return Ok(InstallSource::GitHubUrl(value.to_string()));
        }
        return Err(CliApiError::InvalidInput(
            "Only github.com repository URLs are supported".to_string(),
        ));
    }

    let (source, skill_id) = value.split_once('@').ok_or_else(|| {
        CliApiError::InvalidInput(
            "Install source must be owner/repo@skill or a GitHub URL".to_string(),
        )
    })?;
    let mut parts = source.split('/');
    let owner = parts.next().unwrap_or_default();
    let repo = parts.next().unwrap_or_default();
    if owner.is_empty() || repo.is_empty() || parts.next().is_some() || skill_id.is_empty() {
        return Err(CliApiError::InvalidInput(
            "Install source must be owner/repo@skill".to_string(),
        ));
    }
    Ok(InstallSource::SkillsSh {
        source: format!("{owner}/{repo}"),
        skill_id: skill_id.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{github_import, marketplace};
    use crate::test_support::mem_pool;
    use std::collections::HashMap;

    #[test]
    fn source_classification_is_deterministic() {
        assert_eq!(
            parse_install_source("vercel-labs/agent-skills@react-best-practices").unwrap(),
            InstallSource::SkillsSh {
                source: "vercel-labs/agent-skills".to_string(),
                skill_id: "react-best-practices".to_string(),
            }
        );
        assert_eq!(
            parse_install_source("https://github.com/openai/skills/tree/main/skills/docs").unwrap(),
            InstallSource::GitHubUrl(
                "https://github.com/openai/skills/tree/main/skills/docs".to_string()
            )
        );
        assert!(parse_install_source("./local-skill").is_err());
        assert!(parse_install_source("https://example.com/repo").is_err());
    }

    #[tokio::test]
    async fn exact_shorthand_fixture_runs_import_list_show_and_sync_preview() {
        let parsed = parse_install_source("vercel-labs/agent-skills@react-best-practices").unwrap();
        let InstallSource::SkillsSh { source, skill_id } = parsed else {
            panic!("expected skills.sh shorthand");
        };
        assert_eq!(source, "vercel-labs/agent-skills");

        let pool = mem_pool().await;
        let temp = tempfile::tempdir().unwrap();
        let central_root = temp.path().join("central");
        crate::test_support::set_agent_dir(&pool, "central", &central_root).await;
        std::fs::create_dir_all(&central_root).unwrap();
        let repo = github_import::GitHubRepoRef {
            owner: "vercel-labs".to_string(),
            repo: "agent-skills".to_string(),
            branch: "main".to_string(),
            normalized_url: "https://github.com/vercel-labs/agent-skills".to_string(),
        };
        let snapshot = github_import::GitHubRepoSnapshot {
            files: HashMap::from([(
                "skills/react-best-practices/SKILL.md".to_string(),
                b"---\nname: React Best Practices\ndescription: React guidance\n---\n# React\n"
                    .to_vec(),
            )]),
        };
        let candidate =
            marketplace::resolve_skills_sh_candidate_from_snapshot(&repo, &snapshot, &skill_id)
                .unwrap();
        let inspected = github_import::InspectedGitHubRepoSkills {
            repo: repo.clone(),
            valid_candidates: vec![candidate.clone()],
            invalid_candidates: Vec::new(),
        };
        let imported = github_import::import_github_repo_skills_from_snapshot_partially(
            &pool,
            &repo,
            &snapshot,
            inspected,
            vec![github_import::GitHubSkillImportSelection {
                source_path: candidate.source_path.clone(),
                resolution: github_import::DuplicateResolution::Overwrite,
                renamed_skill_id: None,
            }],
            &central_root,
            None,
        )
        .await
        .unwrap();
        assert_eq!(imported.imported_skills.len(), 1);

        let preview = github_import::build_preview_skills(&pool, &[candidate])
            .await
            .unwrap();
        assert!(preview[0].conflict.is_some());

        let context = CliContext::new(pool, Arc::new(crate::secrets::MockSecretStore::default()));
        let listed = context.list_skills().await.unwrap();
        assert_eq!(listed.len(), 1);
        let shown = context.show_skill(&listed[0].uid, "en").await.unwrap();
        assert_eq!(shown.id, "react-best-practices");
        let sync = context
            .sync_skills(
                vec![shown.uid],
                false,
                vec!["codex".to_string()],
                "copy",
                true,
            )
            .await
            .unwrap();
        assert_eq!(sync.plans.len(), 1);
        assert!(sync.result.is_none());
    }

    #[test]
    fn exit_codes_are_stable() {
        assert_eq!(CliApiError::InvalidInput("x".into()).exit_code(), 2);
        assert_eq!(CliApiError::Duplicate("x".into()).exit_code(), 3);
        assert_eq!(CliApiError::Duplicate("x".into()).code(), "skill.duplicate");
        assert_eq!(CliApiError::Busy("x".into()).exit_code(), 4);
        assert_eq!(CliApiError::Busy("x".into()).code(), "mutation.busy");
        assert_eq!(CliApiError::Internal("x".into()).exit_code(), 1);
        assert_eq!(CliApiError::Internal("x".into()).code(), "internal.error");
        assert_eq!(
            CliApiError::InvalidInput("x".into()).code(),
            "input.invalid"
        );

        for entity in [
            CliEntity::Skill,
            CliEntity::Agent,
            CliEntity::Project,
            CliEntity::Tag,
            CliEntity::TagGroup,
        ] {
            assert_eq!(CliApiError::not_found(entity, "x").exit_code(), 3);
            assert_eq!(CliApiError::ambiguous(entity, "x").exit_code(), 3);
            assert_eq!(CliApiError::not_found(entity, "x").to_string(), "x");
            assert_eq!(CliApiError::ambiguous(entity, "x").to_string(), "x");
        }
    }

    #[test]
    fn entity_error_codes_keep_skill_codes_and_name_read_entities() {
        let cases = [
            (
                CliApiError::not_found(CliEntity::Skill, "Skill 'ref' not found"),
                "skill.not_found",
                "Skill 'ref' not found",
            ),
            (
                CliApiError::ambiguous(
                    CliEntity::Skill,
                    "Multiple skills are named 'ref'; use uid or slug",
                ),
                "skill.ambiguous",
                "Multiple skills are named 'ref'; use uid or slug",
            ),
            (
                CliApiError::not_found(CliEntity::Agent, "missing"),
                "agent.not_found",
                "missing",
            ),
            (
                CliApiError::not_found(CliEntity::Project, "missing"),
                "project.not_found",
                "missing",
            ),
            (
                CliApiError::ambiguous(CliEntity::Project, "duplicate"),
                "project.ambiguous",
                "duplicate",
            ),
            (
                CliApiError::not_found(CliEntity::Tag, "missing"),
                "tag.not_found",
                "missing",
            ),
            (
                CliApiError::ambiguous(CliEntity::Agent, "duplicate"),
                "agent.ambiguous",
                "duplicate",
            ),
            (
                CliApiError::ambiguous(CliEntity::Tag, "duplicate"),
                "tag.ambiguous",
                "duplicate",
            ),
        ];

        for (error, code, message) in cases {
            assert_eq!(error.code(), code);
            assert_eq!(error.to_string(), message);
            assert_eq!(error.exit_code(), 3);
        }
    }

    #[test]
    fn central_skill_reference_errors_keep_skill_messages() {
        let missing: CliApiError =
            central_skills::CentralSkillsError::SkillNotFound("ref".into()).into();
        assert!(matches!(
            missing,
            CliApiError::NotFound {
                entity: CliEntity::Skill,
                ..
            }
        ));
        assert_eq!(missing.to_string(), "Skill 'ref' not found");
        assert_eq!(missing.code(), "skill.not_found");
        assert_eq!(missing.exit_code(), 3);

        let ambiguous: CliApiError =
            central_skills::CentralSkillsError::AmbiguousSkillReference("ref".into()).into();
        assert!(matches!(
            ambiguous,
            CliApiError::Ambiguous {
                entity: CliEntity::Skill,
                ..
            }
        ));
        assert_eq!(
            ambiguous.to_string(),
            "Multiple skills are named 'ref'; use uid or slug"
        );
        assert_eq!(ambiguous.code(), "skill.ambiguous");
        assert_eq!(ambiguous.exit_code(), 3);
    }
}
