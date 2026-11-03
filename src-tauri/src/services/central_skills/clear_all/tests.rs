//! Central clear-all scenario tests (parent PRD S1–S16).
//!
//! Every test redirects all agents into a TempDir so no real platform
//! directory, Central root, or `~/.skillsmanage/db.sqlite` is touched.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use tempfile::TempDir;

use super::candidates::RootDefaults;
use super::remote::{parse_dir_probe, parse_path_probe, parse_remove_output, RemoteDirListing};
use super::*;
use crate::db::{self, Agent, DbPool, Project, ProjectSkillInstallation, SkillInstallation};
use crate::test_support::{file_pool, seed_central_skill, write_skill_md};

const AGENT_A: &str = "windsurf";
const AGENT_B: &str = "amp";

struct Fixture {
    pool: DbPool,
    _db_dir: TempDir,
    temp: TempDir,
    central: PathBuf,
}

impl Fixture {
    async fn new() -> Self {
        let (pool, db_dir) = file_pool().await;
        let temp = TempDir::new().unwrap();
        let central = temp.path().join("central");
        std::fs::create_dir_all(&central).unwrap();
        for agent in db::get_all_agents(&pool).await.unwrap() {
            let dir = if agent.id == "central" {
                central.clone()
            } else {
                temp.path().join("agents").join(&agent.id)
            };
            crate::test_support::set_agent_dir(&pool, &agent.id, &dir).await;
        }
        Self {
            pool,
            _db_dir: db_dir,
            temp,
            central,
        }
    }

    fn agent_dir(&self, agent_id: &str) -> PathBuf {
        let dir = self.temp.path().join("agents").join(agent_id);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn seed_skill(&self, id: &str) -> PathBuf {
        let dir = self.central.join(id);
        seed_central_skill(&self.pool, &dir, id, "clear-all fixture").await;
        dir
    }

    async fn link_install(&self, skill_id: &str, agent_id: &str) -> PathBuf {
        let link = self.agent_dir(agent_id).join(skill_id);
        make_dir_link(&self.central.join(skill_id), &link);
        record_install(&self.pool, skill_id, agent_id, &link, "symlink").await;
        link
    }

    async fn preview(&self) -> ClearCentralPreview {
        self.preview_with(RootDefaults {
            local: Some(Vec::new()),
        })
        .await
    }

    async fn preview_with(&self, defaults: RootDefaults) -> ClearCentralPreview {
        preview_with(&self.pool, &ActiveTarget::Local, None, &defaults)
            .await
            .unwrap()
    }

    async fn apply(&self, request: &ClearCentralRequest) -> ClearCentralResult {
        let cancel = AtomicBool::new(false);
        let sink = |_: ClearCentralProgress| {};
        self.apply_with_job(request, &cancel, &sink).await
    }

    async fn apply_with_job(
        &self,
        request: &ClearCentralRequest,
        cancel: &AtomicBool,
        sink: &(dyn Fn(ClearCentralProgress) + Send + Sync),
    ) -> ClearCentralResult {
        let job = ClearJob {
            job_id: "clear-test",
            cancel,
            progress: sink,
        };
        clear_with_for_tests(
            &self.pool,
            &ActiveTarget::Local,
            None,
            request,
            job,
            &RootDefaults {
                local: Some(Vec::new()),
            },
        )
        .await
        .unwrap()
    }
}

/// Junction on Windows (no symlink privilege needed), symlink elsewhere.
/// The target must exist when the link is created.
fn make_dir_link(target: &Path, link: &Path) {
    std::fs::create_dir_all(link.parent().unwrap()).unwrap();
    #[cfg(windows)]
    {
        crate::services::installation::fs_util::create_skills_cli_directory_link(target, link)
            .expect("create test junction");
    }
    #[cfg(not(windows))]
    {
        crate::test_support::symlink_dir(target, link);
    }
}

fn link_exists(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

async fn record_install(pool: &DbPool, skill_id: &str, agent_id: &str, path: &Path, kind: &str) {
    db::upsert_skill_installation(
        pool,
        &SkillInstallation {
            skill_id: skill_id.to_string(),
            agent_id: agent_id.to_string(),
            installed_path: path.to_string_lossy().into_owned(),
            link_type: kind.to_string(),
            symlink_target: None,
            created_at: Utc::now().to_rfc3339(),
        },
    )
    .await
    .unwrap();
}

/// Request everything a preview listed (what the renderer sends by default).
fn request_from(preview: &ClearCentralPreview) -> ClearCentralRequest {
    let keys = |items: &[ClearCentralPathItem]| {
        items
            .iter()
            .map(|item| item.key.clone())
            .collect::<Vec<_>>()
    };
    ClearCentralRequest {
        preview_id: preview.preview_id.clone(),
        skill_ids: preview.skill_ids.clone(),
        remove_copy_agent_ids: Vec::new(),
        project_link_keys: keys(&preview.project_links),
        orphan_link_keys: keys(&preview.orphan_links),
        untracked_entry_keys: keys(&preview.untracked_central_entries),
    }
}

fn summary<'a>(preview: &'a ClearCentralPreview, agent_id: &str) -> &'a ClearCentralAgentSummary {
    preview
        .agent_summaries
        .iter()
        .find(|summary| summary.agent_id == agent_id)
        .unwrap_or_else(|| panic!("missing summary for {agent_id}"))
}

async fn skill_exists(pool: &DbPool, skill_id: &str) -> bool {
    db::get_skill_by_id(pool, skill_id).await.unwrap().is_some()
}

// ─── S1 / S2 / S3 ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn clear_all_removes_central_dirs_links_and_rows() {
    let fx = Fixture::new().await;
    let skill_dir = fx.seed_skill("alpha").await;
    let link = fx.link_install("alpha", AGENT_A).await;

    let preview = fx.preview().await;
    assert_eq!(preview.target_kind, "local");
    assert_eq!(preview.skill_ids, vec!["alpha".to_string()]);
    assert_eq!(summary(&preview, AGENT_A).link_count, 1);
    assert!(preview.orphan_links.is_empty());
    assert!(preview.untracked_central_entries.is_empty());
    // Preview writes nothing.
    assert!(skill_dir.exists() && link_exists(&link));

    let result = fx.apply(&request_from(&preview)).await;
    assert_eq!(result.skills.succeeded.len(), 1);
    assert!(result.skills.failed.is_empty());
    assert!(!result.cancelled);
    assert!(!skill_dir.exists());
    assert!(!link_exists(&link));
    assert!(!skill_exists(&fx.pool, "alpha").await);
}

#[tokio::test]
async fn clear_all_keeps_copy_by_default_and_removes_selected_agents() {
    let fx = Fixture::new().await;
    fx.seed_skill("alpha").await;
    fx.seed_skill("beta").await;
    let copy_a = fx.agent_dir(AGENT_A).join("alpha");
    let copy_b = fx.agent_dir(AGENT_B).join("beta");
    write_skill_md(&copy_a, "alpha", Some("copy"));
    write_skill_md(&copy_b, "beta", Some("copy"));
    record_install(&fx.pool, "alpha", AGENT_A, &copy_a, "copy").await;
    record_install(&fx.pool, "beta", AGENT_B, &copy_b, "copy").await;

    let preview = fx.preview().await;
    assert_eq!(summary(&preview, AGENT_A).copy_count, 1);
    assert_eq!(summary(&preview, AGENT_B).copy_count, 1);
    // DB-registered copies are not "unmanaged".
    assert_eq!(preview.skipped_unmanaged_count, 0);

    let mut request = request_from(&preview);
    request.remove_copy_agent_ids = vec![AGENT_B.to_string()];
    let result = fx.apply(&request).await;
    assert_eq!(result.skills.succeeded.len(), 2);
    assert!(copy_a.exists(), "unselected copy must be kept");
    assert!(!copy_b.exists(), "selected agent copy must be removed");
}

#[tokio::test]
async fn clear_all_tolerates_missing_central_dir() {
    let fx = Fixture::new().await;
    let skill_dir = fx.seed_skill("alpha").await;
    let link = fx.link_install("alpha", AGENT_A).await;
    std::fs::remove_dir_all(&skill_dir).unwrap();
    assert!(link_exists(&link), "dangling link stays visible");

    let preview = fx.preview().await;
    assert_eq!(preview.skill_ids, vec!["alpha".to_string()]);
    let result = fx.apply(&request_from(&preview)).await;
    assert_eq!(
        result.skills.succeeded.len(),
        1,
        "{:?}",
        result.skills.failed
    );
    assert!(!link_exists(&link));
    assert!(!skill_exists(&fx.pool, "alpha").await);
}

// ─── S4 / S5 / S6 / S7 / S8 / S9 ─────────────────────────────────────────────

#[tokio::test]
async fn clear_all_removes_untracked_central_entry_and_its_links() {
    let fx = Fixture::new().await;
    let stray = fx.central.join("stray");
    write_skill_md(&stray, "stray", Some("never scanned"));
    std::fs::create_dir_all(fx.central.join(".skillport-delete-backup-x")).unwrap();
    std::fs::write(fx.central.join("README.md"), "keep").unwrap();
    let link = fx.agent_dir(AGENT_A).join("stray");
    make_dir_link(&stray, &link);

    let preview = fx.preview().await;
    assert!(preview.skill_ids.is_empty());
    assert_eq!(preview.untracked_central_entries.len(), 1);
    assert_eq!(preview.untracked_central_entries[0].owner_id, "central");
    assert_eq!(preview.orphan_links.len(), 1);
    assert_eq!(summary(&preview, AGENT_A).orphan_link_count, 1);

    let result = fx.apply(&request_from(&preview)).await;
    assert_eq!(result.untracked_central_entries.removed, 1);
    assert_eq!(result.orphan_links.removed, 1);
    assert!(!stray.exists());
    assert!(!link_exists(&link));
    // Journal artifacts and plain files at the Central root are never touched.
    assert!(fx.central.join(".skillport-delete-backup-x").exists());
    assert!(fx.central.join("README.md").exists());
}

#[tokio::test]
async fn sweep_detects_dangling_junction_into_central_root() {
    let fx = Fixture::new().await;
    let ghost = fx.central.join("ghost");
    std::fs::create_dir_all(&ghost).unwrap();
    let link = fx.agent_dir(AGENT_A).join("ghost");
    make_dir_link(&ghost, &link);
    std::fs::remove_dir_all(&ghost).unwrap();

    let preview = fx.preview().await;
    assert_eq!(preview.orphan_links.len(), 1);
    assert!(preview.orphan_links[0].dangling);
    assert_eq!(preview.orphan_links[0].owner_id, AGENT_A);
    assert!(preview.untracked_central_entries.is_empty());

    let result = fx.apply(&request_from(&preview)).await;
    assert_eq!(result.orphan_links.removed, 1);
    assert!(!link_exists(&link));
}

#[tokio::test]
async fn sweep_attributes_default_root_after_location_change() {
    let fx = Fixture::new().await;
    let old_root = fx
        .temp
        .path()
        .join("home")
        .join(".skillsmanage")
        .join("skills");
    let old_skill = old_root.join("legacy");
    std::fs::create_dir_all(&old_skill).unwrap();
    let link = fx.agent_dir(AGENT_A).join("legacy");
    make_dir_link(&old_skill, &link);

    let without_default = fx.preview().await;
    assert!(without_default.orphan_links.is_empty());

    let with_default = fx
        .preview_with(RootDefaults {
            local: Some(vec![old_root.clone()]),
        })
        .await;
    assert_eq!(with_default.orphan_links.len(), 1);
    assert_eq!(
        with_default.orphan_links[0].skill_name.as_deref(),
        Some("legacy")
    );
}

#[tokio::test]
async fn sweep_ignores_links_outside_central_and_plain_dirs() {
    let fx = Fixture::new().await;
    let foreign = fx.temp.path().join("skills-cli").join("tool");
    std::fs::create_dir_all(&foreign).unwrap();
    let foreign_link = fx.agent_dir(AGENT_A).join("tool");
    make_dir_link(&foreign, &foreign_link);
    // Prefix trap: `central-old` must not count as inside `central`.
    let prefix_trap = fx.temp.path().join("central-old").join("x");
    std::fs::create_dir_all(&prefix_trap).unwrap();
    let trap_link = fx.agent_dir(AGENT_A).join("x");
    make_dir_link(&prefix_trap, &trap_link);
    let plain = fx.agent_dir(AGENT_B).join("handmade");
    write_skill_md(&plain, "handmade", Some("user owned"));

    let preview = fx.preview().await;
    assert!(preview.orphan_links.is_empty());
    assert_eq!(preview.skipped_unmanaged_count, 1);

    let request = ClearCentralRequest {
        orphan_link_keys: vec![CLEAR_ALL_WILDCARD_KEY.to_string()],
        untracked_entry_keys: vec![CLEAR_ALL_WILDCARD_KEY.to_string()],
        project_link_keys: vec![CLEAR_ALL_WILDCARD_KEY.to_string()],
        ..Default::default()
    };
    let result = fx.apply(&request).await;
    assert_eq!(result.orphan_links.removed, 0);
    assert!(link_exists(&foreign_link));
    assert!(link_exists(&trap_link));
    assert!(plain.join("SKILL.md").exists());
    assert!(foreign.exists() && prefix_trap.exists());
}

#[tokio::test]
async fn clear_all_handles_agent_dir_equal_to_central_root() {
    let fx = Fixture::new().await;
    crate::test_support::set_agent_dir(&fx.pool, AGENT_A, &fx.central).await;
    let skill_dir = fx.seed_skill("alpha").await;

    let preview = fx.preview().await;
    assert_eq!(preview.skill_ids, vec!["alpha".to_string()]);
    assert!(preview.orphan_links.is_empty());
    assert!(preview.untracked_central_entries.is_empty());
    assert_eq!(preview.skipped_unmanaged_count, 0);

    let result = fx.apply(&request_from(&preview)).await;
    assert_eq!(result.skills.succeeded.len(), 1);
    assert!(result.skills.failed.is_empty());
    assert!(!skill_dir.exists());
}

// ─── S10 ─────────────────────────────────────────────────────────────────────

async fn seed_project_link(fx: &Fixture, skill_id: &str) -> (PathBuf, PathBuf) {
    sqlx::query("UPDATE agents SET project_skills_dir = '.windsurf/skills' WHERE id = ?")
        .bind(AGENT_A)
        .execute(&fx.pool)
        .await
        .unwrap();
    let project_root = fx.temp.path().join("project");
    let project_skills = project_root.join(".windsurf").join("skills");
    let link = project_skills.join(skill_id);
    make_dir_link(&fx.central.join(skill_id), &link);
    db::insert_project(
        &fx.pool,
        &Project {
            id: "project-1".to_string(),
            path: project_root.to_string_lossy().into_owned(),
            name: "project".to_string(),
            pinned: false,
            added_at: Utc::now().to_rfc3339(),
            last_scanned_at: None,
        },
    )
    .await
    .unwrap();
    db::upsert_project_skill_installation(
        &fx.pool,
        &ProjectSkillInstallation {
            project_id: "project-1".to_string(),
            skill_id: skill_id.to_string(),
            name: skill_id.to_string(),
            description: None,
            file_path: link.join("SKILL.md").to_string_lossy().into_owned(),
            source_origin: "central".to_string(),
            agent_id: AGENT_A.to_string(),
            installed_path: link.to_string_lossy().into_owned(),
            link_type: "symlink".to_string(),
            symlink_target: Some(fx.central.join(skill_id).to_string_lossy().into_owned()),
            created_at: Utc::now().to_rfc3339(),
        },
    )
    .await
    .unwrap();
    (project_skills, link)
}

#[tokio::test]
async fn clear_all_removes_project_links_and_psi_rows() {
    let fx = Fixture::new().await;
    fx.seed_skill("alpha").await;
    let (project_skills, link) = seed_project_link(&fx, "alpha").await;
    // A second, unregistered link in the project dir is an orphan.
    fx.seed_skill("beta").await;
    let orphan = project_skills.join("beta");
    make_dir_link(&fx.central.join("beta"), &orphan);

    let preview = fx.preview().await;
    assert_eq!(preview.project_links.len(), 1);
    assert_eq!(preview.project_links[0].owner_id, "project-1");
    assert_eq!(preview.orphan_links.len(), 1);
    assert_eq!(preview.orphan_links[0].owner_id, "project-1");

    let result = fx.apply(&request_from(&preview)).await;
    assert_eq!(result.project_links.removed, 1);
    assert_eq!(result.orphan_links.removed, 1);
    assert_eq!(result.skills.succeeded.len(), 2);
    assert!(!link_exists(&link));
    assert!(!link_exists(&orphan));
    assert!(db::list_project_skill_installations(&fx.pool, "project-1")
        .await
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn project_links_can_be_kept_by_omitting_keys() {
    let fx = Fixture::new().await;
    fx.seed_skill("alpha").await;
    let (_, link) = seed_project_link(&fx, "alpha").await;
    let preview = fx.preview().await;
    let mut request = request_from(&preview);
    request.project_link_keys.clear();
    request.skill_ids.clear();
    let result = fx.apply(&request).await;
    assert_eq!(result.project_links.removed, 0);
    assert!(link_exists(&link));
    assert_eq!(
        db::list_project_skill_installations(&fx.pool, "project-1")
            .await
            .unwrap()
            .len(),
        1
    );
}

// ─── S11 ─────────────────────────────────────────────────────────────────────

async fn insert_pending_delete(pool: &DbPool, skill_id: &str, original: &Path, backup: &Path) {
    let operation_id = format!("pending-{skill_id}");
    let manifest = crate::services::central_operation::OperationManifest::Delete(
        crate::services::central_operation::DeleteManifest {
            version: crate::services::central_operation::MANIFEST_VERSION,
            operation_id: operation_id.clone(),
            paths: vec![crate::services::central_operation::ManagedPath {
                original: original.to_string_lossy().into_owned(),
                backup: backup.to_string_lossy().into_owned(),
                marker: backup
                    .with_extension("marker")
                    .to_string_lossy()
                    .into_owned(),
                expected_present: true,
                fingerprint: None,
            }],
        },
    );
    let manifest_json = serde_json::to_string(&manifest).unwrap();
    db::insert_fs_db_operation(
        pool,
        db::NewFsDbOperation {
            id: &operation_id,
            batch_id: None,
            target_id: "local",
            target_kind: "local",
            operation_kind: "central_delete",
            skill_id,
            manifest_version: crate::services::central_operation::MANIFEST_VERSION,
            manifest_json: &manifest_json,
            old_fingerprint: None,
            new_fingerprint: None,
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn clear_all_recovers_pending_operations_first() {
    let fx = Fixture::new().await;
    let alpha = fx.seed_skill("alpha").await;
    fx.seed_skill("beta").await;
    // alpha: recoverable prepared delete (original present, no backup).
    insert_pending_delete(
        &fx.pool,
        "alpha",
        &alpha,
        &fx.central.join(".skillport-b-alpha"),
    )
    .await;
    // beta: collision (original and backup both missing) -> recovery fails.
    insert_pending_delete(
        &fx.pool,
        "beta",
        &fx.temp.path().join("gone-original"),
        &fx.temp.path().join("gone-backup"),
    )
    .await;

    let preview = fx.preview().await;
    assert_eq!(preview.pending_recovery_count, 2);

    let result = fx.apply(&request_from(&preview)).await;
    assert_eq!(result.recovery.recovered, 1);
    assert_eq!(result.recovery.failed, 1);
    let failed = result
        .skills
        .failed
        .iter()
        .find(|item| item.skill_id == "beta")
        .expect("beta recovery failure is reported");
    assert_eq!(failed.phase.as_deref(), Some("recovery"));
    assert!(result
        .skills
        .succeeded
        .iter()
        .any(|item| item.skill_id == "alpha"));
    assert!(!alpha.exists());
    assert!(
        skill_exists(&fx.pool, "beta").await,
        "failed recovery blocks only beta"
    );
}

// ─── S12 / S13 / S14 / S15 ───────────────────────────────────────────────────

#[tokio::test]
async fn clear_all_ignores_items_added_after_preview() {
    let fx = Fixture::new().await;
    let alpha = fx.seed_skill("alpha").await;
    let ghost = fx.central.join("ghost");
    std::fs::create_dir_all(&ghost).unwrap();
    let old_orphan = fx.agent_dir(AGENT_A).join("ghost");
    make_dir_link(&ghost, &old_orphan);
    std::fs::remove_dir_all(&ghost).unwrap();
    let preview = fx.preview().await;

    let late = fx.seed_skill("late").await;
    let late_link = fx.agent_dir(AGENT_B).join("late-link");
    make_dir_link(&late, &late_link);

    let result = fx.apply(&request_from(&preview)).await;
    assert_eq!(result.skills.succeeded.len(), 1);
    assert_eq!(result.orphan_links.removed, 1);
    assert!(!alpha.exists() && !link_exists(&old_orphan));
    assert!(late.exists(), "skill created after preview is kept");
    assert!(
        link_exists(&late_link),
        "link created after preview is kept"
    );
    assert!(skill_exists(&fx.pool, "late").await);
}

#[tokio::test]
async fn clear_all_reports_locked_file_and_retry_is_idempotent() {
    let fx = Fixture::new().await;
    let stray = fx.central.join("stray");
    write_skill_md(&stray, "stray", None);
    let preview = fx.preview().await;
    let request = request_from(&preview);

    let held = hold_file(&stray.join("SKILL.md"));
    let first = fx.apply(&request).await;
    assert_eq!(first.untracked_central_entries.removed, 0);
    assert_eq!(first.untracked_central_entries.failed.len(), 1);
    assert_eq!(
        first.untracked_central_entries.failed[0].error_code,
        "central_clear.remove_failed"
    );
    release_file(held, &fx.central);

    let retry = fx.apply(&request).await;
    assert_eq!(retry.untracked_central_entries.removed, 1);
    assert!(retry.untracked_central_entries.failed.is_empty());
    assert!(!stray.exists());

    let again = fx.apply(&request).await;
    assert_eq!(again.untracked_central_entries.removed, 0);
    assert!(again.untracked_central_entries.failed.is_empty());
    assert_eq!(again.skipped_changed, 1);
}

#[cfg(windows)]
fn hold_file(path: &Path) -> std::fs::File {
    use std::os::windows::fs::OpenOptionsExt;
    std::fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(path)
        .unwrap()
}

#[cfg(windows)]
fn release_file(file: std::fs::File, _central: &Path) {
    drop(file);
}

#[cfg(unix)]
fn hold_file(path: &Path) -> std::fs::Permissions {
    use std::os::unix::fs::PermissionsExt;
    let dir = path.parent().unwrap();
    let original = std::fs::metadata(dir).unwrap().permissions();
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o555)).unwrap();
    original
}

#[cfg(unix)]
fn release_file(original: std::fs::Permissions, central: &Path) {
    std::fs::set_permissions(central.join("stray"), original).unwrap();
}

#[tokio::test]
async fn preview_empty_when_nothing_to_clear() {
    let fx = Fixture::new().await;
    let preview = fx.preview().await;
    assert!(preview.skill_ids.is_empty());
    assert!(preview.skill_preview_failed.is_empty());
    assert!(preview.agent_summaries.is_empty());
    assert!(preview.project_links.is_empty());
    assert!(preview.orphan_links.is_empty());
    assert!(preview.untracked_central_entries.is_empty());
    assert_eq!(preview.skipped_unmanaged_count, 0);
    assert_eq!(preview.pending_recovery_count, 0);
    assert!(preview.sweep_warnings.is_empty());
    assert!(!preview.truncated);
}

#[tokio::test]
async fn sweep_includes_disabled_and_custom_agents() {
    let fx = Fixture::new().await;
    sqlx::query("UPDATE agents SET is_enabled = 0, is_detected = 0 WHERE id = ?")
        .bind(AGENT_A)
        .execute(&fx.pool)
        .await
        .unwrap();
    let custom_dir = fx.temp.path().join("custom-agent");
    db::insert_custom_agent(
        &fx.pool,
        &Agent {
            id: "my-custom".to_string(),
            display_name: "Custom".to_string(),
            category: "custom".to_string(),
            global_skills_dir: custom_dir.to_string_lossy().into_owned(),
            project_skills_dir: None,
            icon_name: None,
            is_detected: false,
            is_builtin: false,
            is_enabled: false,
        },
    )
    .await
    .unwrap();
    let ghost = fx.central.join("ghost");
    std::fs::create_dir_all(&ghost).unwrap();
    make_dir_link(&ghost, &fx.agent_dir(AGENT_A).join("ghost"));
    make_dir_link(&ghost, &custom_dir.join("ghost"));

    let preview = fx.preview().await;
    let owners = preview
        .orphan_links
        .iter()
        .map(|item| item.owner_id.as_str())
        .collect::<Vec<_>>();
    assert!(owners.contains(&AGENT_A), "{owners:?}");
    assert!(owners.contains(&"my-custom"), "{owners:?}");
}

// ─── S16 / safety / cancellation / regression ────────────────────────────────

#[tokio::test]
async fn clear_all_is_target_scoped() {
    let a = Fixture::new().await;
    let b = Fixture::new().await;
    let a_skill = a.seed_skill("shared").await;
    let b_skill = b.seed_skill("shared").await;
    let b_link = b.link_install("shared", AGENT_A).await;

    let preview = a.preview().await;
    let result = a.apply(&request_from(&preview)).await;
    assert_eq!(result.skills.succeeded.len(), 1);
    assert!(!a_skill.exists());
    assert!(b_skill.exists());
    assert!(link_exists(&b_link));
    assert!(skill_exists(&b.pool, "shared").await);
}

#[tokio::test]
async fn apply_rejects_out_of_scope_keys() {
    let fx = Fixture::new().await;
    let plain = fx.agent_dir(AGENT_A).join("plain");
    write_skill_md(&plain, "plain", None);
    let outside = fx.temp.path().join("outside");
    std::fs::create_dir_all(&outside).unwrap();
    let foreign_link = fx.agent_dir(AGENT_B).join("foreign");
    make_dir_link(&outside, &foreign_link);
    let key = |path: &Path| crate::paths::path_comparison_key(path);

    let request = ClearCentralRequest {
        skill_ids: vec!["not-a-skill".to_string()],
        orphan_link_keys: vec![key(&plain), key(&foreign_link), key(&outside)],
        untracked_entry_keys: vec![key(&outside), key(&fx.central)],
        project_link_keys: vec![key(&plain)],
        ..Default::default()
    };
    let result = fx.apply(&request).await;
    assert_eq!(result.succeeded_count(), 0);
    assert_eq!(result.failed_count(), 0);
    assert_eq!(result.skipped_changed, 7);
    assert!(plain.join("SKILL.md").exists());
    assert!(link_exists(&foreign_link));
    assert!(outside.exists() && fx.central.exists());
}

#[tokio::test]
async fn apply_cancel_between_chunks() {
    let fx = Fixture::new().await;
    for index in 0..30 {
        fx.seed_skill(&format!("skill-{index:02}")).await;
    }
    let preview = fx.preview().await;
    assert_eq!(preview.skill_ids.len(), 30);

    let cancel = Arc::new(AtomicBool::new(false));
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = {
        let cancel = Arc::clone(&cancel);
        let events = Arc::clone(&events);
        move |event: ClearCentralProgress| {
            if event.phase == ClearCentralPhase::Skills
                && event.status == ClearCentralProgressStatus::Running
            {
                cancel.store(true, Ordering::SeqCst);
            }
            events.lock().unwrap().push(event);
        }
    };
    let result = fx
        .apply_with_job(&request_from(&preview), &cancel, &sink)
        .await;
    assert!(result.cancelled);
    assert_eq!(result.skills.succeeded.len(), 25);
    let remaining = db::get_central_skills(&fx.pool).await.unwrap();
    assert_eq!(remaining.len(), 5, "committed deletes are not rolled back");

    let events = events.lock().unwrap();
    let last = events.last().unwrap();
    assert_eq!(last.status, ClearCentralProgressStatus::Cancelled);
    assert!(events.iter().all(|event| event.job_id == "clear-test"));
    assert!(events.iter().all(|event| event.completed <= event.total));
}

#[tokio::test]
async fn apply_emits_phase_and_terminal_progress() {
    let fx = Fixture::new().await;
    fx.seed_skill("alpha").await;
    let preview = fx.preview().await;
    let cancel = AtomicBool::new(false);
    let events = Mutex::new(Vec::new());
    let sink = |event: ClearCentralProgress| events.lock().unwrap().push(event);
    fx.apply_with_job(&request_from(&preview), &cancel, &sink)
        .await;
    let events = events.into_inner().unwrap();
    let phases = events
        .iter()
        .filter(|event| event.status == ClearCentralProgressStatus::Started)
        .map(|event| event.phase)
        .collect::<Vec<_>>();
    assert_eq!(
        phases,
        vec![
            ClearCentralPhase::Recovery,
            ClearCentralPhase::ProjectLinks,
            ClearCentralPhase::Skills,
            ClearCentralPhase::Untracked,
            ClearCentralPhase::OrphanLinks,
            ClearCentralPhase::Finalize,
        ]
    );
    let last = events.last().unwrap();
    assert_eq!(last.status, ClearCentralProgressStatus::Completed);
    assert_eq!(last.completed, last.total);
}

#[tokio::test]
async fn bulk_preview_matches_single_preview() {
    let fx = Fixture::new().await;
    fx.seed_skill("inside-a").await;
    fx.seed_skill("inside-b").await;
    let outside = fx.temp.path().join("outside").join("escaped");
    seed_central_skill(&fx.pool, &outside, "escaped", "outside root").await;
    let mut root_skill = crate::test_support::central_skill_row("root-skill", &fx.central);
    root_skill.file_path = fx.central.join("SKILL.md").to_string_lossy().into_owned();
    db::upsert_skill(&fx.pool, &root_skill).await.unwrap();

    let preview = fx.preview().await;
    let all_ids = db::get_central_skills(&fx.pool)
        .await
        .unwrap()
        .into_iter()
        .map(|skill| skill.id)
        .collect::<Vec<_>>();
    let single =
        crate::services::central_skills::preview_delete_central_skills_impl(&fx.pool, &all_ids)
            .await
            .unwrap();
    let mut single_ok = single
        .previews
        .iter()
        .map(|item| item.skill_id.clone())
        .collect::<Vec<_>>();
    single_ok.sort();
    let mut single_failed = single
        .failed
        .iter()
        .map(|item| item.skill_id.clone())
        .collect::<Vec<_>>();
    single_failed.sort();
    let mut bulk_failed = preview
        .skill_preview_failed
        .iter()
        .map(|item| item.skill_id.clone())
        .collect::<Vec<_>>();
    bulk_failed.sort();
    assert_eq!(preview.skill_ids, single_ok);
    assert_eq!(bulk_failed, single_failed);
    assert_eq!(
        bulk_failed,
        vec!["escaped".to_string(), "root-skill".to_string()]
    );
}

#[tokio::test]
async fn preview_truncates_lists_but_keeps_counts() {
    let fx = Fixture::new().await;
    let ghost = fx.central.join("ghost");
    std::fs::create_dir_all(&ghost).unwrap();
    let dir = fx.agent_dir(AGENT_A);
    for index in 0..(super::types::CLEAR_PREVIEW_PATH_LIMIT + 3) {
        make_dir_link(&ghost, &dir.join(format!("link-{index:05}")));
    }
    let preview = fx.preview().await;
    assert!(preview.truncated);
    assert_eq!(
        preview.orphan_links.len(),
        super::types::CLEAR_PREVIEW_PATH_LIMIT
    );
    assert_eq!(
        preview.orphan_link_count,
        super::types::CLEAR_PREVIEW_PATH_LIMIT + 3
    );

    let request = ClearCentralRequest {
        orphan_link_keys: vec![CLEAR_ALL_WILDCARD_KEY.to_string()],
        ..Default::default()
    };
    let result = fx.apply(&request).await;
    assert_eq!(
        result.orphan_links.removed,
        super::types::CLEAR_PREVIEW_PATH_LIMIT + 3
    );
}

// ─── Remote (FakeRunner) ─────────────────────────────────────────────────────

fn hex(value: &str) -> String {
    value.bytes().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn remote_probe_parsers_map_by_index() {
    let probe = parse_dir_probe(
        &format!(
            "REAL\t1\t{}\nLINK\t2\t{}\t{}\nDIR\t2\t{}\nUNREADABLE\t3\nLINK\t9\t{}\t{}\ngarbage\n",
            hex("/home/a/.skillsmanage/skills"),
            hex("ghost"),
            hex("/home/a/.skillsmanage/skills/ghost"),
            hex("plain"),
            hex("bad"),
            hex("/x"),
        ),
        3,
    );
    assert_eq!(
        probe.resolved_root.as_deref(),
        Some("/home/a/.skillsmanage/skills")
    );
    let listings = &probe.listings;
    assert_eq!(listings[0], RemoteDirListing::Missing);
    assert!(matches!(&listings[1], RemoteDirListing::Entries(entries) if entries.len() == 2));
    assert_eq!(listings[2], RemoteDirListing::Unreadable);

    let states = parse_path_probe(&format!("LINK\t1\t{}\nGONE\t2\n", hex("../central/x")), 3);
    assert_eq!(
        states[0],
        super::remote::RemotePathState::Link("../central/x".to_string())
    );
    assert_eq!(states[1], super::remote::RemotePathState::Gone);
    assert_eq!(states[2], super::remote::RemotePathState::Other);

    let statuses = parse_remove_output("OK\t1\nSKIP\t2\nGONE\t3\n", 4);
    use super::remote::RemoteRemoveStatus;
    assert_eq!(
        statuses,
        vec![
            RemoteRemoveStatus::Removed,
            RemoteRemoveStatus::Skipped,
            RemoteRemoveStatus::Gone,
            RemoteRemoveStatus::Failed,
        ]
    );
}

#[test]
fn remote_probe_newline_in_name_cannot_forge_link_record() {
    use super::remote::RemoteEntry;
    // A raw (unencoded) record, which is what a newline inside a name would
    // inject under a plain-text protocol, is not strict hex and is dropped.
    let forged = parse_dir_probe("LINK\t2\tevil\t/home/a/.skillsmanage/skills/evil\n", 2);
    assert_eq!(forged.listings[1], RemoteDirListing::Missing);

    // A name that itself contains "\nLINK\t2\t..." stays one encoded DIR field.
    let tricky = "x\nLINK\t2\tevil\tghost";
    let probe = parse_dir_probe(&format!("DIR\t2\t{}\n", hex(tricky)), 2);
    assert_eq!(
        probe.listings[1],
        RemoteDirListing::Entries(vec![RemoteEntry::Dir {
            name: tricky.to_string()
        }])
    );

    // Link targets with tabs / trailing newlines survive exactly.
    let probe = parse_dir_probe(&format!("LINK\t2\t{}\t{}\n", hex("n"), hex("/t\tx\n")), 2);
    assert_eq!(
        probe.listings[1],
        RemoteDirListing::Entries(vec![RemoteEntry::Link {
            name: "n".to_string(),
            target: "/t\tx\n".to_string()
        }])
    );

    // Extra fields, odd/invalid hex, slash or dot names, REAL off index 1,
    // relative REAL, and non-digit indexes are all rejected.
    let probe = parse_dir_probe(
        &format!(
            "DIR\t2\t{}\textra\nDIR\t2\tabc\nDIR\t2\tzz\nDIR\t2\t{}\nDIR\t2\t{}\nREAL\t2\t{}\nDIR\t+2\t{}\n",
            hex("a"),
            hex("a/b"),
            hex(".."),
            hex("/elsewhere"),
            hex("b"),
        ),
        2,
    );
    assert_eq!(probe.listings[1], RemoteDirListing::Missing);
    assert_eq!(probe.resolved_root, None);
    let probe = parse_dir_probe(&format!("REAL\t1\t{}\n", hex("relative/root")), 1);
    assert_eq!(probe.resolved_root, None);

    // Removal output must be exactly `<TAG>\t<index>`.
    use super::remote::RemoteRemoveStatus;
    assert_eq!(
        parse_remove_output("OK\t1\textra\n", 1),
        vec![RemoteRemoveStatus::Failed]
    );
}

#[test]
fn remote_scripts_keep_dangling_links_and_verify_targets() {
    use super::remote::{
        remote_script, REMOTE_DIR_PROBE_BODY, REMOTE_REMOVE_ENTRIES_BODY, REMOTE_REMOVE_LINKS_BODY,
    };
    let probe = remote_script(REMOTE_DIR_PROBE_BODY);
    assert!(probe.contains("[ -L \"$entry\" ] || [ -e \"$entry\" ] || continue"));
    assert!(!probe.contains("[ -e \"$dir\" ] || continue"));
    assert!(probe.contains("od -An -tx1 -v"));
    assert!(probe.contains("cd -P \"$dir\""));
    let links = remote_script(REMOTE_REMOVE_LINKS_BODY);
    assert!(links.contains("p=$1; want=$2; shift 2"));
    assert!(links.contains("[ \"$LT\" = \"$want\" ]"));
    assert!(links.contains("rm -f -- \"$p\""));
    assert!(!links.contains("rm -rf"));
    assert!(REMOTE_REMOVE_ENTRIES_BODY.contains("rm -rf -- \"$p\""));
}

fn fake_ssh(
    runner: Arc<crate::test_support::FakeRunner>,
) -> (ActiveTarget, Arc<crate::targets::ConnectedRemoteTarget>) {
    use crate::targets::{
        ConnectedRemoteTarget, ConnectedSshTarget, RemoteTargetConfig, SshAuthMethod,
    };
    let target = RemoteTargetConfig {
        id: "ssh-clear-all".to_string(),
        label: "SSH clear all".to_string(),
        host: "example.invalid".to_string(),
        username: "alice".to_string(),
        port: 22,
        auth_method: SshAuthMethod::Key,
        key_path: "~/.ssh/id_ed25519".to_string(),
        credential_key: None,
        protected_password: None,
        password: None,
        remote_home: "/home/alice".to_string(),
        remote_os: "linux".to_string(),
        symlink_enabled: true,
    };
    let active = ActiveTarget::Ssh(Box::new(target.clone()));
    let connection = Arc::new(ConnectedRemoteTarget::Ssh(
        ConnectedSshTarget::for_tests_with_runner(target, runner),
    ));
    (active, connection)
}

fn remote_skill(id: &str) -> db::Skill {
    let dir = format!("/home/alice/.skillsmanage/skills/{id}");
    db::Skill {
        id: id.to_string(),
        uid: format!("{id}-uid"),
        name: id.to_string(),
        description: None,
        file_path: format!("{dir}/SKILL.md"),
        canonical_path: Some(dir),
        is_central: true,
        source: Some("native".to_string()),
        content: None,
        scanned_at: Utc::now().to_rfc3339(),
        fs_created_at: None,
        fs_updated_at: None,
    }
}

#[tokio::test]
async fn fake_ssh_clear_all_deletes_remote_only() {
    use crate::test_support::FakeRunner;

    let pool = crate::test_support::mem_pool_with_home("/home/alice").await;
    db::upsert_skill(&pool, &remote_skill("alpha"))
        .await
        .unwrap();
    let local_sentinel = TempDir::new().unwrap();
    let local_file = local_sentinel.path().join("do-not-touch.txt");
    std::fs::write(&local_file, "local").unwrap();

    let agents = db::get_all_agents(&pool).await.unwrap();
    let agent_a = agents.iter().find(|agent| agent.id == AGENT_A).unwrap();
    let agent_dir =
        crate::paths::expand_remote_home_path(&agent_a.global_skills_dir, "/home/alice");
    // Agent index of AGENT_A in the probe argument list (central root is 1).
    let mut probe_dirs = vec!["/home/alice/.skillsmanage/skills".to_string()];
    let central_key = crate::paths::remote_path_comparison_key(&probe_dirs[0]);
    for agent in agents.iter().filter(|agent| agent.id != "central") {
        let dir = crate::paths::remote_path_comparison_key(&crate::paths::expand_remote_home_path(
            &agent.global_skills_dir,
            "/home/alice",
        ));
        if crate::paths::key_is_within(&central_key, &dir) || probe_dirs.contains(&dir) {
            continue;
        }
        probe_dirs.push(dir);
    }
    let agent_index = probe_dirs
        .iter()
        .position(|dir| *dir == crate::paths::remote_path_comparison_key(&agent_dir))
        .unwrap()
        + 1;
    let probe_output = format!(
        "REAL\t1\t{}\nDIR\t1\t{}\nDIR\t1\t{}\nLINK\t{agent_index}\t{}\t{}\nLINK\t{agent_index}\t{}\t{}\nDIR\t{agent_index}\t{}\n",
        hex("/home/alice/.skillsmanage/skills"),
        hex("alpha"),
        hex("stray"),
        hex("ghost"),
        hex("/home/alice/.skillsmanage/skills/ghost"),
        hex("cli"),
        hex("/home/alice/.agents/skills/cli"),
        hex("handmade"),
    );

    let runner = Arc::new(FakeRunner::new());
    let (active, connection) = fake_ssh(runner.clone());
    // Preview: one directory probe.
    runner.push_success(&probe_output);
    let preview = preview_with(
        &pool,
        &active,
        Some(connection.as_ref()),
        &RootDefaults::default(),
    )
    .await
    .unwrap();
    assert_eq!(preview.target_kind, "ssh");
    assert_eq!(preview.skill_ids, vec!["alpha".to_string()]);
    assert_eq!(preview.untracked_central_entries.len(), 1);
    assert_eq!(
        preview.untracked_central_entries[0].path,
        "/home/alice/.skillsmanage/skills/stray"
    );
    assert_eq!(preview.orphan_links.len(), 1, "{:?}", preview.orphan_links);
    assert_eq!(preview.orphan_links[0].skill_name.as_deref(), Some("ghost"));
    assert_eq!(preview.skipped_unmanaged_count, 1);
    assert_eq!(runner.calls().len(), 1);

    // Apply: probe again, delete alpha (5 journal calls), untracked, orphans.
    runner.push_success(&probe_output);
    let digest = "a".repeat(64);
    runner.push_success("");
    runner.push_success(&digest);
    runner.push_success("STAGED\n");
    runner.push_success(&digest);
    runner.push_success("FINALIZED\n");
    runner.push_success("OK\t1\n");
    runner.push_success("OK\t1\n");
    let cancel = AtomicBool::new(false);
    let sink = |_: ClearCentralProgress| {};
    let result = clear_with_for_tests(
        &pool,
        &active,
        Some(connection),
        &request_from(&preview),
        ClearJob {
            job_id: "remote-clear",
            cancel: &cancel,
            progress: &sink,
        },
        &RootDefaults::default(),
    )
    .await
    .unwrap();
    assert_eq!(
        result.skills.succeeded.len(),
        1,
        "{:?}",
        result.skills.failed
    );
    assert_eq!(result.untracked_central_entries.removed, 1);
    assert_eq!(result.orphan_links.removed, 1);
    assert!(!skill_exists(&pool, "alpha").await);

    let calls = runner.calls();
    assert_eq!(calls.len(), 1 + 1 + 5 + 2);
    let untracked_call = &calls[calls.len() - 2];
    assert!(untracked_call
        .args
        .iter()
        .any(|arg| arg.contains("/home/alice/.skillsmanage/skills/stray")));
    let orphan_call = &calls[calls.len() - 1];
    assert!(orphan_call.args.iter().any(|arg| arg.contains("ghost")));
    assert!(!orphan_call.args.iter().any(|arg| arg.contains("cli")));
    // The orphan removal carries the probed readlink value as the expected target.
    assert!(orphan_call
        .args
        .iter()
        .any(|arg| { arg.contains("/ghost' '/home/alice/.skillsmanage/skills/ghost'") }));
    assert!(local_file.exists());
}

/// 1-based probe argument index of `agent_id`'s global dir (Central root is 1).
async fn remote_agent_index(pool: &DbPool, agent_id: &str) -> usize {
    let agents = db::get_all_agents(pool).await.unwrap();
    let mut probe_dirs = vec!["/home/alice/.skillsmanage/skills".to_string()];
    let central_key = crate::paths::remote_path_comparison_key(&probe_dirs[0]);
    for agent in agents.iter().filter(|agent| agent.id != "central") {
        let dir = crate::paths::remote_path_comparison_key(&crate::paths::expand_remote_home_path(
            &agent.global_skills_dir,
            "/home/alice",
        ));
        if crate::paths::key_is_within(&central_key, &dir) || probe_dirs.contains(&dir) {
            continue;
        }
        probe_dirs.push(dir);
    }
    let agent = agents.iter().find(|agent| agent.id == agent_id).unwrap();
    let agent_dir = crate::paths::remote_path_comparison_key(
        &crate::paths::expand_remote_home_path(&agent.global_skills_dir, "/home/alice"),
    );
    probe_dirs.iter().position(|dir| *dir == agent_dir).unwrap() + 1
}

async fn remote_preview(
    pool: &DbPool,
    active: &ActiveTarget,
    connection: &crate::targets::ConnectedRemoteTarget,
) -> ClearCentralPreview {
    preview_with(pool, active, Some(connection), &RootDefaults::default())
        .await
        .unwrap()
}

async fn remote_apply(
    pool: &DbPool,
    active: &ActiveTarget,
    connection: Arc<crate::targets::ConnectedRemoteTarget>,
    request: &ClearCentralRequest,
) -> ClearCentralResult {
    let cancel = AtomicBool::new(false);
    let sink = |_: ClearCentralProgress| {};
    clear_with_for_tests(
        pool,
        active,
        Some(connection),
        request,
        ClearJob {
            job_id: "remote-clear",
            cancel: &cancel,
            progress: &sink,
        },
        &RootDefaults::default(),
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn fake_ssh_tracked_dir_through_symlinked_root_is_not_untracked() {
    use crate::test_support::FakeRunner;
    // The configured root `/home/alice/.skillsmanage/skills` is a symlink to
    // `/data/central`; the DB row stores the physical spelling. The probe's
    // REAL record lets the listing entry `alpha` match the tracked dir.
    let pool = crate::test_support::mem_pool_with_home("/home/alice").await;
    let mut skill = remote_skill("alpha");
    skill.canonical_path = Some("/data/central/alpha".to_string());
    skill.file_path = "/data/central/alpha/SKILL.md".to_string();
    db::upsert_skill(&pool, &skill).await.unwrap();

    let probe_output = format!(
        "REAL\t1\t{}\nDIR\t1\t{}\nDIR\t1\t{}\n",
        hex("/data/central"),
        hex("alpha"),
        hex("stray"),
    );
    let runner = Arc::new(FakeRunner::new());
    let (active, connection) = fake_ssh(runner.clone());
    runner.push_success(&probe_output);
    let preview = remote_preview(&pool, &active, &connection).await;
    let untracked = preview
        .untracked_central_entries
        .iter()
        .map(|item| item.path.as_str())
        .collect::<Vec<_>>();
    assert_eq!(untracked, vec!["/home/alice/.skillsmanage/skills/stray"]);
    assert_eq!(preview.untracked_central_entry_count, 1);
}

#[tokio::test]
async fn fake_ssh_unresolved_root_offers_and_deletes_no_untracked() {
    use crate::test_support::FakeRunner;
    let pool = crate::test_support::mem_pool_with_home("/home/alice").await;

    // Preview with an unresolvable root: nothing is offered as untracked.
    let runner = Arc::new(FakeRunner::new());
    let (active, connection) = fake_ssh(runner.clone());
    let unresolved = format!("UNRESOLVED\t1\nDIR\t1\t{}\n", hex("stray"));
    runner.push_success(&unresolved);
    let preview = remote_preview(&pool, &active, &connection).await;
    assert!(preview.untracked_central_entries.is_empty());
    assert_eq!(preview.untracked_central_entry_count, 0);

    // Even a request carrying the stray key (from an earlier, resolvable
    // preview) deletes nothing when the locked rescan cannot resolve the root.
    runner.push_success(&format!(
        "REAL\t1\t{}\nDIR\t1\t{}\n",
        hex("/home/alice/.skillsmanage/skills"),
        hex("stray")
    ));
    let resolved_preview = remote_preview(&pool, &active, &connection).await;
    assert_eq!(resolved_preview.untracked_central_entries.len(), 1);
    runner.push_success(&unresolved);
    let before = runner.calls().len();
    let result = remote_apply(&pool, &active, connection, &request_from(&resolved_preview)).await;
    assert_eq!(result.untracked_central_entries.removed, 0);
    assert_eq!(result.skipped_changed, 1);
    let calls = runner.calls();
    assert_eq!(calls.len(), before + 1, "only the rescan probe runs");
    assert!(!calls[before..]
        .iter()
        .flat_map(|call| call.args.iter())
        .any(|arg| arg.contains("rm -rf") || arg.contains("/stray'")));
}

#[tokio::test]
async fn fake_ssh_link_retargeted_after_probe_is_skipped() {
    use crate::test_support::FakeRunner;
    let pool = crate::test_support::mem_pool_with_home("/home/alice").await;
    let agent_index = remote_agent_index(&pool, AGENT_A).await;
    let ghost_target = "/home/alice/.skillsmanage/skills/ghost";
    let probe_output = format!(
        "REAL\t1\t{}\nLINK\t{agent_index}\t{}\t{}\n",
        hex("/home/alice/.skillsmanage/skills"),
        hex("ghost"),
        hex(ghost_target),
    );
    let runner = Arc::new(FakeRunner::new());
    let (active, connection) = fake_ssh(runner.clone());
    runner.push_success(&probe_output);
    let preview = remote_preview(&pool, &active, &connection).await;
    assert_eq!(preview.orphan_links.len(), 1);

    // Locked rescan still sees the old target; the link is retargeted before
    // the removal script runs, so the script's readlink check reports SKIP.
    runner.push_success(&probe_output);
    runner.push_success("SKIP\t1\n");
    let result = remote_apply(&pool, &active, connection, &request_from(&preview)).await;
    assert_eq!(result.orphan_links.removed, 0);
    assert!(result.orphan_links.failed.is_empty());
    assert_eq!(result.skipped_changed, 1);

    let calls = runner.calls();
    let remove_call = calls.last().unwrap();
    assert!(remove_call
        .args
        .iter()
        .any(|arg| arg.contains(&format!("/ghost' '{ghost_target}'"))));
    assert!(remove_call
        .stdin
        .as_deref()
        .is_some_and(|stdin| String::from_utf8_lossy(stdin).contains("[ \"$LT\" = \"$want\" ]")));
}

// ─── Tracked-dir identity / shared path guard ────────────────────────────────

#[tokio::test]
async fn tracked_skill_dir_reached_through_linked_root_is_not_untracked() {
    // The configured Central root is a link to the real directory, while the
    // DB row stores the real path. The tracked skill dir must never be listed
    // (or removed without the journal) as an untracked Central entry.
    let fx = Fixture::new().await;
    let skill_dir = fx.seed_skill("alpha").await;
    let linked_root = fx.temp.path().join("central-link");
    make_dir_link(&fx.central, &linked_root);
    crate::test_support::set_agent_dir(&fx.pool, "central", &linked_root).await;

    let preview = fx.preview().await;
    assert_eq!(preview.skill_ids, vec!["alpha".to_string()]);
    assert!(
        preview.untracked_central_entries.is_empty(),
        "{:?}",
        preview.untracked_central_entries
    );

    let request = ClearCentralRequest {
        untracked_entry_keys: vec![CLEAR_ALL_WILDCARD_KEY.to_string()],
        ..Default::default()
    };
    let result = fx.apply(&request).await;
    assert_eq!(result.untracked_central_entries.removed, 0);
    assert!(skill_dir.join("SKILL.md").exists());
    assert!(skill_exists(&fx.pool, "alpha").await);
}

#[test]
fn ensure_child_path_keeps_outside_and_root_refusals() {
    use super::super::delete::ensure_child_path;
    use super::super::error::CentralSkillsError;

    let temp = TempDir::new().unwrap();
    let root = temp.path().join("central");
    let outside = temp.path().join("outside");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&outside).unwrap();

    // A child slot that is a link pointing outside the root is followed and refused.
    let escaping_link = root.join("escape");
    make_dir_link(&outside, &escaping_link);
    assert!(matches!(
        ensure_child_path(&root, &escaping_link, "escape"),
        Err(CentralSkillsError::OutsideCentralRoot { .. })
    ));
    // `..` segments that leave the root are refused (existing and missing leaf).
    assert!(matches!(
        ensure_child_path(&root, &root.join("..").join("outside"), "dotdot"),
        Err(CentralSkillsError::OutsideCentralRoot { .. })
    ));
    assert!(matches!(
        ensure_child_path(
            &root,
            &root.join("..").join("outside").join("gone"),
            "dotdot"
        ),
        Err(CentralSkillsError::OutsideCentralRoot { .. })
    ));
    // The root itself is refused, also when it is missing.
    assert!(matches!(
        ensure_child_path(&root, &root, "root"),
        Err(CentralSkillsError::CentralRootDeleteRefused(_))
    ));
    let missing_root = temp.path().join("missing-root");
    assert!(matches!(
        ensure_child_path(&missing_root, &missing_root, "root"),
        Err(CentralSkillsError::CentralRootDeleteRefused(_))
    ));
    // Missing children below an existing or missing root stay inside.
    assert!(ensure_child_path(&root, &root.join("gone"), "gone").is_ok());
    assert!(ensure_child_path(&missing_root, &missing_root.join("gone"), "gone").is_ok());
}
