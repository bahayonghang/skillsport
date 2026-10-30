use std::collections::HashMap;

use serde::Serialize;

use crate::db::repos::{tag_groups_repo, tags_repo};

use super::{CliApiError, CliContext};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliTagGroup {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliTag {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub group: Option<CliTagGroup>,
}

impl CliContext {
    pub async fn list_tags(&self) -> Result<Vec<CliTag>, CliApiError> {
        let tags = tags_repo::get_skill_tags(&self.db).await?;
        let groups = tag_groups_repo::list_tag_groups(&self.db)
            .await?
            .into_iter()
            .map(|group| (group.id.clone(), group))
            .collect::<HashMap<_, _>>();
        Ok(tags
            .into_iter()
            .map(|tag| {
                let group = tag.group_id.as_ref().and_then(|group_id| {
                    groups.get(group_id).map(|group| CliTagGroup {
                        id: group.id.clone(),
                        name: group.name.clone(),
                    })
                });
                CliTag {
                    id: tag.id,
                    name: tag.name,
                    description: tag.description,
                    color: tag.color,
                    group,
                }
            })
            .collect())
    }
}
