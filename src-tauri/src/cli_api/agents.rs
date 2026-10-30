use serde::Serialize;

use crate::db::repos::agents_repo;
use crate::db::Agent;
use crate::paths::{path_to_string, platform_global_skills_dir, PlatformPathSpec};

use super::{CliApiError, CliContext};

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
