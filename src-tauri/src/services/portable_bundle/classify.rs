//! Compare bundle skills with the active target. Read-only: one batched DB
//! query plus one batched `CentralFs::hash_directories` call.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use sqlx::{QueryBuilder, Row, Sqlite};

use crate::db::{self, DbPool};
use crate::services::central_updates::{content_digest_of, CentralFs, CentralUpdatesError};

use super::error::PortableBundleError;
use super::types::{BundleManifest, PortableBundleSkillStatus};

const ID_QUERY_CHUNK: usize = 500;

/// Central skills directory of the active target (posix on SSH/WSL).
pub(crate) async fn central_root(pool: &DbPool) -> Result<PathBuf, PortableBundleError> {
    let central = db::get_agent_by_id(pool, "central").await?.ok_or_else(|| {
        PortableBundleError::Central(CentralUpdatesError::Batch(
            "Central agent is not configured on the active target.".to_string(),
        ))
    })?;
    Ok(PathBuf::from(central.global_skills_dir))
}

/// `<central_root>/<skill_id>` in the target's own path syntax.
pub(crate) fn central_target_dir(fs: &CentralFs, root: &Path, skill_id: &str) -> PathBuf {
    match fs {
        CentralFs::Local => root.join(skill_id),
        CentralFs::Remote(_) => PathBuf::from(crate::targets::remote_join(
            &root.to_string_lossy().replace('\\', "/"),
            skill_id,
        )),
    }
}

/// Existing skill rows by id: `true` when the row is a Central skill.
pub(crate) async fn existing_skill_rows(
    pool: &DbPool,
    ids: &[&str],
) -> Result<HashMap<String, bool>, sqlx::Error> {
    let mut rows = HashMap::with_capacity(ids.len());
    for chunk in ids.chunks(ID_QUERY_CHUNK) {
        let mut query =
            QueryBuilder::<Sqlite>::new("SELECT id, is_central FROM skills WHERE id IN (");
        let mut separated = query.separated(", ");
        for id in chunk {
            separated.push_bind(*id);
        }
        separated.push_unseparated(")");
        for row in query.build().fetch_all(pool).await? {
            rows.insert(row.get::<String, _>("id"), row.get::<bool, _>("is_central"));
        }
    }
    Ok(rows)
}

pub(crate) async fn classify_skills(
    pool: &DbPool,
    fs: &CentralFs,
    root: &Path,
    manifest: &BundleManifest,
    invalid_skills: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, PortableBundleSkillStatus>, PortableBundleError> {
    let candidates = manifest
        .skills
        .iter()
        .filter(|skill| !invalid_skills.contains_key(&skill.id))
        .collect::<Vec<_>>();
    let ids = candidates
        .iter()
        .map(|skill| skill.id.as_str())
        .collect::<Vec<_>>();
    let rows = existing_skill_rows(pool, &ids).await?;
    let dirs = candidates
        .iter()
        .map(|skill| central_target_dir(fs, root, &skill.id))
        .collect::<Vec<_>>();
    let hashes = fs.hash_directories(&dirs).await?;
    let empty = content_digest_of(Vec::new());

    let mut statuses = BTreeMap::new();
    for id in invalid_skills.keys() {
        statuses.insert(id.clone(), PortableBundleSkillStatus::Invalid);
    }
    for (skill, dir) in candidates.into_iter().zip(&dirs) {
        let hash = hashes.get(dir).map(String::as_str).unwrap_or(&empty);
        let status = match rows.get(&skill.id) {
            Some(true) if hash == skill.content_digest => PortableBundleSkillStatus::Identical,
            Some(true) => PortableBundleSkillStatus::Changed,
            Some(false) => PortableBundleSkillStatus::ExistsUnmanaged,
            // A directory nobody registered still blocks a plain create.
            None if hash == empty => PortableBundleSkillStatus::New,
            None => PortableBundleSkillStatus::ExistsUnmanaged,
        };
        statuses.insert(skill.id.clone(), status);
    }
    Ok(statuses)
}
