//! Read Central metadata from the target database for a bundle export.
//!
//! Database ids never leave this module: tags and tag groups are re-keyed to
//! bundle-local keys, and only natural keys (names, URLs, skill ids) remain.

use std::collections::HashMap;

use sqlx::Row;

use crate::db::{self, DbPool, Skill, SkillRepositoryAssignment};

use super::error::PortableBundleError;
use super::types::{
    BundleProvenance, BundleRegistry, BundleSavedView, BundleTag, BundleTagGroup,
    PortableBundleExportSummary,
};

pub(crate) struct CollectedMetadata {
    pub(crate) registries: Vec<BundleRegistry>,
    pub(crate) tag_groups: Vec<BundleTagGroup>,
    pub(crate) tags: Vec<BundleTag>,
    pub(crate) saved_views: Vec<BundleSavedView>,
    /// Database tag id → bundle tag key.
    pub(crate) tag_keys_by_id: HashMap<String, String>,
}

pub(crate) struct CollectedSkill {
    pub(crate) skill: Skill,
    pub(crate) provenance: BundleProvenance,
    pub(crate) tag_keys: Vec<String>,
}

pub(crate) async fn export_summary(
    pool: &DbPool,
    target_kind: &str,
) -> Result<PortableBundleExportSummary, PortableBundleError> {
    let row = sqlx::query(
        "SELECT
            (SELECT COUNT(*) FROM skills WHERE is_central = 1) AS skills,
            (SELECT COUNT(DISTINCT m.skill_id)
               FROM skill_repository_members m
               JOIN skill_repositories r ON r.id = m.repository_id
               JOIN skills s ON s.id = m.skill_id
              WHERE s.is_central = 1
                AND r.source_type = 'github'
                AND r.is_unknown = 0
                AND r.owner IS NOT NULL
                AND r.repo IS NOT NULL) AS with_github,
            (SELECT COUNT(*) FROM skill_tags) AS tags,
            (SELECT COUNT(*) FROM skill_tag_groups) AS tag_groups,
            (SELECT COUNT(*) FROM skill_saved_views) AS saved_views,
            (SELECT COUNT(*) FROM skill_registries WHERE is_builtin = 0) AS registries",
    )
    .fetch_one(pool)
    .await?;
    let count = |column: &str| row.get::<i64, _>(column).max(0) as usize;
    Ok(PortableBundleExportSummary {
        target_kind: target_kind.to_string(),
        skills: count("skills"),
        skills_with_github_source: count("with_github"),
        tags: count("tags"),
        tag_groups: count("tag_groups"),
        saved_views: count("saved_views"),
        registries: count("registries"),
    })
}

pub(crate) async fn collect_metadata(
    pool: &DbPool,
) -> Result<CollectedMetadata, PortableBundleError> {
    let mut groups = db::list_tag_groups(pool).await?;
    groups
        .sort_by(|left, right| (left.sort_order, &left.name).cmp(&(right.sort_order, &right.name)));
    let mut group_keys_by_id = HashMap::new();
    let tag_groups = groups
        .into_iter()
        .enumerate()
        .map(|(index, group)| {
            let key = format!("g{}", index + 1);
            group_keys_by_id.insert(group.id, key.clone());
            BundleTagGroup {
                key,
                name: group.name,
                color: group.color,
                sort_order: group.sort_order,
            }
        })
        .collect();

    let mut tag_rows = db::get_skill_tags(pool).await?;
    tag_rows.sort_by(|left, right| left.name.cmp(&right.name));
    let mut tag_keys_by_id = HashMap::new();
    let tags = tag_rows
        .into_iter()
        .enumerate()
        .map(|(index, tag)| {
            let key = format!("t{}", index + 1);
            tag_keys_by_id.insert(tag.id, key.clone());
            BundleTag {
                key,
                name: tag.name,
                description: tag.description,
                color: tag.color,
                group_key: tag
                    .group_id
                    .as_ref()
                    .and_then(|id| group_keys_by_id.get(id).cloned()),
            }
        })
        .collect();

    let saved_views = db::list_saved_views(pool)
        .await?
        .into_iter()
        .map(|view| BundleSavedView {
            name: view.name,
            query: view.query,
            sort_order: view.sort_order,
            icon: view.icon,
            pinned: view.pinned,
        })
        .collect();

    let registries = sqlx::query(
        "SELECT name, source_type, url, is_enabled
         FROM skill_registries
         WHERE is_builtin = 0
         ORDER BY lower(name), url",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| BundleRegistry {
        name: row.get("name"),
        source_type: row.get("source_type"),
        url: row.get("url"),
        is_enabled: row.get("is_enabled"),
    })
    .collect();

    Ok(CollectedMetadata {
        registries,
        tag_groups,
        tags,
        saved_views,
        tag_keys_by_id,
    })
}

pub(crate) async fn collect_skills(
    pool: &DbPool,
    metadata: &CollectedMetadata,
) -> Result<Vec<CollectedSkill>, PortableBundleError> {
    let mut skills = db::get_central_skills(pool).await?;
    skills.sort_by(|left, right| left.id.cmp(&right.id));
    let skill_ids = skills
        .iter()
        .map(|skill| skill.id.clone())
        .collect::<Vec<_>>();
    let mut assignments = db::get_skill_repository_assignments_for_skills(pool, &skill_ids).await?;
    let mut tags_by_skill = db::get_skill_tags_for_skills(pool, &skill_ids).await?;

    Ok(skills
        .into_iter()
        .map(|skill| {
            let provenance = assignments
                .remove(&skill.id)
                .map(|assignment| provenance_of(&assignment))
                .unwrap_or(BundleProvenance::Unknown);
            let mut tag_keys = tags_by_skill
                .remove(&skill.id)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|tag| metadata.tag_keys_by_id.get(&tag.id).cloned())
                .collect::<Vec<_>>();
            tag_keys.sort();
            tag_keys.dedup();
            CollectedSkill {
                skill,
                provenance,
                tag_keys,
            }
        })
        .collect())
}

fn provenance_of(assignment: &SkillRepositoryAssignment) -> BundleProvenance {
    let repository = &assignment.repository;
    if repository.source_type != "github" || repository.is_unknown || assignment.is_source_unknown {
        return BundleProvenance::Unknown;
    }
    let (Some(owner), Some(repo), Some(source_path)) = (
        repository
            .owner
            .as_deref()
            .filter(|value| !value.trim().is_empty()),
        repository
            .repo
            .as_deref()
            .filter(|value| !value.trim().is_empty()),
        assignment.source_path.as_deref(),
    ) else {
        return BundleProvenance::Unknown;
    };
    BundleProvenance::Github {
        owner: owner.to_string(),
        repo: repo.to_string(),
        branch: repository
            .branch
            .clone()
            .filter(|branch| !branch.trim().is_empty()),
        source_path: normalize_source_path(source_path),
        commit_sha: None,
    }
}

/// Repository-relative skill directory in one canonical spelling: forward
/// slashes, no surrounding slashes, no trailing `SKILL.md`, `.` for the root.
pub(crate) fn normalize_source_path(source_path: &str) -> String {
    let normalized = source_path.trim().replace('\\', "/");
    let normalized = normalized.trim_matches('/');
    if normalized.is_empty() || normalized == "." || normalized.eq_ignore_ascii_case("SKILL.md") {
        return ".".to_string();
    }
    let lower = normalized.to_ascii_lowercase();
    if lower.ends_with("/skill.md") {
        normalized[..normalized.len() - "/SKILL.md".len()].to_string()
    } else {
        normalized.to_string()
    }
}

/// A Central skill id that can safely become one path component of
/// `skills/<id>` on every supported platform.
pub(crate) fn is_portable_skill_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 200
        && id != "."
        && id != ".."
        && id.trim() == id
        && !id.ends_with('.')
        && !id.chars().any(|ch| {
            ch.is_control() || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
}
