use serde::Serialize;

use crate::db::repos::agents_repo;
use crate::db::Agent;
use crate::paths::{path_to_string, platform_global_skills_dir, PlatformPathSpec};

use super::{CliApiError, CliContext, CliEntity};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliAgent {
    pub id: String,
    pub display_name: String,
    pub enabled: bool,
    pub global_skills_dir: String,
}

impl CliContext {
    pub async fn list_agents(&self) -> Result<Vec<CliAgent>, CliApiError> {
        let agents = agents_repo::get_all_agents(&self.db).await?;
        let specs = agent_path_specs(&agents);
        let mut listed = Vec::new();
        for agent in &agents {
            if is_central_agent(agent) {
                continue;
            }
            // Spec lookup only fails when the id is missing from the same row set.
            // Keep the stored directory instead of failing the whole list.
            let global_skills_dir = platform_global_skills_dir(&agent.id, &specs)
                .map(|path| path_to_string(&path))
                .unwrap_or_else(|_| agent.global_skills_dir.clone());
            listed.push(CliAgent {
                id: agent.id.clone(),
                display_name: agent.display_name.clone(),
                enabled: agent.is_enabled,
                global_skills_dir,
            });
        }
        Ok(listed)
    }
}

/// Resolve the agent a write command targets. Unknown ids are
/// `agent.not_found`; the Central agent is never a valid target. Install
/// paths also reject disabled agents; uninstall paths accept them so stale
/// installs can still be removed.
pub(super) async fn resolve_target_agent(
    pool: &crate::db::DbPool,
    agent_id: &str,
    require_enabled: bool,
) -> Result<Agent, CliApiError> {
    let agent = agents_repo::get_agent_by_id(pool, agent_id)
        .await?
        .ok_or_else(|| {
            CliApiError::not_found(CliEntity::Agent, format!("Agent '{agent_id}' not found"))
        })?;
    if is_central_agent(&agent) {
        return Err(CliApiError::InvalidInput(
            "The Central agent cannot be an install or uninstall target".to_string(),
        ));
    }
    if require_enabled && !agent.is_enabled {
        return Err(CliApiError::InvalidInput(format!(
            "Agent '{agent_id}' is disabled"
        )));
    }
    Ok(agent)
}

fn is_central_agent(agent: &Agent) -> bool {
    agent.id == "central" || agent.category == "central"
}

fn agent_path_specs(agents: &[Agent]) -> Vec<PlatformPathSpec<'_>> {
    agents
        .iter()
        .map(|agent| PlatformPathSpec {
            agent_id: agent.id.as_str(),
            global_skills_dir: agent.global_skills_dir.as_str(),
            project_skills_dir: agent.project_skills_dir.as_deref(),
        })
        .collect()
}
