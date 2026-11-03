use std::collections::BTreeMap;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use tempfile::TempDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use super::preview_cache::{PreviewCache, PREVIEW_TTL};
use super::types::MANIFEST_PATH;
use super::*;
use crate::db::{self, DbPool, Skill};
use crate::services::central_updates::CentralFs;
use crate::test_support::{mem_pool, set_agent_dir};

const TARGET: &str = "local";
const JOB: BundleJob<'static> = BundleJob {
    job_id: "bundle-import-test",
    app: None,
    cancel: None,
};

fn skill_row(root: &Path, id: &str, uid: &str, is_central: bool) -> Skill {
    let dir = root.join(id);
    Skill {
        id: id.to_string(),
        uid: uid.to_string(),
        name: id.to_string(),
        description: Some(format!("{id} description")),
        file_path: dir.join("SKILL.md").to_string_lossy().into_owned(),
        canonical_path: Some(dir.to_string_lossy().into_owned()),
        is_central,
        source: None,
        content: None,
        scanned_at: "2026-10-28T00:00:00Z".to_string(),
        fs_created_at: None,
        fs_updated_at: None,
    }
}

fn write_skill_dir(root: &Path, id: &str, body: &str) {
    let dir = root.join(id);
    std::fs::create_dir_all(dir.join("refs")).unwrap();
    std::fs::write(
        dir.join("SKILL.md"),
        format!("---\nname: {id}\n---\n{body}\n"),
    )
    .unwrap();
    std::fs::write(dir.join("refs/notes.md"), format!("{id} notes")).unwrap();
}

async fn seed_central(pool: &DbPool, root: &Path, id: &str, body: &str) {
    write_skill_dir(root, id, body);
    db::upsert_skill(pool, &skill_row(root, id, &format!("{id}-uid"), true))
        .await
        .unwrap();
}

struct Fixture {
    _dir: TempDir,
    bundle: PathBuf,
    target: DbPool,
    target_root: PathBuf,
}

/// Source library: `alpha` (GitHub provenance, tagged "Docs" in group
/// "Writing"), `beta` (unknown source), `gamma`, `delta`, plus one saved view
/// and one custom registry. Exported to `bundle.skillport`.
async fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let source = mem_pool().await;
    let source_root = dir.path().join("source");
    for id in ["alpha", "beta", "gamma", "delta"] {
        seed_central(&source, &source_root, id, "body").await;
    }
    db::assign_github_repository_to_skill(
        &source,
        "openai",
        "skills",
        "main",
        "https://github.com/openai/skills",
        "alpha",
        "skills/alpha/SKILL.md",
    )
    .await
    .unwrap();
    let group = db::create_tag_group(
        &source,
        db::NewTagGroup {
            name: "Writing",
            color: Some("#abcdef"),
        },
    )
    .await
    .unwrap();
    let tag = db::create_skill_tag(&source, "Docs", None, Some("#123456"))
        .await
        .unwrap();
    db::set_tag_group(&source, &tag.id, Some(&group.id))
        .await
        .unwrap();
    db::assign_skill_tags(
        &source,
        &["alpha".to_string()],
        std::slice::from_ref(&tag.id),
        "manual",
        None,
        None,
    )
    .await
    .unwrap();
    db::create_saved_view(
        &source,
        db::NewSavedView {
            name: "Pinned docs",
            query: r#"{"tags":["Docs"]}"#,
            icon: None,
            pinned: true,
        },
    )
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO skill_registries (id, name, source_type, url, is_builtin, is_enabled, created_at)
         VALUES ('custom', 'Team', 'github', 'https://github.com/team/registry', 0, 1, '2026-10-28')",
    )
    .execute(&source)
    .await
    .unwrap();
    let bundle = dir.path().join("bundle.skillport");
    export_bundle(&source, &CentralFs::Local, "local", bundle.clone(), JOB)
        .await
        .unwrap();

    let target = mem_pool().await;
    let target_root = dir.path().join("target");
    std::fs::create_dir_all(&target_root).unwrap();
    set_agent_dir(&target, "central", &target_root).await;
    Fixture {
        _dir: dir,
        bundle,
        target,
        target_root,
    }
}

async fn preview(fx: &Fixture, cache: &PreviewCache) -> PortableBundleImportPreview {
    preview_import(
        &fx.target,
        &CentralFs::Local,
        TARGET,
        fx.bundle.clone(),
        cache,
        JOB,
    )
    .await
    .unwrap()
}

async fn apply(
    fx: &Fixture,
    cache: &PreviewCache,
    token: &str,
    decisions: &[PortableBundleDecision],
) -> Result<PortableBundleImportResult, PortableBundleError> {
    apply_import(
        &fx.target,
        &CentralFs::Local,
        TARGET,
        token,
        decisions,
        cache,
        JOB,
    )
    .await
}

fn statuses(preview: &PortableBundleImportPreview) -> BTreeMap<String, PortableBundleSkillStatus> {
    preview
        .skills
        .iter()
        .map(|skill| (skill.id.clone(), skill.status))
        .collect()
}

fn decision(id: &str, action: PortableBundleDecisionAction) -> PortableBundleDecision {
    PortableBundleDecision {
        skill_id: id.to_string(),
        action,
        rename_to: None,
    }
}

async fn count(pool: &DbPool, table: &str) -> i64 {
    sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Entries in the Central root other than skill directories (staging,
/// backups, temp files).
fn work_artifacts(root: &Path, skill_ids: &[&str]) -> Vec<String> {
    let mut names = std::fs::read_dir(root)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|name| !skill_ids.contains(&name.as_str()))
        .collect::<Vec<_>>();
    names.sort();
    names
}

fn rewrite_manifest(path: &Path, mut change: impl FnMut(&mut BundleManifest)) {
    let bytes = std::fs::read(path).unwrap();
    let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
    let mut entries = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).unwrap();
        let mut contents = Vec::new();
        file.read_to_end(&mut contents).unwrap();
        entries.push((file.name().unwrap().into_owned(), contents));
    }
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, contents) in entries {
        let contents = if name == MANIFEST_PATH {
            let mut manifest: BundleManifest = serde_json::from_slice(&contents).unwrap();
            change(&mut manifest);
            serde_json::to_vec(&manifest).unwrap()
        } else {
            contents
        };
        writer
            .start_file(name, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(&contents).unwrap();
    }
    std::fs::write(path, writer.finish().unwrap().into_inner()).unwrap();
}

#[tokio::test]
async fn preview_classifies_every_status_and_metadata_state() {
    let fx = fixture().await;
    // alpha identical, beta changed, gamma platform-only row, omega orphan dir.
    seed_central(&fx.target, &fx.target_root, "alpha", "body").await;
    seed_central(&fx.target, &fx.target_root, "beta", "edited locally").await;
    db::upsert_skill(
        &fx.target,
        &skill_row(&fx.target_root, "gamma", "gamma-uid", false),
    )
    .await
    .unwrap();
    rewrite_manifest(&fx.bundle, |manifest| {
        let mut omega = manifest.skills[0].clone();
        omega.id = "omega".to_string();
        omega.tag_keys = vec!["missing-tag".to_string()];
        manifest.skills.push(omega);
    });
    // The omega entry above references alpha's payload dir and an unknown tag,
    // so the reader marks it invalid.
    let tag = db::create_skill_tag(&fx.target, "Docs", None, Some("#000000"))
        .await
        .unwrap();
    let _ = tag;

    let cache = PreviewCache::default();
    let preview = preview(&fx, &cache).await;
    let statuses = statuses(&preview);
    assert_eq!(statuses["alpha"], PortableBundleSkillStatus::Identical);
    assert_eq!(statuses["beta"], PortableBundleSkillStatus::Changed);
    assert_eq!(
        statuses["gamma"],
        PortableBundleSkillStatus::ExistsUnmanaged
    );
    assert_eq!(statuses["delta"], PortableBundleSkillStatus::New);
    assert_eq!(statuses["omega"], PortableBundleSkillStatus::Invalid);
    let omega = preview
        .skills
        .iter()
        .find(|skill| skill.id == "omega")
        .unwrap();
    assert!(omega.invalid_reason.is_some());
    assert!(
        preview
            .skills
            .iter()
            .find(|s| s.id == "alpha")
            .unwrap()
            .has_github_source
    );

    // Metadata: the group and view are new, the "Docs" tag exists with a
    // different color → update, the registry is new.
    assert_eq!(preview.metadata.tag_groups.add, 1);
    assert_eq!(preview.metadata.tags.update, 1);
    assert_eq!(preview.metadata.saved_views.add, 1);
    assert_eq!(preview.metadata.registries.add, 1);
    // Preview is read-only.
    assert!(!fx.target_root.join("delta").exists());
    assert_eq!(count(&fx.target, "skill_saved_views").await, 0);
}

#[tokio::test]
async fn preview_reports_orphan_directory_as_unmanaged() {
    let fx = fixture().await;
    write_skill_dir(&fx.target_root, "delta", "stray");
    let cache = PreviewCache::default();
    let statuses = statuses(&preview(&fx, &cache).await);
    assert_eq!(
        statuses["delta"],
        PortableBundleSkillStatus::ExistsUnmanaged
    );
}

#[tokio::test]
async fn import_writes_skills_provenance_and_metadata_then_reimport_is_noop() {
    let fx = fixture().await;
    let cache = PreviewCache::default();
    let first = preview(&fx, &cache).await;
    let result = apply(&fx, &cache, &first.preview_token, &[]).await.unwrap();
    let mut imported = result.imported.clone();
    imported.sort();
    assert_eq!(imported, ["alpha", "beta", "delta", "gamma"]);
    assert!(result.failed.is_empty(), "{:?}", result.failed);
    assert!(!result.cancelled);

    let alpha_dir = fx.target_root.join("alpha");
    assert_eq!(
        std::fs::read_to_string(alpha_dir.join("refs/notes.md")).unwrap(),
        "alpha notes"
    );
    let alpha = db::get_skill_by_id(&fx.target, "alpha")
        .await
        .unwrap()
        .unwrap();
    assert!(alpha.is_central);
    assert_ne!(
        alpha.uid, "alpha-uid",
        "uid is minted locally, never copied"
    );
    let assignment = db::get_skill_repository_assignment(&fx.target, "alpha")
        .await
        .unwrap();
    assert!(!assignment.is_source_unknown);
    assert_eq!(assignment.repository.owner.as_deref(), Some("openai"));
    assert_eq!(assignment.repository.branch.as_deref(), Some("main"));
    assert_eq!(assignment.source_path.as_deref(), Some("skills/alpha"));
    let beta = db::get_skill_repository_assignment(&fx.target, "beta")
        .await
        .unwrap();
    assert!(beta.is_source_unknown || beta.repository.is_unknown);

    let alpha_tags = db::get_skill_tags_for_skill(&fx.target, "alpha")
        .await
        .unwrap();
    assert_eq!(alpha_tags.len(), 1);
    assert_eq!(alpha_tags[0].name, "Docs");
    assert!(alpha_tags[0].group_id.is_some());
    assert_eq!(count(&fx.target, "skill_saved_views").await, 1);
    assert_eq!(
        work_artifacts(&fx.target_root, &["alpha", "beta", "gamma", "delta"]),
        Vec::<String>::new()
    );

    let tables = [
        "skills",
        "skill_tags",
        "skill_tag_groups",
        "skill_tag_links",
        "skill_saved_views",
        "skill_registries",
        "skill_repository_members",
    ];
    let mut before = Vec::new();
    for table in tables {
        before.push(count(&fx.target, table).await);
    }
    let second = preview(&fx, &cache).await;
    assert!(second
        .skills
        .iter()
        .all(|skill| skill.status == PortableBundleSkillStatus::Identical));
    assert_eq!(second.metadata.tags.add + second.metadata.tags.update, 0);
    assert_eq!(second.metadata.registries.add, 0);
    let again = apply(&fx, &cache, &second.preview_token, &[])
        .await
        .unwrap();
    assert!(again.imported.is_empty() && again.overwritten.is_empty());
    assert!(again.skipped.iter().all(|issue| issue.code == "identical"));
    assert_eq!(again.metadata.added + again.metadata.updated, 0);
    let mut after = Vec::new();
    for table in tables {
        after.push(count(&fx.target, table).await);
    }
    assert_eq!(before, after);
}

#[tokio::test]
async fn conflicts_need_decisions_and_renames_are_validated() {
    let fx = fixture().await;
    seed_central(&fx.target, &fx.target_root, "beta", "edited locally").await;
    let cache = PreviewCache::default();
    let token = preview(&fx, &cache).await.preview_token;

    let missing = apply(&fx, &cache, &token, &[]).await.unwrap_err();
    assert!(matches!(missing, PortableBundleError::DecisionRequired(id) if id == "beta"));

    let mut taken = decision("beta", PortableBundleDecisionAction::Rename);
    taken.rename_to = Some("alpha".to_string());
    let taken = apply(&fx, &cache, &token, &[taken]).await.unwrap_err();
    assert_eq!(taken.code(), "portable_bundle.rename_invalid");

    let mut bad = decision("beta", PortableBundleDecisionAction::Rename);
    bad.rename_to = Some("../escape".to_string());
    let bad = apply(&fx, &cache, &token, &[bad]).await.unwrap_err();
    assert_eq!(bad.code(), "portable_bundle.rename_invalid");
    // Nothing was written by the rejected attempts.
    assert!(!fx.target_root.join("alpha").exists());

    let mut rename = decision("beta", PortableBundleDecisionAction::Rename);
    rename.rename_to = Some("beta-imported".to_string());
    let result = apply(&fx, &cache, &token, &[rename]).await.unwrap();
    assert_eq!(result.renamed.len(), 1);
    assert_eq!(result.renamed[0].to, "beta-imported");
    assert!(fx.target_root.join("beta-imported/SKILL.md").is_file());
    let kept = std::fs::read_to_string(fx.target_root.join("beta/SKILL.md")).unwrap();
    assert!(kept.contains("edited locally"));
}

#[tokio::test]
async fn overwrite_keeps_target_uid_and_skip_leaves_content() {
    let fx = fixture().await;
    seed_central(&fx.target, &fx.target_root, "beta", "edited locally").await;
    db::upsert_skill(
        &fx.target,
        &skill_row(&fx.target_root, "gamma", "gamma-uid", false),
    )
    .await
    .unwrap();
    seed_central(&fx.target, &fx.target_root, "delta", "edited locally").await;
    let cache = PreviewCache::default();
    let token = preview(&fx, &cache).await.preview_token;
    let result = apply(
        &fx,
        &cache,
        &token,
        &[
            decision("beta", PortableBundleDecisionAction::Overwrite),
            decision("gamma", PortableBundleDecisionAction::Overwrite),
            decision("delta", PortableBundleDecisionAction::Skip),
        ],
    )
    .await
    .unwrap();
    let mut overwritten = result.overwritten.clone();
    overwritten.sort();
    assert_eq!(overwritten, ["beta", "gamma"]);
    assert!(result
        .skipped
        .iter()
        .any(|issue| issue.id == "delta" && issue.code == "user_skipped"));

    let beta = db::get_skill_by_id(&fx.target, "beta")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(beta.uid, "beta-uid");
    let gamma = db::get_skill_by_id(&fx.target, "gamma")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(gamma.uid, "gamma-uid");
    assert!(gamma.is_central);
    let body = std::fs::read_to_string(fx.target_root.join("beta/SKILL.md")).unwrap();
    assert!(!body.contains("edited locally"));
    let delta = std::fs::read_to_string(fx.target_root.join("delta/SKILL.md")).unwrap();
    assert!(delta.contains("edited locally"));
    assert_eq!(
        work_artifacts(&fx.target_root, &["alpha", "beta", "gamma", "delta"]),
        Vec::<String>::new()
    );
}

#[tokio::test]
async fn stale_expired_and_retargeted_previews_are_rejected() {
    let fx = fixture().await;
    let cache = PreviewCache::default();

    let token = preview(&fx, &cache).await.preview_token;
    let other_target = apply_import(
        &fx.target,
        &CentralFs::Local,
        "ssh-other",
        &token,
        &[],
        &cache,
        JOB,
    )
    .await
    .unwrap_err();
    assert_eq!(other_target.code(), "portable_bundle.target_changed");

    cache.age_entry(&token, PREVIEW_TTL + Duration::from_secs(1));
    let expired = apply(&fx, &cache, &token, &[]).await.unwrap_err();
    assert_eq!(expired.code(), "portable_bundle.preview_expired");

    let token = preview(&fx, &cache).await.preview_token;
    let mut bytes = std::fs::read(&fx.bundle).unwrap();
    bytes.extend_from_slice(b"tamper");
    std::fs::write(&fx.bundle, bytes).unwrap();
    let stale = apply(&fx, &cache, &token, &[]).await.unwrap_err();
    assert_eq!(stale.code(), "portable_bundle.preview_stale");

    assert!(cache.discard(&token));
    let discarded = apply(&fx, &cache, &token, &[]).await.unwrap_err();
    assert_eq!(discarded.code(), "portable_bundle.preview_expired");
    assert_eq!(count(&fx.target, "skills").await, 0);
}

#[tokio::test]
async fn db_failure_after_swap_restores_old_directory() {
    let fx = fixture().await;
    seed_central(&fx.target, &fx.target_root, "beta", "edited locally").await;
    std::fs::write(fx.target_root.join("beta/old.txt"), b"old").unwrap();
    sqlx::query(
        "CREATE TRIGGER fail_bundle_upsert
         BEFORE INSERT ON skills
         WHEN NEW.source = 'portable-bundle'
         BEGIN
           SELECT RAISE(FAIL, 'forced portable bundle DB failure');
         END",
    )
    .execute(&fx.target)
    .await
    .unwrap();

    let cache = PreviewCache::default();
    let token = preview(&fx, &cache).await.preview_token;
    let result = apply(
        &fx,
        &cache,
        &token,
        &[decision("beta", PortableBundleDecisionAction::Overwrite)],
    )
    .await
    .unwrap();
    assert!(result
        .failed
        .iter()
        .any(|issue| issue.id == "beta" && issue.code == "write_failed"));
    // alpha has GitHub provenance (source "github:…"), so the trigger spares it.
    assert!(result.imported.contains(&"alpha".to_string()));
    assert!(fx.target_root.join("beta/old.txt").is_file());
    let body = std::fs::read_to_string(fx.target_root.join("beta/SKILL.md")).unwrap();
    assert!(body.contains("edited locally"));
    let beta = db::get_skill_by_id(&fx.target, "beta")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(beta.uid, "beta-uid");
    assert_eq!(
        work_artifacts(&fx.target_root, &["alpha", "beta"]),
        Vec::<String>::new()
    );
}

#[tokio::test]
async fn cancelled_apply_writes_nothing() {
    let fx = fixture().await;
    let cache = PreviewCache::default();
    let token = preview(&fx, &cache).await.preview_token;
    let cancel = AtomicBool::new(true);
    let job = BundleJob {
        job_id: "cancelled",
        app: None,
        cancel: Some(&cancel),
    };
    let error = apply_import(
        &fx.target,
        &CentralFs::Local,
        TARGET,
        &token,
        &[],
        &cache,
        job,
    )
    .await
    .unwrap_err();
    assert!(matches!(error, PortableBundleError::Cancelled));
    assert_eq!(count(&fx.target, "skills").await, 0);
    assert_eq!(work_artifacts(&fx.target_root, &[]), Vec::<String>::new());
}

#[tokio::test]
async fn legacy_v1_file_is_reported_by_preview() {
    let fx = fixture().await;
    let legacy = fx.bundle.with_extension("zip");
    std::fs::write(&legacy, br#"{"kind":"skillport/state-export","version":1}"#).unwrap();
    let cache = PreviewCache::default();
    let error = preview_import(&fx.target, &CentralFs::Local, TARGET, legacy, &cache, JOB)
        .await
        .unwrap_err();
    assert_eq!(error.code(), "portable_bundle.legacy_v1");
}
