mod skills;

use std::sync::Arc;

use serde::Serialize;

use crate::db::{self, DbPool};
use crate::secrets::{SecretStore, SystemSecretStore};
use crate::services::{central_skills, installation};
use crate::targets::ActiveTarget;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstallSource {
    SkillsSh { source: String, skill_id: String },
    GitHubUrl(String),
}

#[derive(Debug, thiserror::Error)]
pub enum CliApiError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Ambiguous(String),
    #[error("{0}")]
    Duplicate(String),
    #[error("{0}")]
    Busy(String),
    #[error("{0}")]
    Internal(String),
}

impl CliApiError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "input.invalid",
            Self::NotFound(_) => "skill.not_found",
            Self::Ambiguous(_) => "skill.ambiguous",
            Self::Duplicate(_) => "skill.duplicate",
            Self::Busy(_) => "mutation.busy",
            Self::Internal(_) => "internal.error",
        }
    }

    pub fn exit_code(&self) -> u8 {
        match self {
            Self::InvalidInput(_) => 2,
            Self::NotFound(_) | Self::Ambiguous(_) | Self::Duplicate(_) => 3,
            Self::Busy(_) => 4,
            Self::Internal(_) => 1,
        }
    }
}

impl From<sqlx::Error> for CliApiError {
    fn from(error: sqlx::Error) -> Self {
        Self::Internal(error.to_string())
    }
}

impl From<central_skills::CentralSkillsError> for CliApiError {
    fn from(error: central_skills::CentralSkillsError) -> Self {
        match error {
            central_skills::CentralSkillsError::SkillNotFound(reference) => {
                Self::NotFound(format!("Skill '{reference}' not found"))
            }
            central_skills::CentralSkillsError::AmbiguousSkillReference(reference) => {
                Self::Ambiguous(format!(
                    "Multiple skills are named '{reference}'; use uid or slug"
                ))
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
        let shown = context.show_skill(&listed[0].uid).await.unwrap();
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
        assert_eq!(CliApiError::NotFound("x".into()).exit_code(), 3);
        assert_eq!(CliApiError::Busy("x".into()).exit_code(), 4);
        assert_eq!(CliApiError::Internal("x".into()).exit_code(), 1);
    }
}
