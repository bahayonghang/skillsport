use std::collections::HashSet;
use std::path::PathBuf;

use crate::db::{self, DbPool};
use crate::operation_log::{
    local_target_context, record_operation_log_best_effort, OperationLogEvent,
};
use crate::services::{central_skills, github_import, installation, marketplace};
use crate::targets::ActiveTarget;

use super::{
    mutation_error, parse_install_source, CliApiError, CliContext, CliEntity, CliSkill,
    InstallFailure, InstallOutput, InstallSource, SyncOutput, SyncPlanItem,
};

fn github_error(error: github_import::GithubImportError) -> CliApiError {
    match error {
        github_import::GithubImportError::CentralMutation(error) => mutation_error(error),
        github_import::GithubImportError::InvalidUrl(message) => CliApiError::InvalidInput(message),
        github_import::GithubImportError::InvalidRepoUrl
        | github_import::GithubImportError::RepoUrlNotHttps
        | github_import::GithubImportError::RepoUrlNotGithub
        | github_import::GithubImportError::RepoUrlMissingOwner
        | github_import::GithubImportError::RepoUrlMissingRepo
        | github_import::GithubImportError::RepoUrlMissingOwnerRepo
        | github_import::GithubImportError::TreeUrlMissingBranch
        | github_import::GithubImportError::BlobUrlUnsupported
        | github_import::GithubImportError::InvalidBranchSelection
        | github_import::GithubImportError::BranchSelectionConflict => {
            CliApiError::InvalidInput(error.to_string())
        }
        github_import::GithubImportError::RepoNotFound
        | github_import::GithubImportError::NoImportableSkills => {
            CliApiError::not_found(CliEntity::Skill, error.to_string())
        }
        github_import::GithubImportError::TargetDirExists(_) => {
            CliApiError::Duplicate(error.to_string())
        }
        other => CliApiError::Internal(other.to_string()),
    }
}

fn marketplace_error(error: marketplace::MarketplaceError) -> CliApiError {
    match error {
        marketplace::MarketplaceError::DuplicateRequiresReplace(skill) => {
            CliApiError::duplicate(skill)
        }
        marketplace::MarketplaceError::GithubImport(error) => github_error(error),
        marketplace::MarketplaceError::SkillsShSourceInvalid
        | marketplace::MarketplaceError::SkillsShSkillIdUnsupported => {
            CliApiError::InvalidInput(error.to_string())
        }
        marketplace::MarketplaceError::SkillsShCandidateNotFound { .. }
        | marketplace::MarketplaceError::SkillNotImported(_) => {
            CliApiError::not_found(CliEntity::Skill, error.to_string())
        }
        other => CliApiError::Internal(other.to_string()),
    }
}

impl CliApiError {
    fn duplicate(skill: String) -> Self {
        Self::Duplicate(format!(
            "Skill '{skill}' already exists; pass --replace to overwrite it"
        ))
    }
}

impl CliContext {
    pub async fn list_skills(&self) -> Result<Vec<CliSkill>, CliApiError> {
        Ok(central_skills::get_central_skills_impl(&self.db)
            .await?
            .into_iter()
            .map(|skill| CliSkill {
                uid: skill.uid,
                id: skill.id,
                name: skill.name,
                description: skill.description,
                canonical_path: skill.canonical_path,
                linked_agents: skill.linked_agents,
            })
            .collect())
    }

    pub async fn show_skill(&self, reference: &str) -> Result<CliSkill, CliApiError> {
        let skill = central_skills::resolve_skill_ref_impl(&self.db, reference).await?;
        let linked_agents = db::get_skill_installations(&self.db, &skill.id)
            .await?
            .into_iter()
            .map(|installation| installation.agent_id)
            .collect();
        Ok(CliSkill {
            uid: skill.uid,
            id: skill.id,
            name: skill.name,
            description: skill.description,
            canonical_path: skill.canonical_path,
            linked_agents,
        })
    }

    pub async fn search_skills(
        &self,
        query: String,
        limit: Option<u32>,
    ) -> Result<Vec<marketplace::SkillsShSkill>, CliApiError> {
        marketplace::search_skills_sh_impl(&self.db, self.secrets.as_ref(), query, limit)
            .await
            .map_err(marketplace_error)
    }

    pub async fn install_skill(
        &self,
        source: &str,
        replace: bool,
        yes: bool,
        sync: bool,
        agent_ids: Vec<String>,
        method: &str,
    ) -> Result<InstallOutput, CliApiError> {
        validate_method(method)?;
        let parsed = parse_install_source(source)?;
        let (imported_skill_ids, failed) = match parsed {
            InstallSource::SkillsSh { source, skill_id } => {
                let imported = marketplace::install_from_skills_sh_with_options_impl(
                    &self.db,
                    self.secrets.as_ref(),
                    ActiveTarget::Local,
                    source,
                    skill_id,
                    replace,
                )
                .await
                .map_err(marketplace_error)?;
                (vec![imported], Vec::new())
            }
            InstallSource::GitHubUrl(url) => {
                let auth = github_import::github_direct_auth_from_secret_store(
                    &self.db,
                    self.secrets.as_ref(),
                )
                .await
                .map_err(github_error)?;
                let preview = github_import::preview_github_repo_import_with_auth(
                    &self.db,
                    &url,
                    auth.as_deref(),
                )
                .await
                .map_err(github_error)?;
                let conflicts = preview
                    .skills
                    .iter()
                    .filter(|skill| skill.conflict.is_some())
                    .collect::<Vec<_>>();
                if !conflicts.is_empty() && !replace {
                    return Err(CliApiError::Duplicate(format!(
                        "{} skill(s) already exist; pass --replace to overwrite",
                        conflicts.len()
                    )));
                }
                if replace && preview.skills.len() > 1 && !yes {
                    return Err(CliApiError::InvalidInput(
                        "Replacing multiple skills requires --yes".to_string(),
                    ));
                }
                let selections = preview
                    .skills
                    .iter()
                    .map(|skill| github_import::GitHubSkillImportSelection {
                        source_path: skill.source_path.clone(),
                        resolution: github_import::DuplicateResolution::Overwrite,
                        renamed_skill_id: None,
                    })
                    .collect();
                let result = github_import::import_github_repo_skills_partially_with_auth(
                    &self.db,
                    &url,
                    selections,
                    None,
                    auth.as_deref(),
                )
                .await
                .map_err(github_error)?;
                (
                    result
                        .imported_skills
                        .into_iter()
                        .map(|skill| skill.imported_skill_id)
                        .collect(),
                    result
                        .failed_skills
                        .into_iter()
                        .map(|failure| InstallFailure {
                            source_path: failure.source_path,
                            error: failure.error,
                        })
                        .collect(),
                )
            }
        };

        let sync_output = if sync && !imported_skill_ids.is_empty() {
            Some(
                self.sync_skills(imported_skill_ids.clone(), false, agent_ids, method, false)
                    .await?,
            )
        } else {
            None
        };
        let output = InstallOutput {
            imported_skill_ids,
            failed,
            sync: sync_output,
        };
        let status = if output.is_partial_failure() {
            "partial"
        } else {
            "succeeded"
        };
        record_operation_log_best_effort(
            &self.db,
            local_target_context(),
            OperationLogEvent::new("cli", "skills_install", status, "CLI skill install").details(
                serde_json::json!({
                    "source": "cli",
                    "importedCount": output.imported_skill_ids.len(),
                    "failedCount": output.failed.len(),
                    "syncRequested": sync,
                }),
            ),
        )
        .await;
        Ok(output)
    }

    pub async fn sync_skills(
        &self,
        references: Vec<String>,
        all: bool,
        agent_ids: Vec<String>,
        method: &str,
        dry_run: bool,
    ) -> Result<SyncOutput, CliApiError> {
        validate_method(method)?;
        if all && !references.is_empty() {
            return Err(CliApiError::InvalidInput(
                "Use explicit skill refs or --all, not both".to_string(),
            ));
        }
        if !all && references.is_empty() {
            return Err(CliApiError::InvalidInput(
                "skills sync requires refs or --all".to_string(),
            ));
        }

        let skills = if all {
            db::get_central_skills(&self.db).await?
        } else {
            let mut seen = HashSet::new();
            let mut skills = Vec::new();
            for reference in references {
                let skill = central_skills::resolve_skill_ref_impl(&self.db, &reference).await?;
                if seen.insert(skill.id.clone()) {
                    skills.push(skill);
                }
            }
            skills
        };
        let agents = selected_agents(&self.db, agent_ids).await?;
        let plans = skills
            .iter()
            .flat_map(|skill| {
                agents.iter().map(move |agent| SyncPlanItem {
                    uid: skill.uid.clone(),
                    id: skill.id.clone(),
                    agent_id: agent.id.clone(),
                    target_path: PathBuf::from(&agent.global_skills_dir)
                        .join(&skill.id)
                        .to_string_lossy()
                        .into_owned(),
                    method: method.to_string(),
                })
            })
            .collect::<Vec<_>>();
        if dry_run {
            return Ok(SyncOutput {
                dry_run: true,
                plans,
                result: None,
            });
        }

        let transport = installation::InstallTransport::for_target(&self.target)
            .await
            .map_err(|error| CliApiError::Internal(error.to_string()))?;
        let result = installation::batch_install_central_skills_impl(
            &self.db,
            &transport,
            skills.into_iter().map(|skill| skill.id).collect(),
            agents.into_iter().map(|agent| agent.id).collect(),
            method,
            None,
        )
        .await;
        let output = SyncOutput {
            dry_run: false,
            plans,
            result: Some(result),
        };
        let result = output.result.as_ref().expect("sync result");
        let status = match (
            result.succeeded.len() + result.skipped.len(),
            result.failed.len(),
        ) {
            (_, 0) => "succeeded",
            (0, _) => "failed",
            _ => "partial",
        };
        record_operation_log_best_effort(
            &self.db,
            local_target_context(),
            OperationLogEvent::new("cli", "skills_sync", status, "CLI skill sync").details(
                serde_json::json!({
                    "source": "cli",
                    "planCount": output.plans.len(),
                    "succeededCount": result.succeeded.len(),
                    "skippedCount": result.skipped.len(),
                    "failedCount": result.failed.len(),
                }),
            ),
        )
        .await;
        Ok(output)
    }
}

fn validate_method(method: &str) -> Result<(), CliApiError> {
    if matches!(method, "auto" | "symlink" | "copy") {
        Ok(())
    } else {
        Err(CliApiError::InvalidInput(
            "method must be auto, symlink, or copy".to_string(),
        ))
    }
}

async fn selected_agents(
    pool: &DbPool,
    requested: Vec<String>,
) -> Result<Vec<db::Agent>, CliApiError> {
    let all = db::get_all_agents(pool).await?;
    if requested.is_empty() {
        return Ok(all
            .into_iter()
            .filter(|agent| agent.id != "central" && agent.is_enabled)
            .collect());
    }
    let requested = requested.into_iter().collect::<HashSet<_>>();
    let selected = all
        .into_iter()
        .filter(|agent| requested.contains(&agent.id) && agent.id != "central" && agent.is_enabled)
        .collect::<Vec<_>>();
    if selected.len() != requested.len() {
        return Err(CliApiError::InvalidInput(
            "One or more requested agents are missing, disabled, or Central".to_string(),
        ));
    }
    Ok(selected)
}

#[cfg(test)]
mod tests {
    use super::{github_error, marketplace_error, CliApiError, CliEntity};
    use crate::services::{github_import, marketplace};

    #[test]
    fn imported_not_found_errors_stay_skill_codes() {
        let repo_missing = github_import::GithubImportError::RepoNotFound;
        let mapped = github_error(github_import::GithubImportError::RepoNotFound);
        assert!(matches!(
            mapped,
            CliApiError::NotFound {
                entity: CliEntity::Skill,
                ..
            }
        ));
        assert_eq!(mapped.code(), "skill.not_found");
        assert_eq!(mapped.exit_code(), 3);
        assert_eq!(mapped.to_string(), repo_missing.to_string());

        let none = github_import::GithubImportError::NoImportableSkills;
        let mapped = github_error(github_import::GithubImportError::NoImportableSkills);
        assert!(matches!(
            mapped,
            CliApiError::NotFound {
                entity: CliEntity::Skill,
                ..
            }
        ));
        assert_eq!(mapped.code(), "skill.not_found");
        assert_eq!(mapped.to_string(), none.to_string());

        let not_imported = marketplace::MarketplaceError::SkillNotImported("demo".into());
        let mapped = marketplace_error(marketplace::MarketplaceError::SkillNotImported(
            "demo".into(),
        ));
        assert!(matches!(
            mapped,
            CliApiError::NotFound {
                entity: CliEntity::Skill,
                ..
            }
        ));
        assert_eq!(mapped.code(), "skill.not_found");
        assert_eq!(mapped.to_string(), not_imported.to_string());

        let candidate = marketplace::MarketplaceError::SkillsShCandidateNotFound {
            skill_id: "skill".into(),
            owner: "owner".into(),
            repo: "repo".into(),
        };
        let mapped = marketplace_error(marketplace::MarketplaceError::SkillsShCandidateNotFound {
            skill_id: "skill".into(),
            owner: "owner".into(),
            repo: "repo".into(),
        });
        assert!(matches!(
            mapped,
            CliApiError::NotFound {
                entity: CliEntity::Skill,
                ..
            }
        ));
        assert_eq!(mapped.code(), "skill.not_found");
        assert_eq!(mapped.to_string(), candidate.to_string());
    }

    #[test]
    fn duplicate_helper_text_is_unchanged() {
        let error = CliApiError::duplicate("demo".into());
        assert_eq!(
            error.to_string(),
            "Skill 'demo' already exists; pass --replace to overwrite it"
        );
        assert_eq!(error.code(), "skill.duplicate");
        assert_eq!(error.exit_code(), 3);
    }
}
