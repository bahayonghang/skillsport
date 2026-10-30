//! Project and agent install/uninstall mutation contracts for `cli_api`.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value;

use super::{CliApiError, CliContext, ProjectInstallRequest};
use crate::db::DbPool;
use crate::services::installation::{self, InstallTransport};
use crate::test_support;

const AGENT: &str = "claude-code";

fn context(pool: DbPool) -> CliContext {
    CliContext::new(pool, Arc::new(crate::secrets::MockSecretStore::default()))
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}

async fn count(pool: &DbPool, table: &str) -> i64 {
    sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Row counts for every table a project/agent install mutation can touch.
async fn snapshot(pool: &DbPool) -> Vec<i64> {
    let mut counts = Vec::new();
    for table in [
        "projects",
        "project_skill_installations",
        "skill_installations",
        "agent_skill_observations",
        "skills",
        "operation_logs",
    ] {
        counts.push(count(pool, table).await);
    }
    counts
}

/// Every path under `root`, relative and sorted. Symlinks are listed, not followed.
fn tree(root: &Path) -> BTreeSet<PathBuf> {
    fn walk(root: &Path, dir: &Path, out: &mut BTreeSet<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            out.insert(path.strip_prefix(root).unwrap().to_path_buf());
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                walk(root, &path, out);
            }
        }
    }
    let mut out = BTreeSet::new();
    walk(root, root, &mut out);
    out
}

async fn last_log(pool: &DbPool) -> (String, String, String, Value) {
    let (category, action, status, details): (String, String, String, String) = sqlx::query_as(
        "SELECT category, action, status, details_json FROM operation_logs ORDER BY rowid DESC LIMIT 1",
    )
    .fetch_one(pool)
    .await
    .unwrap();
    (
        category,
        action,
        status,
        serde_json::from_str(&details).unwrap(),
    )
}

fn assert_confirmation_required(error: CliApiError, expected_plans: usize) {
    assert_eq!(error.code(), "input.confirmation_required");
    assert_eq!(error.exit_code(), 2);
    assert_eq!(
        error.details()["plans"].as_array().unwrap().len(),
        expected_plans
    );
}

struct Fixture {
    pool: DbPool,
    temp: tempfile::TempDir,
}

impl Fixture {
    fn project_dir(&self) -> PathBuf {
        self.temp.path().join("workspace")
    }

    fn agent_dir(&self) -> PathBuf {
        self.temp.path().join("agent-skills")
    }
}

/// Central skills `alpha` and `beta` under a temp Central root, a temp global
/// directory for `claude-code`, and an empty project directory.
async fn fixture() -> Fixture {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    let central = temp.path().join("central");
    test_support::set_agent_dir(&pool, "central", &central).await;
    let fixture = Fixture { pool, temp };
    test_support::set_agent_dir(&fixture.pool, AGENT, &fixture.agent_dir()).await;
    std::fs::create_dir_all(fixture.agent_dir()).unwrap();
    std::fs::create_dir_all(fixture.project_dir()).unwrap();
    for id in ["alpha", "beta"] {
        test_support::seed_central_skill(&fixture.pool, &central.join(id), id, id).await;
    }
    fixture
}

fn install_request<'a>(
    project: &'a str,
    skills: &'a [String],
    agent: &'a str,
    cwd: &'a Path,
    dry_run: bool,
    yes: bool,
) -> ProjectInstallRequest<'a> {
    ProjectInstallRequest {
        project_ref: project,
        skill_refs: skills,
        agent_id: agent,
        method: "copy",
        cwd,
        dry_run,
        yes,
    }
}

#[tokio::test]
async fn projects_add_dry_run_writes_nothing_then_adds_idempotently() {
    let fx = fixture().await;
    let cli = context(fx.pool.clone());
    let cwd = fx.project_dir();
    let before = snapshot(&fx.pool).await;

    let preview = cli.add_project(None, &cwd, true).await.unwrap();
    assert!(preview.dry_run && preview.result.is_none());
    assert!(!preview.plans[0].exists);
    assert_eq!(preview.plans[0].name, "workspace");
    assert_eq!(snapshot(&fx.pool).await, before);

    let added = cli.add_project(Some("."), &cwd, false).await.unwrap();
    let result = added.result.unwrap();
    assert!(result.created);
    assert_eq!(result.project.id, preview.plans[0].id);
    assert_eq!(result.skill_count, Some(0));
    assert_eq!(count(&fx.pool, "projects").await, 1);
    let (category, action, status, details) = last_log(&fx.pool).await;
    assert_eq!(
        (category.as_str(), action.as_str(), status.as_str()),
        ("project", "add_project", "succeeded")
    );
    assert_eq!(details["source"], "cli");
    assert_eq!(details["created"], true);

    // A relative path resolves against cwd; the same project is returned.
    let parent = fx.temp.path();
    let again = cli
        .add_project(Some("workspace"), parent, false)
        .await
        .unwrap();
    assert!(again.plans[0].exists);
    assert!(!again.result.unwrap().created);
    assert_eq!(count(&fx.pool, "projects").await, 1);

    let missing = cli
        .add_project(Some("does-not-exist"), parent, false)
        .await
        .unwrap_err();
    assert_eq!(missing.code(), "path.invalid");
    assert_eq!(missing.exit_code(), 2);
}

#[tokio::test]
async fn projects_install_dry_run_and_confirmation_have_no_side_effects() {
    let fx = fixture().await;
    let cli = context(fx.pool.clone());
    let cwd = fx.project_dir();
    cli.add_project(None, &cwd, false).await.unwrap();
    let both = strings(&["alpha", "beta"]);
    let before = snapshot(&fx.pool).await;
    let before_tree = tree(&cwd);

    let preview = cli
        .install_to_project(install_request(".", &both, AGENT, &cwd, true, false))
        .await
        .unwrap();
    assert!(preview.dry_run && preview.result.is_none());
    assert_eq!(preview.plans.len(), 2);
    assert!(preview
        .plans
        .iter()
        .all(|plan| plan.action == "install" && plan.method == Some("copy")));
    assert!(Path::new(&preview.plans[0].target_path).ends_with("alpha"));
    assert_eq!(snapshot(&fx.pool).await, before);
    assert_eq!(tree(&cwd), before_tree);

    // Multi-target install without --yes is refused with the plans attached.
    let error = cli
        .install_to_project(install_request(".", &both, AGENT, &cwd, false, false))
        .await
        .unwrap_err();
    assert_confirmation_required(error, 2);
    assert_eq!(snapshot(&fx.pool).await, before);
    assert_eq!(tree(&cwd), before_tree);

    // A single new install proceeds without --yes.
    let single = strings(&["alpha"]);
    let installed = cli
        .install_to_project(install_request(".", &single, AGENT, &cwd, false, false))
        .await
        .unwrap();
    let result = installed.result.unwrap();
    assert_eq!(result.succeeded.len(), 1);
    assert!(!result.has_failures());
    assert!(Path::new(&result.succeeded[0].installed_path)
        .join("SKILL.md")
        .is_file());
    assert_eq!(count(&fx.pool, "project_skill_installations").await, 1);
    let (category, action, status, details) = last_log(&fx.pool).await;
    assert_eq!(
        (category.as_str(), action.as_str(), status.as_str()),
        ("project", "install_skill_to_project", "succeeded")
    );
    assert_eq!(details["source"], "cli");
    assert_eq!(details["phase"], "filesystem");
    assert_eq!(details["succeededCount"], 1);

    // Replacing an existing install needs --yes even for one skill.
    let replace = cli
        .install_to_project(install_request(".", &single, AGENT, &cwd, false, false))
        .await
        .unwrap_err();
    assert_confirmation_required(replace, 1);

    let projects = cli.list_project_skills(".", &cwd).await.unwrap();
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].skill_id, "alpha");
}

#[tokio::test]
async fn projects_install_rejects_central_unknown_and_disabled_agents() {
    let fx = fixture().await;
    let cli = context(fx.pool.clone());
    let cwd = fx.project_dir();
    cli.add_project(None, &cwd, false).await.unwrap();
    let single = strings(&["alpha"]);
    let before = snapshot(&fx.pool).await;

    let central = cli
        .install_to_project(install_request(".", &single, "central", &cwd, false, true))
        .await
        .unwrap_err();
    assert_eq!(central.code(), "input.invalid");

    let unknown = cli
        .install_to_project(install_request(".", &single, "nope", &cwd, false, true))
        .await
        .unwrap_err();
    assert_eq!(unknown.code(), "agent.not_found");
    assert_eq!(unknown.exit_code(), 3);

    sqlx::query("UPDATE agents SET is_enabled = 0 WHERE id = ?")
        .bind(AGENT)
        .execute(&fx.pool)
        .await
        .unwrap();
    let disabled = cli
        .install_to_project(install_request(".", &single, AGENT, &cwd, false, true))
        .await
        .unwrap_err();
    assert_eq!(disabled.code(), "input.invalid");

    let missing_project = cli
        .install_to_project(install_request(
            "missing-project",
            &single,
            AGENT,
            &cwd,
            false,
            true,
        ))
        .await
        .unwrap_err();
    assert_eq!(missing_project.code(), "project.not_found");

    let mut bad_method = install_request(".", &single, AGENT, &cwd, false, true);
    bad_method.method = "hardlink";
    assert_eq!(
        cli.install_to_project(bad_method).await.unwrap_err().code(),
        "input.invalid"
    );
    assert_eq!(snapshot(&fx.pool).await, before);
}

#[tokio::test]
async fn projects_uninstall_always_requires_yes_and_skips_missing_installs() {
    let fx = fixture().await;
    let cli = context(fx.pool.clone());
    let cwd = fx.project_dir();
    cli.add_project(None, &cwd, false).await.unwrap();
    cli.install_to_project(install_request(
        ".",
        &strings(&["alpha"]),
        AGENT,
        &cwd,
        false,
        false,
    ))
    .await
    .unwrap();
    let both = strings(&["alpha", "beta"]);
    let before = snapshot(&fx.pool).await;
    let before_tree = tree(&cwd);

    let preview = cli
        .uninstall_from_project(".", &both, AGENT, &cwd, true, false)
        .await
        .unwrap();
    assert!(preview.dry_run);
    assert!(preview.plans[0].already_installed);
    assert!(!preview.plans[1].already_installed);
    assert!(preview.plans.iter().all(|plan| plan.action == "uninstall"));
    assert_eq!(snapshot(&fx.pool).await, before);
    assert_eq!(tree(&cwd), before_tree);

    // Uninstall is destructive: even one skill needs --yes.
    let error = cli
        .uninstall_from_project(".", &strings(&["alpha"]), AGENT, &cwd, false, false)
        .await
        .unwrap_err();
    assert_confirmation_required(error, 1);
    assert_eq!(snapshot(&fx.pool).await, before);
    assert_eq!(tree(&cwd), before_tree);

    let removed = cli
        .uninstall_from_project(".", &both, AGENT, &cwd, false, true)
        .await
        .unwrap();
    let result = removed.result.unwrap();
    assert_eq!(result.succeeded.len(), 1);
    assert_eq!(result.skipped, ["beta"]);
    assert!(!result.has_failures());
    assert!(!Path::new(&removed.plans[0].target_path).exists());
    assert_eq!(count(&fx.pool, "project_skill_installations").await, 0);
    let (category, action, status, details) = last_log(&fx.pool).await;
    assert_eq!(
        (category.as_str(), action.as_str(), status.as_str()),
        ("project", "uninstall_skill_from_project", "succeeded")
    );
    assert_eq!(details["skippedCount"], 1);
}

#[tokio::test]
async fn skills_unlink_always_requires_yes_and_dry_run_is_side_effect_free() {
    let fx = fixture().await;
    installation::install_skill(&fx.pool, &InstallTransport::Local, "alpha", AGENT, "copy")
        .await
        .unwrap();
    let installed_dir = fx.agent_dir().join("alpha");
    assert!(installed_dir.join("SKILL.md").is_file());
    let cli = context(fx.pool.clone());
    let both = strings(&["alpha", "beta"]);
    let before = snapshot(&fx.pool).await;
    let before_tree = tree(&fx.agent_dir());

    let preview = cli.unlink_skills(&both, AGENT, true, false).await.unwrap();
    assert!(preview.dry_run && preview.result.is_none());
    assert!(preview.plans[0].installed);
    assert_eq!(preview.plans[0].link_type.as_deref(), Some("copy"));
    assert!(!preview.plans[1].installed);
    assert_eq!(snapshot(&fx.pool).await, before);
    assert_eq!(tree(&fx.agent_dir()), before_tree);

    let error = cli
        .unlink_skills(&strings(&["alpha"]), AGENT, false, false)
        .await
        .unwrap_err();
    assert_confirmation_required(error, 1);
    assert_eq!(snapshot(&fx.pool).await, before);
    assert_eq!(tree(&fx.agent_dir()), before_tree);

    let central = cli
        .unlink_skills(&strings(&["alpha"]), "central", false, true)
        .await
        .unwrap_err();
    assert_eq!(central.code(), "input.invalid");
    let unknown = cli
        .unlink_skills(&strings(&["alpha"]), "nope", false, true)
        .await
        .unwrap_err();
    assert_eq!(unknown.code(), "agent.not_found");
    let missing = cli
        .unlink_skills(&strings(&["missing"]), AGENT, false, true)
        .await
        .unwrap_err();
    assert_eq!(missing.code(), "skill.not_found");
    assert_eq!(snapshot(&fx.pool).await, before);

    let removed = cli.unlink_skills(&both, AGENT, false, true).await.unwrap();
    let result = removed.result.unwrap();
    assert_eq!(result.succeeded, ["alpha"]);
    assert_eq!(result.skipped, ["beta"]);
    assert!(!result.has_failures());
    assert!(!installed_dir.exists());
    let remaining: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM skill_installations WHERE skill_id = 'alpha' AND agent_id = ?",
    )
    .bind(AGENT)
    .fetch_one(&fx.pool)
    .await
    .unwrap();
    assert_eq!(remaining, 0);
    // Central copy is untouched.
    assert!(fx.temp.path().join("central/alpha/SKILL.md").is_file());
    let (category, action, status, details) = last_log(&fx.pool).await;
    assert_eq!(
        (category.as_str(), action.as_str(), status.as_str()),
        ("install", "batch_uninstall_skills_from_agent", "succeeded")
    );
    assert_eq!(details["source"], "cli");
    assert_eq!(details["phase"], "filesystem");
}
