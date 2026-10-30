use std::path::Path;

use serde::Serialize;

use crate::db::repos::projects_repo;
use crate::db::Project;
use crate::paths::{path_to_string, paths_equivalent};
use crate::services::projects::{
    get_project_skills_impl, list_projects_impl, normalize_project_path,
};

use super::{CliApiError, CliContext, CliEntity};

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

impl CliContext {
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

/// Resolve a project reference. `cwd` is explicit so tests do not change the
/// process working directory. `.` means that directory.
async fn resolve_project(
    pool: &crate::db::DbPool,
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
