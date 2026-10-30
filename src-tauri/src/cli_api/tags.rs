use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::db::repos::{tag_groups_repo, tags_repo};
use crate::db::{self, DbPool, SkillTag, TagGroup};
use crate::services::{ai_tagging, central_skills};

use super::confirm::{self, ConfirmDecision, MutationOutput};
use super::{record_cli_mutation_log, CliApiError, CliContext, CliEntity};

/// Default confidence for agent-submitted review rows when `--confidence` is
/// omitted. Review rows require a confidence value.
const DEFAULT_REVIEW_CONFIDENCE: f64 = 0.5;
/// Review rows require a reason; used when `--reason` is omitted.
const DEFAULT_REVIEW_REASON: &str = "Suggested by agent";
const MAX_REASON_CHARS: usize = 1000;

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCreatePlan {
    /// Existing id, or the derived id a new tag is expected to receive.
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub group: Option<CliTagGroup>,
    /// A tag with this name already exists; create returns it unchanged.
    pub exists: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCreateResult {
    pub created: bool,
    pub tag: CliTag,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagLinkPlan {
    pub skill_uid: String,
    pub skill_id: String,
    pub tag_id: String,
    pub tag_name: String,
    /// `link`, `review`, or `unlink`.
    pub action: &'static str,
    pub already_linked: bool,
    pub current_source: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagLinkResult {
    pub linked: usize,
    pub queued: usize,
    pub removed: usize,
}

pub struct TagAddRequest<'a> {
    pub skill_refs: &'a [String],
    pub tag_refs: &'a [String],
    pub reason: Option<&'a str>,
    pub confidence: Option<f64>,
    pub review: bool,
    pub dry_run: bool,
    pub yes: bool,
}

impl CliContext {
    pub async fn list_tags(&self) -> Result<Vec<CliTag>, CliApiError> {
        let tags = tags_repo::get_skill_tags(&self.db).await?;
        let groups = group_map(&self.db).await?;
        Ok(tags.into_iter().map(|tag| cli_tag(tag, &groups)).collect())
    }

    pub async fn create_tag(
        &self,
        name: &str,
        group: Option<&str>,
        color: Option<&str>,
        description: Option<&str>,
        dry_run: bool,
    ) -> Result<MutationOutput<TagCreatePlan, TagCreateResult>, CliApiError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(CliApiError::InvalidInput(
                "Tag name is required".to_string(),
            ));
        }
        let description = non_blank(description);
        let color = non_blank(color);
        let group = match group {
            Some(reference) => Some(resolve_tag_group(&self.db, reference).await?),
            None => None,
        };
        let existing = tags_repo::get_skill_tag_by_name(&self.db, name).await?;
        let plan = TagCreatePlan {
            id: existing
                .as_ref()
                .map(|tag| tag.id.clone())
                .unwrap_or_else(|| tags_repo::derive_skill_tag_id(name)),
            name: name.to_string(),
            description: description.map(str::to_string),
            color: color.map(str::to_string),
            group: group.as_ref().map(|group| CliTagGroup {
                id: group.id.clone(),
                name: group.name.clone(),
            }),
            exists: existing.is_some(),
        };
        let plans = vec![plan];
        if confirm::require(&plans, false, false, dry_run)? == ConfirmDecision::DryRun {
            return Ok(MutationOutput::dry_run(plans));
        }

        let groups = group_map(&self.db).await?;
        if let Some(existing) = existing {
            return Ok(MutationOutput::applied(
                plans,
                TagCreateResult {
                    created: false,
                    tag: cli_tag(existing, &groups),
                },
            ));
        }

        let outcome = async {
            let mut tag = tags_repo::create_skill_tag(&self.db, name, description, color).await?;
            if let Some(group) = &group {
                tag_groups_repo::set_tag_group(&self.db, &tag.id, Some(&group.id)).await?;
                tag.group_id = Some(group.id.clone());
            }
            Ok::<_, sqlx::Error>(tag)
        }
        .await;
        match outcome {
            Ok(tag) => {
                record_cli_mutation_log(
                    &self.db,
                    "create_skill_tag",
                    None,
                    "succeeded",
                    "Skill tag created.",
                    None,
                    serde_json::json!({ "groupAssigned": group.is_some() }),
                )
                .await;
                Ok(MutationOutput::applied(
                    plans,
                    TagCreateResult {
                        created: true,
                        tag: cli_tag(tag, &groups),
                    },
                ))
            }
            Err(error) => {
                record_cli_mutation_log(
                    &self.db,
                    "create_skill_tag",
                    None,
                    "failed",
                    "Skill tag creation failed.",
                    Some("Skill tag creation failed."),
                    serde_json::json!({}),
                )
                .await;
                Err(error.into())
            }
        }
    }

    /// Link tags to skills with `source = "agent"`, or queue them for review.
    /// More than one skill is a batch and requires `--yes`.
    pub async fn add_tags(
        &self,
        request: TagAddRequest<'_>,
    ) -> Result<MutationOutput<TagLinkPlan, TagLinkResult>, CliApiError> {
        let reason = validate_reason(request.reason)?;
        if let Some(confidence) = request.confidence {
            if !confidence.is_finite() || !(0.0..=1.0).contains(&confidence) {
                return Err(CliApiError::InvalidInput(
                    "confidence must be between 0 and 1".to_string(),
                ));
            }
        }
        let skills = resolve_skills(&self.db, request.skill_refs).await?;
        let tags = resolve_tags(&self.db, request.tag_refs).await?;
        let action = if request.review { "review" } else { "link" };
        let plans = link_plans(&self.db, &skills, &tags, action).await?;
        let decision = confirm::require(&plans, skills.len() > 1, request.yes, request.dry_run)?;
        if decision == ConfirmDecision::DryRun {
            return Ok(MutationOutput::dry_run(plans));
        }

        let tag_ids = tags.iter().map(|tag| tag.id.clone()).collect::<Vec<_>>();
        if request.review {
            let rows = tag_ids
                .iter()
                .map(|tag_id| db::PendingAiTagReviewInput {
                    tag_id: tag_id.clone(),
                    confidence: request.confidence.unwrap_or(DEFAULT_REVIEW_CONFIDENCE),
                    reason: reason.unwrap_or(DEFAULT_REVIEW_REASON).to_string(),
                    proposed_name: None,
                    proposed_description: None,
                })
                .collect::<Vec<_>>();
            for skill in &skills {
                if let Err(error) =
                    ai_tagging::enqueue_pending_tag_reviews(&self.db, &skill.id, &rows).await
                {
                    record_cli_mutation_log(
                        &self.db,
                        "suggest_skill_tags",
                        None,
                        "failed",
                        "Skill tag review queueing failed.",
                        Some("Skill tag review queueing failed."),
                        serde_json::json!({ "skillCount": skills.len() }),
                    )
                    .await;
                    return Err(error.into());
                }
            }
            record_cli_mutation_log(
                &self.db,
                "suggest_skill_tags",
                None,
                "succeeded",
                "Skill tags queued for review.",
                None,
                serde_json::json!({
                    "skillCount": skills.len(),
                    "affectedCount": plans.len(),
                }),
            )
            .await;
            let queued = plans.len();
            return Ok(MutationOutput::applied(
                plans,
                TagLinkResult {
                    queued,
                    ..TagLinkResult::default()
                },
            ));
        }

        let skill_ids = skills
            .iter()
            .map(|skill| skill.id.clone())
            .collect::<Vec<_>>();
        if let Err(error) = tags_repo::assign_skill_tags(
            &self.db,
            &skill_ids,
            &tag_ids,
            tags_repo::TAG_LINK_SOURCE_AGENT,
            request.confidence,
            reason,
        )
        .await
        {
            record_cli_mutation_log(
                &self.db,
                "assign_skill_tags",
                None,
                "failed",
                "Skill tag assignment failed.",
                Some("Skill tag assignment failed."),
                serde_json::json!({ "skillCount": skills.len() }),
            )
            .await;
            return Err(error.into());
        }
        record_cli_mutation_log(
            &self.db,
            "assign_skill_tags",
            None,
            "succeeded",
            "Skill tags assigned.",
            None,
            serde_json::json!({
                "skillCount": skills.len(),
                "affectedCount": plans.len(),
            }),
        )
        .await;
        let linked = plans.len();
        Ok(MutationOutput::applied(
            plans,
            TagLinkResult {
                linked,
                ..TagLinkResult::default()
            },
        ))
    }

    /// Remove tag links from one skill. Removal is destructive and requires
    /// `--yes`.
    pub async fn remove_tags(
        &self,
        skill_ref: &str,
        tag_refs: &[String],
        dry_run: bool,
        yes: bool,
    ) -> Result<MutationOutput<TagLinkPlan, TagLinkResult>, CliApiError> {
        let skills = resolve_skills(&self.db, &[skill_ref.to_string()]).await?;
        let tags = resolve_tags(&self.db, tag_refs).await?;
        let plans = link_plans(&self.db, &skills, &tags, "unlink").await?;
        if confirm::require(&plans, true, yes, dry_run)? == ConfirmDecision::DryRun {
            return Ok(MutationOutput::dry_run(plans));
        }

        let skill = &skills[0];
        let tag_ids = tags.iter().map(|tag| tag.id.clone()).collect::<Vec<_>>();
        if let Err(error) = tags_repo::unassign_skill_tags(&self.db, &skill.id, &tag_ids).await {
            record_cli_mutation_log(
                &self.db,
                "unassign_skill_tags",
                None,
                "failed",
                "Skill tag removal failed.",
                Some("Skill tag removal failed."),
                serde_json::json!({}),
            )
            .await;
            return Err(error.into());
        }
        let removed = plans.iter().filter(|plan| plan.already_linked).count();
        record_cli_mutation_log(
            &self.db,
            "unassign_skill_tags",
            None,
            "succeeded",
            "Skill tags unassigned.",
            None,
            serde_json::json!({ "affectedCount": removed }),
        )
        .await;
        Ok(MutationOutput::applied(
            plans,
            TagLinkResult {
                removed,
                ..TagLinkResult::default()
            },
        ))
    }
}

async fn group_map(pool: &DbPool) -> Result<HashMap<String, TagGroup>, CliApiError> {
    Ok(tag_groups_repo::list_tag_groups(pool)
        .await?
        .into_iter()
        .map(|group| (group.id.clone(), group))
        .collect())
}

fn cli_tag(tag: SkillTag, groups: &HashMap<String, TagGroup>) -> CliTag {
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
}

fn non_blank(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn validate_reason(reason: Option<&str>) -> Result<Option<&str>, CliApiError> {
    let reason = non_blank(reason);
    if reason.is_some_and(|reason| reason.chars().count() > MAX_REASON_CHARS) {
        return Err(CliApiError::InvalidInput(format!(
            "reason must be at most {MAX_REASON_CHARS} characters"
        )));
    }
    Ok(reason)
}

/// Resolve a tag group by exact id, then by unique exact name.
async fn resolve_tag_group(pool: &DbPool, reference: &str) -> Result<TagGroup, CliApiError> {
    let groups = tag_groups_repo::list_tag_groups(pool).await?;
    if let Some(group) = groups.iter().find(|group| group.id == reference) {
        return Ok(group.clone());
    }
    let mut named = groups.into_iter().filter(|group| group.name == reference);
    match (named.next(), named.next()) {
        (Some(group), None) => Ok(group),
        (Some(_), Some(_)) => Err(CliApiError::ambiguous(
            CliEntity::TagGroup,
            format!("Multiple tag groups are named '{reference}'; use the group id"),
        )),
        (None, _) => Err(CliApiError::not_found(
            CliEntity::TagGroup,
            format!("Tag group '{reference}' not found"),
        )),
    }
}

/// Resolve tag refs by exact id, then exact name. Unknown names are
/// `tag.not_found`; tags are never created implicitly. Duplicates collapse.
pub(super) async fn resolve_tags(
    pool: &DbPool,
    references: &[String],
) -> Result<Vec<SkillTag>, CliApiError> {
    if references.is_empty() {
        return Err(CliApiError::InvalidInput(
            "At least one --tag is required".to_string(),
        ));
    }
    let mut seen = HashSet::new();
    let mut tags = Vec::with_capacity(references.len());
    for reference in references {
        let tag = match tags_repo::get_skill_tag_by_id(pool, reference).await? {
            Some(tag) => tag,
            None => tags_repo::get_skill_tag_by_name(pool, reference)
                .await?
                .ok_or_else(|| {
                    CliApiError::not_found(CliEntity::Tag, format!("Tag '{reference}' not found"))
                })?,
        };
        if seen.insert(tag.id.clone()) {
            tags.push(tag);
        }
    }
    Ok(tags)
}

async fn resolve_skills(
    pool: &DbPool,
    references: &[String],
) -> Result<Vec<db::Skill>, CliApiError> {
    if references.is_empty() {
        return Err(CliApiError::InvalidInput(
            "At least one skill reference is required".to_string(),
        ));
    }
    let mut seen = HashSet::new();
    let mut skills = Vec::with_capacity(references.len());
    for reference in references {
        let skill = central_skills::resolve_skill_ref_impl(pool, reference).await?;
        if seen.insert(skill.id.clone()) {
            skills.push(skill);
        }
    }
    Ok(skills)
}

async fn link_plans(
    pool: &DbPool,
    skills: &[db::Skill],
    tags: &[SkillTag],
    action: &'static str,
) -> Result<Vec<TagLinkPlan>, CliApiError> {
    let mut plans = Vec::with_capacity(skills.len() * tags.len());
    for skill in skills {
        let current = tags_repo::list_skill_tag_links_for_skill(pool, &skill.id)
            .await?
            .into_iter()
            .map(|link| (link.id, link.source))
            .collect::<HashMap<_, _>>();
        for tag in tags {
            let current_source = current.get(&tag.id).cloned();
            plans.push(TagLinkPlan {
                skill_uid: skill.uid.clone(),
                skill_id: skill.id.clone(),
                tag_id: tag.id.clone(),
                tag_name: tag.name.clone(),
                action,
                already_linked: current_source.is_some(),
                current_source,
            });
        }
    }
    Ok(plans)
}
