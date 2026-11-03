use std::path::Path;
use std::sync::Arc;

use super::{CliApiError, CliContext};
use crate::db::{self, DbPool, Project, ProjectSkillInstallation, SkillInstallation};
use crate::secrets::{SecretError, SecretStorageState, SecretStore};
use crate::test_support;

struct DenySecretStore;

impl SecretStore for DenySecretStore {
    fn get(&self, _key: &str) -> Result<Option<String>, SecretError> {
        panic!("CLI read path unexpectedly read a secret")
    }

    fn set(&self, _key: &str, _value: &str) -> Result<SecretStorageState, SecretError> {
        panic!("CLI read path unexpectedly wrote a secret")
    }

    fn delete(&self, _key: &str) -> Result<(), SecretError> {
        panic!("CLI read path unexpectedly deleted a secret")
    }

    fn state(&self, _key: &str) -> Result<SecretStorageState, SecretError> {
        panic!("CLI read path unexpectedly inspected a secret")
    }
}

fn context(pool: DbPool) -> CliContext {
    CliContext::new(pool, Arc::new(DenySecretStore))
}

fn assert_keys(value: &serde_json::Value, expected: &[&str]) {
    let mut keys = value
        .as_object()
        .expect("json object")
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    keys.sort();
    let mut expected = expected
        .iter()
        .map(|key| (*key).to_string())
        .collect::<Vec<_>>();
    expected.sort();
    assert_eq!(keys, expected);
}

fn assert_cli_error(error: CliApiError, code: &str, message: &str) {
    assert_eq!(error.code(), code);
    assert_eq!(error.exit_code(), 3);
    assert_eq!(error.to_string(), message);
}

async fn operation_log_count(pool: &DbPool) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM operation_logs")
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn insert_project(pool: &DbPool, id: &str, path: &Path, name: &str, pinned: bool) -> String {
    std::fs::create_dir_all(path).unwrap();
    let normalized = crate::services::projects::normalize_project_path(&path.to_string_lossy());
    db::repos::projects_repo::insert_project(
        pool,
        &Project {
            id: id.to_string(),
            path: normalized.clone(),
            name: name.to_string(),
            pinned,
            added_at: "2026-01-01T00:00:00Z".to_string(),
            last_scanned_at: Some("2026-01-02T00:00:00Z".to_string()),
        },
    )
    .await
    .unwrap();
    normalized
}

async fn insert_project_skill(
    pool: &DbPool,
    project_id: &str,
    skill_id: &str,
    name: &str,
    agent_id: &str,
) {
    db::repos::projects_repo::upsert_project_skill_installation(
        pool,
        &ProjectSkillInstallation {
            project_id: project_id.to_string(),
            skill_id: skill_id.to_string(),
            name: name.to_string(),
            description: Some("project skill".to_string()),
            file_path: format!("/skills/{skill_id}/SKILL.md"),
            source_origin: "central".to_string(),
            agent_id: agent_id.to_string(),
            installed_path: format!("/installed/{agent_id}/{skill_id}"),
            link_type: "symlink".to_string(),
            symlink_target: Some("secret-target-should-not-leak".to_string()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        },
    )
    .await
    .unwrap();
}

async fn install_on_agent(pool: &DbPool, skill_id: &str, agent_id: &str) {
    db::upsert_skill_installation(
        pool,
        &SkillInstallation {
            skill_id: skill_id.to_string(),
            agent_id: agent_id.to_string(),
            installed_path: format!("/agents/{agent_id}/{skill_id}"),
            link_type: "copy".to_string(),
            symlink_target: None,
            created_at: "2026-01-01T00:00:00Z".to_string(),
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn agents_list_excludes_central_and_resolves_global_dir() {
    let pool = test_support::mem_pool().await;
    sqlx::query(
        "INSERT INTO agents
         (id, display_name, category, global_skills_dir, project_skills_dir,
          icon_name, is_detected, is_builtin, is_enabled)
         VALUES ('central-alias', 'Central Alias', 'central', 'C:/central-alias', NULL, NULL, 0, 0, 1)",
    )
    .execute(&pool)
    .await
    .unwrap();
    let stored = db::repos::agents_repo::get_all_agents(&pool).await.unwrap();
    let specs = stored
        .iter()
        .map(|agent| crate::paths::PlatformPathSpec {
            agent_id: agent.id.as_str(),
            global_skills_dir: agent.global_skills_dir.as_str(),
            project_skills_dir: agent.project_skills_dir.as_deref(),
        })
        .collect::<Vec<_>>();
    let expected_dir = crate::paths::path_to_string(
        &crate::paths::platform_global_skills_dir("codex", &specs).unwrap(),
    );

    let listed = context(pool).list_agents().await.unwrap();
    assert!(listed.iter().all(|agent| agent.id != "central"));
    assert!(listed.iter().all(|agent| agent.id != "central-alias"));
    assert_eq!(
        listed.len(),
        stored
            .iter()
            .filter(|agent| agent.id != "central" && agent.category != "central")
            .count()
    );
    let codex = listed.iter().find(|agent| agent.id == "codex").unwrap();
    assert_eq!(codex.display_name, "Codex CLI");
    assert!(codex.enabled);
    assert_eq!(codex.global_skills_dir, expected_dir);
    let easyclaw = listed.iter().find(|agent| agent.id == "easyclaw").unwrap();
    assert!(!easyclaw.enabled);
    assert_keys(
        &serde_json::to_value(codex).unwrap(),
        &["id", "displayName", "enabled", "globalSkillsDir"],
    );
}

#[tokio::test]
async fn projects_list_keeps_only_identity_fields() {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    let dir = temp.path().join("demo");
    let normalized = insert_project(&pool, "proj-demo", &dir, "Demo", true).await;
    let listed = context(pool).list_projects().await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "proj-demo");
    assert_eq!(listed[0].name, "Demo");
    assert_eq!(listed[0].path, normalized);
    assert!(listed[0].pinned);
    let value = serde_json::to_value(&listed[0]).unwrap();
    assert_keys(&value, &["id", "name", "path", "pinned"]);
    assert!(value.get("skillCount").is_none());
    assert!(value.get("addedAt").is_none());
    assert!(value.get("lastScannedAt").is_none());
}

#[tokio::test]
async fn project_skills_report_not_found_and_ambiguous_names() {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    insert_project(&pool, "left", &temp.path().join("left"), "Twin", false).await;
    insert_project(&pool, "right", &temp.path().join("right"), "Twin", false).await;
    let cli = context(pool);
    let missing = cli
        .list_project_skills("missing", temp.path())
        .await
        .unwrap_err();
    assert_cli_error(missing, "project.not_found", "Project 'missing' not found");
    let ambiguous = cli
        .list_project_skills("Twin", temp.path())
        .await
        .unwrap_err();
    assert_cli_error(
        ambiguous,
        "project.ambiguous",
        "Multiple projects are named 'Twin'",
    );
}

#[tokio::test]
async fn project_dot_uses_the_supplied_cwd_and_id_wins() {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    let here = temp.path().join("here");
    let elsewhere = temp.path().join("elsewhere");
    let other = temp.path().join("other");
    std::fs::create_dir_all(&elsewhere).unwrap();
    let normalized = insert_project(&pool, "shared", &here, "Alpha", false).await;
    insert_project_skill(&pool, "shared", "from-id", "from-id", "codex").await;
    insert_project(&pool, "other", &other, "shared", false).await;
    insert_project_skill(&pool, "other", "from-name", "from-name", "codex").await;
    let cli = context(pool);

    let by_dot = cli.list_project_skills(".", &here).await.unwrap();
    assert_eq!(by_dot.len(), 1);
    assert_eq!(by_dot[0].name, "from-id");
    assert_eq!(by_dot[0].skill_id, "from-id");
    assert_eq!(by_dot[0].agent_id, "codex");
    assert_eq!(by_dot[0].agent_display_name, "Codex CLI");
    assert_eq!(by_dot[0].link_type, "symlink");
    assert_eq!(
        by_dot[0].installed_path,
        "/installed/codex/from-id".to_string()
    );
    assert_eq!(by_dot[0].description.as_deref(), Some("project skill"));
    let dot_json = serde_json::to_value(&by_dot[0]).unwrap();
    assert_keys(
        &dot_json,
        &[
            "skillId",
            "name",
            "description",
            "agentId",
            "agentDisplayName",
            "installedPath",
            "linkType",
        ],
    );
    assert!(!dot_json
        .to_string()
        .contains("secret-target-should-not-leak"));

    let wrong_cwd = cli.list_project_skills(".", &elsewhere).await.unwrap_err();
    assert_cli_error(wrong_cwd, "project.not_found", "Project '.' not found");

    let by_id = cli.list_project_skills("shared", &elsewhere).await.unwrap();
    assert_eq!(by_id[0].name, "from-id");

    let mut with_slash = normalized.clone();
    with_slash.push('/');
    let by_path = cli
        .list_project_skills(&with_slash, &elsewhere)
        .await
        .unwrap();
    assert_eq!(by_path[0].name, "from-id");
}

#[tokio::test]
async fn tags_list_includes_group_or_null() {
    let pool = test_support::mem_pool().await;
    let group = db::create_tag_group(
        &pool,
        db::NewTagGroup {
            name: "Writing",
            color: Some("#112233"),
        },
    )
    .await
    .unwrap();
    let tag = db::create_skill_tag(&pool, "CLI Topic", Some("topic desc"), Some("#abcdef"))
        .await
        .unwrap();
    db::set_tag_group(&pool, &tag.id, Some(&group.id))
        .await
        .unwrap();
    let listed = context(pool).list_tags().await.unwrap();
    let topic = listed.iter().find(|item| item.id == tag.id).unwrap();
    assert_eq!(topic.name, "CLI Topic");
    assert_eq!(topic.description.as_deref(), Some("topic desc"));
    assert_eq!(topic.color.as_deref(), Some("#abcdef"));
    let topic_group = topic.group.as_ref().unwrap();
    assert_eq!(topic_group.id, group.id);
    assert_eq!(topic_group.name, "Writing");
    assert_keys(
        &serde_json::to_value(topic).unwrap(),
        &["id", "name", "description", "color", "group"],
    );
    assert_keys(&serde_json::to_value(topic_group).unwrap(), &["id", "name"]);
    let uncategorized = listed
        .iter()
        .find(|item| item.id == "uncategorized")
        .unwrap();
    assert!(uncategorized.group.is_none());
}

#[tokio::test]
async fn tag_filters_are_conjunctive() {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    test_support::seed_central_skill(&pool, &temp.path().join("kept"), "kept", "Kept").await;
    test_support::seed_central_skill(&pool, &temp.path().join("partial"), "partial", "Partial")
        .await;
    let alpha = db::create_skill_tag(&pool, "Alpha", None, None)
        .await
        .unwrap();
    let beta = db::create_skill_tag(&pool, "Beta", None, None)
        .await
        .unwrap();
    db::assign_skill_tags(
        &pool,
        &["kept".to_string(), "partial".to_string()],
        std::slice::from_ref(&alpha.id),
        "manual",
        None,
        None,
    )
    .await
    .unwrap();
    db::assign_skill_tags(
        &pool,
        &["kept".to_string()],
        std::slice::from_ref(&beta.id),
        "ai",
        None,
        None,
    )
    .await
    .unwrap();
    let cli = context(pool);
    let unfiltered = cli.list_skills().await.unwrap();
    let same = cli.list_skills_filtered(&[], None, None).await.unwrap();
    assert_eq!(unfiltered.len(), 2);
    assert_eq!(
        unfiltered
            .iter()
            .map(|skill| skill.id.clone())
            .collect::<Vec<_>>(),
        same.iter()
            .map(|skill| skill.id.clone())
            .collect::<Vec<_>>()
    );
    let both = cli
        .list_skills_filtered(&[alpha.id.clone(), beta.name.clone()], None, None)
        .await
        .unwrap();
    assert_eq!(both.len(), 1);
    assert_eq!(both[0].id, "kept");
    assert_keys(
        &serde_json::to_value(&both[0]).unwrap(),
        &[
            "uid",
            "id",
            "name",
            "description",
            "canonicalPath",
            "linkedAgents",
        ],
    );
    let alpha_only = cli
        .list_skills_filtered(&[alpha.name], None, None)
        .await
        .unwrap();
    assert_eq!(alpha_only.len(), 2);
}

#[tokio::test]
async fn unknown_tag_and_agent_are_errors_and_source_filter_is_exact() {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    test_support::seed_central_skill(&pool, &temp.path().join("kept"), "kept", "Kept").await;
    test_support::seed_central_skill(&pool, &temp.path().join("other"), "other", "Other").await;
    sqlx::query("UPDATE skills SET source = ? WHERE id = ?")
        .bind("github:acme/demo")
        .bind("kept")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE skills SET source = ? WHERE id = ?")
        .bind("local")
        .bind("other")
        .execute(&pool)
        .await
        .unwrap();
    install_on_agent(&pool, "kept", "codex").await;
    let cli = context(pool);

    let missing_tag = cli
        .list_skills_filtered(&["missing-tag".to_string()], None, None)
        .await
        .unwrap_err();
    assert_cli_error(missing_tag, "tag.not_found", "Tag 'missing-tag' not found");

    let missing_agent = cli
        .list_skills_filtered(&[], Some("not-an-agent"), None)
        .await
        .unwrap_err();
    assert_cli_error(
        missing_agent,
        "agent.not_found",
        "Agent 'not-an-agent' not found",
    );

    let by_agent = cli
        .list_skills_filtered(&[], Some("codex"), None)
        .await
        .unwrap();
    assert_eq!(by_agent.len(), 1);
    assert_eq!(by_agent[0].id, "kept");
    let other_agent = cli
        .list_skills_filtered(&[], Some("claude-code"), None)
        .await
        .unwrap();
    assert!(other_agent.is_empty());

    let by_source = cli
        .list_skills_filtered(&[], None, Some("github:acme/demo"))
        .await
        .unwrap();
    assert_eq!(by_source.len(), 1);
    assert_eq!(by_source[0].id, "kept");
    let wrong_case = cli
        .list_skills_filtered(&[], None, Some("Github:acme/demo"))
        .await
        .unwrap();
    assert!(wrong_case.is_empty());
    let unknown_source = cli
        .list_skills_filtered(&[], None, Some("missing-source"))
        .await
        .unwrap();
    assert!(unknown_source.is_empty());
}

#[tokio::test]
async fn show_adds_tags_projects_and_lang_explanation() {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    test_support::seed_central_skill(&pool, &temp.path().join("demo"), "demo", "Demo description")
        .await;
    install_on_agent(&pool, "demo", "codex").await;
    let alpha = db::create_skill_tag(&pool, "Alpha", None, None)
        .await
        .unwrap();
    let beta = db::create_skill_tag(&pool, "Beta", None, None)
        .await
        .unwrap();
    db::assign_skill_tags(
        &pool,
        &["demo".to_string()],
        std::slice::from_ref(&alpha.id),
        "manual",
        None,
        None,
    )
    .await
    .unwrap();
    db::assign_skill_tags(
        &pool,
        &["demo".to_string()],
        std::slice::from_ref(&beta.id),
        "ai",
        None,
        None,
    )
    .await
    .unwrap();
    let project_dir = temp.path().join("project");
    insert_project(&pool, "proj-demo", &project_dir, "Demo Project", false).await;
    insert_project_skill(&pool, "proj-demo", "demo", "Demo", "codex").await;
    for (lang, text, model) in [
        ("en", "Hello", None),
        ("zh", "你好", Some("model-zh")),
        ("xx", "   ", Some("ignored")),
    ] {
        sqlx::query(
            "INSERT INTO skill_explanations
             (skill_id, explanation, lang, model, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind("demo")
        .bind(text)
        .bind(lang)
        .bind(model)
        .bind("2026-01-01T00:00:00Z")
        .bind("2026-01-01T00:00:00Z")
        .execute(&pool)
        .await
        .unwrap();
    }

    let cli = context(pool.clone());
    let shown = cli.show_skill("demo", "zh").await.unwrap();
    assert_eq!(shown.uid, "demo-uid");
    assert_eq!(shown.id, "demo");
    assert_eq!(shown.name, "demo");
    assert_eq!(shown.description.as_deref(), Some("Demo description"));
    assert!(shown.canonical_path.is_some());
    assert_eq!(shown.linked_agents, ["codex"]);
    assert_eq!(shown.tags.len(), 2);
    assert_eq!(shown.tags[0].id, alpha.id);
    assert_eq!(shown.tags[0].name, "Alpha");
    assert_eq!(shown.tags[0].source, "manual");
    assert_eq!(shown.tags[1].name, "Beta");
    assert_eq!(shown.tags[1].source, "ai");
    assert_eq!(shown.projects.len(), 1);
    assert_eq!(shown.projects[0].project_id, "proj-demo");
    assert_eq!(shown.projects[0].name, "Demo Project");
    assert_eq!(shown.projects[0].agent_id, "codex");
    assert_eq!(
        shown.projects[0].installed_path,
        "/installed/codex/demo".to_string()
    );
    assert_eq!(shown.projects[0].link_type, "symlink");
    let value = serde_json::to_value(&shown).unwrap();
    let explanation = shown.explanation.unwrap();
    assert_eq!(explanation.lang, "zh");
    assert_eq!(explanation.text, "你好");
    assert_eq!(explanation.model.as_deref(), Some("model-zh"));

    assert_keys(
        &value,
        &[
            "uid",
            "id",
            "name",
            "description",
            "canonicalPath",
            "linkedAgents",
            "tags",
            "projects",
            "explanation",
        ],
    );
    assert_keys(&value["tags"][0], &["id", "name", "source"]);
    assert_keys(
        &value["projects"][0],
        &[
            "projectId",
            "name",
            "path",
            "agentId",
            "installedPath",
            "linkType",
        ],
    );
    assert!(!value.to_string().contains("secret-target-should-not-leak"));

    let english = cli.show_skill("demo-uid", "en").await.unwrap();
    let english_explanation = english.explanation.unwrap();
    assert_eq!(english_explanation.lang, "en");
    assert_eq!(english_explanation.text, "Hello");
    assert!(english_explanation.model.is_none());
    assert!(serde_json::to_value(&english_explanation).unwrap()["model"].is_null());

    let empty = cli.show_skill("demo", "xx").await.unwrap();
    assert!(empty.explanation.is_none());
    let remaining: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM skill_explanations WHERE skill_id = ? AND lang = 'xx'",
    )
    .bind("demo")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(remaining, 1);

    let listed = cli.list_skills().await.unwrap();
    let listed_demo = listed.iter().find(|skill| skill.id == "demo").unwrap();
    let listed_value = serde_json::to_value(listed_demo).unwrap();
    assert!(listed_value.get("tags").is_none());
    assert!(listed_value.get("projects").is_none());
    assert!(listed_value.get("explanation").is_none());
}

#[tokio::test]
async fn read_commands_do_not_write_operation_logs_or_touch_secrets() {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    test_support::seed_central_skill(&pool, &temp.path().join("demo"), "demo", "Demo").await;
    let project_dir = temp.path().join("project");
    insert_project(&pool, "proj-demo", &project_dir, "Demo", false).await;
    let cli = context(pool.clone());
    let before = operation_log_count(&pool).await;

    cli.list_agents().await.unwrap();
    cli.list_projects().await.unwrap();
    cli.list_tags().await.unwrap();
    cli.list_skills().await.unwrap();
    cli.show_skill("demo", "en").await.unwrap();
    cli.list_project_skills(".", &project_dir).await.unwrap();

    assert_eq!(operation_log_count(&pool).await, before);
}
