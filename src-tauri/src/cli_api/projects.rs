use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::db::repos::projects_repo;
use crate::db::{Agent, DbPool, Project};
use crate::paths::{path_to_string, paths_equivalent};
use crate::services::installation::project::project_relative_skills_dir;
use crate::services::projects::crud::project_name_from_path;
use crate::services::projects::{
    add_project_impl, get_project_skills_impl, install_skill_to_project_impl, list_projects_impl,
    normalize_project_path, project_id_from_path, rescan_project_impl,
    uninstall_skill_from_project_impl,
};

use super::agents::resolve_target_agent;
use super::confirm::{self, ConfirmDecision, MutationOutput};
use super::tags::resolve_skills;
use super::{record_cli_mutation_log, CliApiError, CliContext, CliEntity};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub pinned: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliProjectSkill {
    pub skill_id: String,
    pub name: String,
    pub description: Option<String>,
    pub agent_id: String,
    pub agent_display_name: String,
    pub installed_path: String,
    pub link_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAddPlan {
    /// Existing id, or the id a new project row receives.
    pub id: String,
    pub name: String,
    pub path: String,
    /// The path is already registered; add returns the existing row.
    pub exists: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAddResult {
    pub created: bool,
    pub project: CliProject,
    /// Skills found by the post-add scan. `None` when the scan failed; the
    /// project row is still registered.
    pub skill_count: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInstallPlan {
    pub project_id: String,
    pub project_path: String,
    pub skill_uid: String,
    pub skill_id: String,
    pub agent_id: String,
    pub target_path: String,
    /// `install` or `uninstall`.
    pub action: &'static str,
    /// Resolved install method (`symlink` or `copy`); `None` for uninstall.
    pub method: Option<&'static str>,
    /// A project install row already exists for this skill and agent.
    pub already_installed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInstallSuccess {
    pub skill_id: String,
    pub agent_id: String,
    pub installed_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInstallFailure {
    pub skill_id: String,
    pub agent_id: String,
    pub error: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInstallResult {
    pub succeeded: Vec<ProjectInstallSuccess>,
    /// Skill ids with nothing to do (uninstall of a skill that has no project
    /// install row for this agent).
    pub skipped: Vec<String>,
    pub failed: Vec<ProjectInstallFailure>,
}

impl ProjectInstallResult {
    pub fn has_failures(&self) -> bool {
        !self.failed.is_empty()
    }

    fn log_status(&self) -> &'static str {
        match (self.succeeded.len() + self.skipped.len(), self.failed.len()) {
            (_, 0) => "succeeded",
            (0, _) => "failed",
            _ => "partial",
        }
    }

    fn log_details(&self, plan_count: usize) -> serde_json::Value {
        serde_json::json!({
            "planCount": plan_count,
            "succeededCount": self.succeeded.len(),
            "skippedCount": self.skipped.len(),
            "failedCount": self.failed.len(),
        })
    }
}

/// Inputs for `projects install`.
pub struct ProjectInstallRequest<'a> {
    pub project_ref: &'a str,
    pub skill_refs: &'a [String],
    pub agent_id: &'a str,
    pub method: &'a str,
    pub cwd: &'a Path,
    pub dry_run: bool,
    pub yes: bool,
}

impl CliContext {
    /// Register a project directory (default: `cwd`), then scan it once, the
    /// same as the GUI `add_project` command. Idempotent: an existing path
    /// returns the existing row. Takes no Central lock, like the GUI.
    pub async fn add_project(
        &self,
        path: Option<&str>,
        cwd: &Path,
        dry_run: bool,
    ) -> Result<MutationOutput<ProjectAddPlan, ProjectAddResult>, CliApiError> {
        let candidate = match path.map(str::trim) {
            None | Some("") | Some(".") => cwd.to_path_buf(),
            Some(value) => {
                let value = Path::new(value);
                if value.is_absolute() {
                    value.to_path_buf()
                } else {
                    cwd.join(value)
                }
            }
        };
        let normalized = normalize_project_path(&path_to_string(&candidate));
        if !Path::new(&normalized).is_dir() {
            return Err(CliApiError::InvalidPath(format!(
                "Project path '{normalized}' does not exist or is not a directory"
            )));
        }
        let existing = projects_repo::get_project_by_path(&self.db, &normalized).await?;
        let plan = ProjectAddPlan {
            id: existing
                .as_ref()
                .map(|project| project.id.clone())
                .unwrap_or_else(|| project_id_from_path(&normalized)),
            name: existing
                .as_ref()
                .map(|project| project.name.clone())
                .unwrap_or_else(|| project_name_from_path(&normalized)),
            path: normalized.clone(),
            exists: existing.is_some(),
        };
        let plans = vec![plan];
        if confirm::require(&plans, false, false, dry_run)? == ConfirmDecision::DryRun {
            return Ok(MutationOutput::dry_run(plans));
        }

        let project = match add_project_impl(&self.db, &normalized).await {
            Ok(project) => project,
            Err(error) => {
                let error = CliApiError::from(error);
                record_cli_mutation_log(
                    &self.db,
                    "add_project",
                    None,
                    "failed",
                    "Project add failed.",
                    Some(error.code()),
                    serde_json::json!({}),
                )
                .await;
                return Err(error);
            }
        };
        let created = existing.is_none();
        record_cli_mutation_log(
            &self.db,
            "add_project",
            None,
            "succeeded",
            "Project added.",
            None,
            serde_json::json!({ "created": created }),
        )
        .await;
        // The GUI scans in the background after add; the CLI waits for it so
        // `projects skills` sees existing installs. Scan failure keeps the row.
        let skill_count = rescan_project_impl(&self.db, &project.id).await.ok();
        let project = projects_repo::get_project_by_id(&self.db, &project.id)
            .await?
            .unwrap_or(project);
        Ok(MutationOutput::applied(
            plans,
            ProjectAddResult {
                created,
                project: CliProject {
                    id: project.id,
                    name: project.name,
                    path: project.path,
                    pinned: project.pinned,
                },
                skill_count,
            },
        ))
    }

    /// Install Central skills into one project for one agent through
    /// `install_skill_to_project_impl`, the service the GUI command uses.
    /// Like the GUI command, this takes no Central mutation lock: it writes
    /// only the project tree and `project_skill_installations`.
    /// More than one skill, or replacing an existing install, needs `--yes`.
    pub async fn install_to_project(
        &self,
        request: ProjectInstallRequest<'_>,
    ) -> Result<MutationOutput<ProjectInstallPlan, ProjectInstallResult>, CliApiError> {
        let method = resolve_project_method(request.method)?;
        let project = resolve_project(&self.db, request.project_ref, request.cwd).await?;
        let agent = resolve_target_agent(&self.db, request.agent_id, true).await?;
        let skills = resolve_skills(&self.db, request.skill_refs).await?;
        let skills_dir = project_skills_dir(&project, &agent)?;
        let mut plans = Vec::with_capacity(skills.len());
        for skill in &skills {
            let installed = projects_repo::get_project_skill_installation(
                &self.db,
                &project.id,
                &skill.id,
                &agent.id,
            )
            .await?;
            plans.push(ProjectInstallPlan {
                project_id: project.id.clone(),
                project_path: project.path.clone(),
                skill_uid: skill.uid.clone(),
                skill_id: skill.id.clone(),
                agent_id: agent.id.clone(),
                target_path: path_to_string(&skills_dir.join(&skill.id)),
                action: "install",
                method: Some(method),
                already_installed: installed.is_some(),
            });
        }
        let needs_confirmation = plans.len() > 1 || plans.iter().any(|plan| plan.already_installed);
        if confirm::require(&plans, needs_confirmation, request.yes, request.dry_run)?
            == ConfirmDecision::DryRun
        {
            return Ok(MutationOutput::dry_run(plans));
        }

        let mut result = ProjectInstallResult::default();
        let mut first_failure_code: Option<&'static str> = None;
        for plan in &plans {
            match install_skill_to_project_impl(
                &self.db,
                &project.id,
                &plan.skill_id,
                &agent.id,
                method,
            )
            .await
            {
                Ok(installation) => result.succeeded.push(ProjectInstallSuccess {
                    skill_id: installation.skill_id,
                    agent_id: installation.agent_id,
                    installed_path: installation.installed_path,
                }),
                Err(error) => {
                    let error = CliApiError::from(error);
                    first_failure_code.get_or_insert(error.code());
                    result.failed.push(ProjectInstallFailure {
                        skill_id: plan.skill_id.clone(),
                        agent_id: agent.id.clone(),
                        error: error.to_string(),
                    });
                }
            }
        }
        record_cli_mutation_log(
            &self.db,
            "install_skill_to_project",
            None,
            result.log_status(),
            "Skills installed to project.",
            first_failure_code,
            result.log_details(plans.len()),
        )
        .await;
        Ok(MutationOutput::applied(plans, result))
    }

    /// Remove skills from one project for one agent through
    /// `uninstall_skill_from_project_impl`. Always needs `--yes`. Like the GUI
    /// command, this takes no Central mutation lock. Skills with no project
    /// install row for the agent are reported in `skipped`.
    pub async fn uninstall_from_project(
        &self,
        project_ref: &str,
        skill_refs: &[String],
        agent_id: &str,
        cwd: &Path,
        dry_run: bool,
        yes: bool,
    ) -> Result<MutationOutput<ProjectInstallPlan, ProjectInstallResult>, CliApiError> {
        let project = resolve_project(&self.db, project_ref, cwd).await?;
        let agent = resolve_target_agent(&self.db, agent_id, false).await?;
        let skills = resolve_skills(&self.db, skill_refs).await?;
        let skills_dir = project_skills_dir(&project, &agent).ok();
        let mut plans = Vec::with_capacity(skills.len());
        for skill in &skills {
            let installed = projects_repo::get_project_skill_installation(
                &self.db,
                &project.id,
                &skill.id,
                &agent.id,
            )
            .await?;
            let target_path = match (&installed, &skills_dir) {
                (Some(row), _) => row.installed_path.clone(),
                (None, Some(dir)) => path_to_string(&dir.join(&skill.id)),
                (None, None) => String::new(),
            };
            plans.push(ProjectInstallPlan {
                project_id: project.id.clone(),
                project_path: project.path.clone(),
                skill_uid: skill.uid.clone(),
                skill_id: skill.id.clone(),
                agent_id: agent.id.clone(),
                target_path,
                action: "uninstall",
                method: None,
                already_installed: installed.is_some(),
            });
        }
        if confirm::require(&plans, true, yes, dry_run)? == ConfirmDecision::DryRun {
            return Ok(MutationOutput::dry_run(plans));
        }

        let mut result = ProjectInstallResult::default();
        let mut first_failure_code: Option<&'static str> = None;
        for plan in &plans {
            if !plan.already_installed {
                result.skipped.push(plan.skill_id.clone());
                continue;
            }
            match uninstall_skill_from_project_impl(
                &self.db,
                &project.id,
                &plan.skill_id,
                &agent.id,
            )
            .await
            {
                Ok(()) => result.succeeded.push(ProjectInstallSuccess {
                    skill_id: plan.skill_id.clone(),
                    agent_id: agent.id.clone(),
                    installed_path: plan.target_path.clone(),
                }),
                Err(error) => {
                    let error = CliApiError::from(error);
                    first_failure_code.get_or_insert(error.code());
                    result.failed.push(ProjectInstallFailure {
                        skill_id: plan.skill_id.clone(),
                        agent_id: agent.id.clone(),
                        error: error.to_string(),
                    });
                }
            }
        }
        record_cli_mutation_log(
            &self.db,
            "uninstall_skill_from_project",
            None,
            result.log_status(),
            "Skills uninstalled from project.",
            first_failure_code,
            result.log_details(plans.len()),
        )
        .await;
        Ok(MutationOutput::applied(plans, result))
    }

    pub async fn list_projects(&self) -> Result<Vec<CliProject>, CliApiError> {
        Ok(list_projects_impl(&self.db)
            .await?
            .into_iter()
            .map(|project| CliProject {
                id: project.id,
                name: project.name,
                path: project.path,
                pinned: project.pinned,
            })
            .collect())
    }

    pub async fn list_project_skills(
        &self,
        reference: &str,
        cwd: &Path,
    ) -> Result<Vec<CliProjectSkill>, CliApiError> {
        let project = resolve_project(&self.db, reference, cwd).await?;
        Ok(get_project_skills_impl(&self.db, &project.id)
            .await?
            .into_iter()
            .map(|skill| CliProjectSkill {
                skill_id: skill.skill_id,
                name: skill.name,
                description: skill.description,
                agent_id: skill.agent_id,
                agent_display_name: skill.agent_display_name,
                installed_path: skill.installed_path,
                link_type: skill.link_type,
            })
            .collect())
    }
}

/// CLI method values. `auto` keeps the project service default (symlink).
fn resolve_project_method(method: &str) -> Result<&'static str, CliApiError> {
    match method {
        "auto" | "symlink" => Ok("symlink"),
        "copy" => Ok("copy"),
        _ => Err(CliApiError::InvalidInput(
            "method must be auto, symlink, or copy".to_string(),
        )),
    }
}

fn project_skills_dir(project: &Project, agent: &Agent) -> Result<PathBuf, CliApiError> {
    let relative = project_relative_skills_dir(agent)
        .map_err(|error| CliApiError::InvalidInput(error.to_string()))?;
    Ok(Path::new(&project.path).join(relative))
}

/// Resolve a project reference. `cwd` is explicit so tests do not change the
/// process working directory. `.` means that directory.
async fn resolve_project(
    pool: &DbPool,
    reference: &str,
    cwd: &Path,
) -> Result<Project, CliApiError> {
    if let Some(project) = projects_repo::get_project_by_id(pool, reference).await? {
        return Ok(project);
    }

    let projects = projects_repo::list_projects(pool).await?;
    if let Some(candidate) = absolute_project_candidate(reference, cwd) {
        let normalized = normalize_project_path(&path_to_string(&candidate));
        if let Some(project) = projects
            .iter()
            .find(|project| paths_equivalent(Path::new(&project.path), Path::new(&normalized)))
        {
            return Ok(project.clone());
        }
    }

    let matches = projects
        .into_iter()
        .filter(|project| project.name == reference)
        .collect::<Vec<_>>();
    if matches.len() > 1 {
        return Err(CliApiError::ambiguous(
            CliEntity::Project,
            format!("Multiple projects are named '{reference}'"),
        ));
    }
    matches.into_iter().next().ok_or_else(|| {
        CliApiError::not_found(
            CliEntity::Project,
            format!("Project '{reference}' not found"),
        )
    })
}

fn absolute_project_candidate(reference: &str, cwd: &Path) -> Option<std::path::PathBuf> {
    if reference == "." {
        return Some(cwd.to_path_buf());
    }
    let path = Path::new(reference);
    if path.is_absolute() {
        return Some(path.to_path_buf());
    }
    if reference.contains('/') || reference.contains('\\') {
        return Some(cwd.join(path));
    }
    None
}
