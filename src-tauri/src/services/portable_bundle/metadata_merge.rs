//! Natural-key merge of bundle metadata into the target database.
//!
//! One [`MetadataPlan`] drives both the preview counts and the apply step, so
//! what the user sees is exactly what apply does. Keys: registries by
//! normalized URL, tag groups and saved views by name, tags by name. Existing
//! registries are never changed; built-in groups and tags are never updated.
//! Re-importing the same bundle is a no-op.

use std::collections::HashMap;

use chrono::Utc;
use sqlx::{Row, SqliteConnection};

use super::types::{
    BundleManifest, PortableBundleMetadataCounts, PortableBundleMetadataPreview,
    PortableBundleMetadataResult,
};

#[derive(Debug, Clone, PartialEq, Eq)]
enum Action {
    Add,
    Exists(String),
    Update(String),
}

impl Action {
    fn id(&self) -> Option<&str> {
        match self {
            Self::Add => None,
            Self::Exists(id) | Self::Update(id) => Some(id),
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct MetadataPlan {
    registries: Vec<Action>,
    tag_groups: Vec<Action>,
    tags: Vec<Action>,
    saved_views: Vec<Action>,
}

struct ExistingTag {
    id: String,
    description: Option<String>,
    color: Option<String>,
    group_id: Option<String>,
    is_builtin: bool,
}

struct ExistingGroup {
    id: String,
    color: Option<String>,
    is_builtin: bool,
}

/// Compare the manifest with the current rows. Read-only.
pub(crate) async fn plan_metadata(
    conn: &mut SqliteConnection,
    manifest: &BundleManifest,
) -> Result<MetadataPlan, sqlx::Error> {
    let registry_keys = sqlx::query("SELECT url FROM skill_registries")
        .fetch_all(&mut *conn)
        .await?
        .into_iter()
        .map(|row| normalize_registry_identity(&row.get::<String, _>("url")))
        .collect::<std::collections::HashSet<_>>();
    let mut planned_registries = std::collections::HashSet::new();
    let registries = manifest
        .registries
        .iter()
        .map(|registry| {
            let key = normalize_registry_identity(&registry.url);
            if registry_keys.contains(&key) || !planned_registries.insert(key) {
                Action::Exists(String::new())
            } else {
                Action::Add
            }
        })
        .collect();

    let mut groups_by_name = HashMap::new();
    for row in sqlx::query(
        "SELECT id, name, color, is_builtin FROM skill_tag_groups ORDER BY sort_order, id",
    )
    .fetch_all(&mut *conn)
    .await?
    {
        groups_by_name
            .entry(row.get::<String, _>("name"))
            .or_insert(ExistingGroup {
                id: row.get("id"),
                color: row.get("color"),
                is_builtin: row.get("is_builtin"),
            });
    }
    let tag_groups = manifest
        .tag_groups
        .iter()
        .map(|group| match groups_by_name.get(&group.name) {
            None => Action::Add,
            Some(existing) if existing.is_builtin || existing.color == group.color => {
                Action::Exists(existing.id.clone())
            }
            Some(existing) => Action::Update(existing.id.clone()),
        })
        .collect::<Vec<_>>();
    let group_ids_by_key = manifest
        .tag_groups
        .iter()
        .zip(&tag_groups)
        .map(|(group, action)| (group.key.as_str(), action.id()))
        .collect::<HashMap<_, _>>();

    let mut tags_by_name = HashMap::new();
    for row in
        sqlx::query("SELECT id, name, description, color, group_id, is_builtin FROM skill_tags")
            .fetch_all(&mut *conn)
            .await?
    {
        tags_by_name.insert(
            row.get::<String, _>("name"),
            ExistingTag {
                id: row.get("id"),
                description: row.get("description"),
                color: row.get("color"),
                group_id: row.get("group_id"),
                is_builtin: row.get("is_builtin"),
            },
        );
    }
    let tags = manifest
        .tags
        .iter()
        .map(|tag| {
            let Some(existing) = tags_by_name.get(&tag.name) else {
                return Action::Add;
            };
            // A group that will be created by this import never matches.
            let wanted_group = tag
                .group_key
                .as_deref()
                .map(|key| group_ids_by_key.get(key).copied().flatten());
            let same_group = match wanted_group {
                None => existing.group_id.is_none(),
                Some(None) => false,
                Some(Some(id)) => existing.group_id.as_deref() == Some(id),
            };
            if existing.is_builtin
                || (existing.description == tag.description
                    && existing.color == tag.color
                    && same_group)
            {
                Action::Exists(existing.id.clone())
            } else {
                Action::Update(existing.id.clone())
            }
        })
        .collect();

    let mut views_by_name = HashMap::new();
    for row in sqlx::query("SELECT id, name, query FROM skill_saved_views ORDER BY sort_order, id")
        .fetch_all(&mut *conn)
        .await?
    {
        views_by_name
            .entry(row.get::<String, _>("name"))
            .or_insert((row.get::<String, _>("id"), row.get::<String, _>("query")));
    }
    let saved_views = manifest
        .saved_views
        .iter()
        .map(|view| match views_by_name.get(&view.name) {
            None => Action::Add,
            Some((id, query)) if *query == view.query => Action::Exists(id.clone()),
            Some((id, _)) => Action::Update(id.clone()),
        })
        .collect();

    Ok(MetadataPlan {
        registries,
        tag_groups,
        tags,
        saved_views,
    })
}

impl MetadataPlan {
    pub(crate) fn preview(&self) -> PortableBundleMetadataPreview {
        PortableBundleMetadataPreview {
            registries: counts(&self.registries),
            tag_groups: counts(&self.tag_groups),
            tags: counts(&self.tags),
            saved_views: counts(&self.saved_views),
        }
    }
}

fn counts(actions: &[Action]) -> PortableBundleMetadataCounts {
    let mut counts = PortableBundleMetadataCounts::default();
    for action in actions {
        match action {
            Action::Add => counts.add += 1,
            Action::Exists(_) => counts.exists += 1,
            Action::Update(_) => counts.update += 1,
        }
    }
    counts
}

/// Apply `plan` inside the caller's transaction and link `tagged_skills`
/// (final skill id → bundle tag keys) with `source = 'import'`.
pub(crate) async fn apply_metadata(
    conn: &mut SqliteConnection,
    manifest: &BundleManifest,
    plan: &MetadataPlan,
    tagged_skills: &[(String, Vec<String>)],
) -> Result<PortableBundleMetadataResult, sqlx::Error> {
    let now = Utc::now().to_rfc3339();
    let mut result = PortableBundleMetadataResult::default();
    let mut tally = |action: &Action| match action {
        Action::Add => result.added += 1,
        Action::Update(_) => result.updated += 1,
        Action::Exists(_) => result.unchanged += 1,
    };

    for (registry, action) in manifest.registries.iter().zip(&plan.registries) {
        tally(action);
        if *action == Action::Add {
            sqlx::query(
                "INSERT INTO skill_registries
                 (id, name, source_type, url, is_builtin, is_enabled, last_sync_status, created_at)
                 VALUES (?, ?, ?, ?, 0, ?, 'never', ?)",
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&registry.name)
            .bind(&registry.source_type)
            .bind(&registry.url)
            .bind(registry.is_enabled)
            .bind(&now)
            .execute(&mut *conn)
            .await?;
        }
    }

    let mut group_ids = HashMap::new();
    for (group, action) in manifest.tag_groups.iter().zip(&plan.tag_groups) {
        tally(action);
        let id = match action {
            Action::Add => {
                let id = uuid::Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO skill_tag_groups
                     (id, name, color, sort_order, is_builtin, created_at, updated_at)
                     VALUES (?, ?, ?, ?, 0, ?, ?)",
                )
                .bind(&id)
                .bind(&group.name)
                .bind(&group.color)
                .bind(group.sort_order)
                .bind(&now)
                .bind(&now)
                .execute(&mut *conn)
                .await?;
                id
            }
            Action::Update(id) => {
                sqlx::query("UPDATE skill_tag_groups SET color = ?, updated_at = ? WHERE id = ?")
                    .bind(&group.color)
                    .bind(&now)
                    .bind(id)
                    .execute(&mut *conn)
                    .await?;
                id.clone()
            }
            Action::Exists(id) => id.clone(),
        };
        group_ids.insert(group.key.as_str(), id);
    }

    let mut tag_ids = HashMap::new();
    for (tag, action) in manifest.tags.iter().zip(&plan.tags) {
        tally(action);
        let group_id = tag
            .group_key
            .as_deref()
            .and_then(|key| group_ids.get(key))
            .cloned();
        let id = match action {
            Action::Add => {
                let id = uuid::Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO skill_tags
                     (id, name, description, color, is_builtin, created_at, updated_at, group_id)
                     VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
                )
                .bind(&id)
                .bind(&tag.name)
                .bind(&tag.description)
                .bind(&tag.color)
                .bind(&now)
                .bind(&now)
                .bind(&group_id)
                .execute(&mut *conn)
                .await?;
                id
            }
            Action::Update(id) => {
                sqlx::query(
                    "UPDATE skill_tags
                     SET description = ?, color = ?, group_id = ?, updated_at = ?
                     WHERE id = ?",
                )
                .bind(&tag.description)
                .bind(&tag.color)
                .bind(&group_id)
                .bind(&now)
                .bind(id)
                .execute(&mut *conn)
                .await?;
                id.clone()
            }
            Action::Exists(id) => id.clone(),
        };
        tag_ids.insert(tag.key.as_str(), id);
    }

    for (skill_id, keys) in tagged_skills {
        for key in keys {
            let Some(tag_id) = tag_ids.get(key.as_str()) else {
                continue;
            };
            sqlx::query(
                "INSERT OR IGNORE INTO skill_tag_links
                 (skill_id, tag_id, confidence, reason, source, added_at)
                 VALUES (?, ?, NULL, NULL, 'import', ?)",
            )
            .bind(skill_id)
            .bind(tag_id)
            .bind(&now)
            .execute(&mut *conn)
            .await?;
        }
    }

    for (view, action) in manifest.saved_views.iter().zip(&plan.saved_views) {
        tally(action);
        match action {
            Action::Add => {
                sqlx::query(
                    "INSERT INTO skill_saved_views
                     (id, name, query, sort_order, icon, pinned, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(uuid::Uuid::new_v4().to_string())
                .bind(&view.name)
                .bind(&view.query)
                .bind(view.sort_order)
                .bind(&view.icon)
                .bind(view.pinned)
                .bind(&now)
                .bind(&now)
                .execute(&mut *conn)
                .await?;
            }
            Action::Update(id) => {
                sqlx::query("UPDATE skill_saved_views SET query = ?, updated_at = ? WHERE id = ?")
                    .bind(&view.query)
                    .bind(&now)
                    .bind(id)
                    .execute(&mut *conn)
                    .await?;
            }
            Action::Exists(_) => {}
        }
    }

    Ok(result)
}

/// `github:<owner>/<repo>` for GitHub URLs, otherwise the lowercased URL
/// without scheme, `www.`, trailing slash, or `.git`.
fn normalize_registry_identity(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .unwrap_or(trimmed);
    let without_www = without_scheme
        .strip_prefix("www.")
        .unwrap_or(without_scheme);
    let lower = without_www.to_ascii_lowercase();
    if let Some(path) = lower.strip_prefix("github.com/") {
        let mut parts = path.split('/');
        if let (Some(owner), Some(repo)) = (parts.next(), parts.next()) {
            return format!("github:{owner}/{repo}");
        }
    }
    lower
}
