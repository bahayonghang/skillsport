//! The DB half of a Central update: the skill row plus its provenance,
//! written in the same transaction that records the directory swap.

use std::path::Path;

use chrono::Utc;

use crate::db::repos::{repositories_repo, skills_repo};
use crate::db::Skill;
use crate::services::central_updates::types::{ContentSource, RemoteSkillContent};

/// `skills.source` for bundle-imported skills without GitHub provenance.
const BUNDLE_SKILL_SOURCE: &str = "portable-bundle";

pub(super) async fn persist_updated_skill_in_transaction(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    target_kind: crate::targets::TargetKind,
    skill: &Skill,
    remote: &RemoteSkillContent,
) -> Result<(), sqlx::Error> {
    let (skill_md_path, canonical_path) =
        central_skill_persistence_paths(target_kind, &remote.target_dir);
    let source = match &remote.source {
        ContentSource::GitHub(source) => {
            format!("github:{}/{}", source.repo.owner, source.repo.repo)
        }
        ContentSource::Bundle {
            github: Some(source),
        } => format!("github:{}/{}", source.owner, source.repo),
        ContentSource::Bundle { github: None } => BUNDLE_SKILL_SOURCE.to_string(),
    };
    let updated_skill = Skill {
        id: skill.id.clone(),
        uid: skill.uid.clone(),
        name: remote.skill_name.clone(),
        description: remote.description.clone(),
        file_path: skill_md_path,
        canonical_path: Some(canonical_path),
        is_central: true,
        source: Some(source),
        content: skill.content.clone(),
        scanned_at: Utc::now().to_rfc3339(),
        fs_created_at: None,
        fs_updated_at: None,
    };
    match &remote.source {
        ContentSource::GitHub(source) => {
            repositories_repo::upsert_skill_with_github_repository_in_transaction(
                transaction,
                &updated_skill,
                &source.repo.owner,
                &source.repo.repo,
                Some(&source.repo.branch),
                &source.repo.normalized_url,
                &source.source_path,
                remote.resolved_commit_sha.as_deref(),
                remote.content_digest.as_deref(),
            )
            .await
        }
        ContentSource::Bundle {
            github: Some(source),
        } => {
            repositories_repo::upsert_skill_with_github_repository_in_transaction(
                transaction,
                &updated_skill,
                &source.owner,
                &source.repo,
                source.branch.as_deref(),
                &format!("https://github.com/{}/{}", source.owner, source.repo),
                &source.source_path,
                remote.resolved_commit_sha.as_deref(),
                None,
            )
            .await
        }
        ContentSource::Bundle { github: None } => {
            skills_repo::upsert_skill_in_transaction(transaction, &updated_skill).await?;
            // No recorded provenance: drop any stale membership so the skill
            // reads as unknown-source instead of tracking the old upstream.
            sqlx::query("DELETE FROM skill_repository_members WHERE skill_id = ?")
                .bind(&updated_skill.id)
                .execute(&mut **transaction)
                .await
                .map(|_| ())
        }
    }
}

pub(super) fn central_skill_persistence_paths(
    target_kind: crate::targets::TargetKind,
    target_dir: &Path,
) -> (String, String) {
    match target_kind {
        crate::targets::TargetKind::Local => (
            target_dir.join("SKILL.md").to_string_lossy().into_owned(),
            target_dir.to_string_lossy().into_owned(),
        ),
        crate::targets::TargetKind::Ssh | crate::targets::TargetKind::Wsl => {
            let canonical_path = target_dir.to_string_lossy().replace('\\', "/");
            let file_path = crate::targets::remote_join(&canonical_path, "SKILL.md");
            (file_path, canonical_path)
        }
    }
}
