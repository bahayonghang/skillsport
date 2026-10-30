//! Public `skillport_lib::cli_api` integration contracts.

mod common;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use skillport_lib::cli_api::{CliApiError, CliContext, CliEntity, NoteInput, TagAddRequest};
use skillport_lib::db::DbPool;
use skillport_lib::secrets::{SecretError, SecretStorageState, SecretStore};

use common::{fresh_db, seed_central_skill};

struct DenySecretStore;

impl SecretStore for DenySecretStore {
    fn get(&self, _key: &str) -> Result<Option<String>, SecretError> {
        panic!("CLI integration contract unexpectedly read a secret")
    }

    fn set(&self, _key: &str, _value: &str) -> Result<SecretStorageState, SecretError> {
        panic!("CLI integration contract unexpectedly wrote a secret")
    }

    fn delete(&self, _key: &str) -> Result<(), SecretError> {
        panic!("CLI integration contract unexpectedly deleted a secret")
    }

    fn state(&self, _key: &str) -> Result<SecretStorageState, SecretError> {
        panic!("CLI integration contract unexpectedly inspected a secret")
    }
}

fn cli_context(pool: DbPool) -> CliContext {
    CliContext::new(pool, Arc::new(DenySecretStore))
}

async fn set_agent_dir(pool: &DbPool, agent_id: &str, path: &Path) {
    sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = ?")
        .bind(path.to_string_lossy().as_ref())
        .bind(agent_id)
        .execute(pool)
        .await
        .unwrap();
}

fn assert_invalid<T>(result: Result<T, CliApiError>) {
    let error = match result {
        Ok(_) => panic!("expected invalid input"),
        Err(error) => error,
    };
    assert!(matches!(error, CliApiError::InvalidInput(_)));
    assert_eq!(error.code(), "input.invalid");
    assert_eq!(error.exit_code(), 2);
}

#[tokio::test]
async fn public_identity_flows_from_list_and_show_into_dry_run_sync() {
    let pool = fresh_db().await;
    let temp = tempfile::tempdir().unwrap();
    let agent_root = temp.path().join("codex-skills");
    set_agent_dir(&pool, "codex", &agent_root).await;
    let skill = seed_central_skill(&pool, &temp.path().join("central/demo"), "demo", "Demo").await;
    let context = cli_context(pool);

    let listed = context.list_skills().await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].uid, skill.uid);
    assert_eq!(listed[0].id, skill.id);

    let shown = context.show_skill(&skill.uid, "en").await.unwrap();
    assert_eq!(shown.uid, skill.uid);
    assert_eq!(shown.id, skill.id);

    let output = context
        .sync_skills(
            vec![skill.uid],
            false,
            vec!["codex".to_string()],
            "copy",
            true,
        )
        .await
        .unwrap();
    assert!(output.dry_run);
    assert!(output.result.is_none());
    assert_eq!(output.plans.len(), 1);
    assert_eq!(output.plans[0].id, "demo");
    assert_eq!(output.plans[0].agent_id, "codex");
    assert_eq!(output.plans[0].method, "copy");
    assert_eq!(
        PathBuf::from(&output.plans[0].target_path),
        agent_root.join("demo")
    );
}

#[tokio::test]
async fn dry_run_sync_deduplicates_uid_and_id_references() {
    let pool = fresh_db().await;
    let temp = tempfile::tempdir().unwrap();
    set_agent_dir(&pool, "codex", &temp.path().join("codex-skills")).await;
    let skill = seed_central_skill(&pool, &temp.path().join("central/demo"), "demo", "Demo").await;
    let context = cli_context(pool);

    let output = context
        .sync_skills(
            vec![skill.uid, skill.id],
            false,
            vec!["codex".to_string()],
            "copy",
            true,
        )
        .await
        .unwrap();

    assert_eq!(output.plans.len(), 1);
}

#[tokio::test]
async fn ambiguous_name_preserves_the_public_error_contract() {
    let pool = fresh_db().await;
    let temp = tempfile::tempdir().unwrap();
    seed_central_skill(
        &pool,
        &temp.path().join("central/alpha"),
        "alpha",
        "Shared Name",
    )
    .await;
    seed_central_skill(
        &pool,
        &temp.path().join("central/beta"),
        "beta",
        "Shared Name",
    )
    .await;
    let context = cli_context(pool);

    let error = context.show_skill("Shared Name", "en").await.unwrap_err();
    assert!(matches!(
        error,
        CliApiError::Ambiguous {
            entity: CliEntity::Skill,
            ..
        }
    ));
    assert_eq!(error.code(), "skill.ambiguous");
    assert_eq!(error.exit_code(), 3);
}

#[tokio::test]
async fn invalid_sync_selections_fail_before_external_side_effects() {
    let context = cli_context(fresh_db().await);

    assert_invalid(
        context
            .sync_skills(vec!["demo".to_string()], true, vec![], "copy", true)
            .await,
    );
    assert_invalid(
        context
            .sync_skills(vec![], false, vec![], "copy", true)
            .await,
    );
    assert_invalid(
        context
            .sync_skills(vec![], true, vec![], "unsupported", true)
            .await,
    );
}

#[tokio::test]
async fn empty_home_read_commands_return_json_arrays() {
    let home = tempfile::tempdir().unwrap();
    let bin = env!("CARGO_BIN_EXE_skillport-cli");
    let commands: &[&[&str]] = &[
        &["--json", "agents", "list"],
        &["--json", "projects", "list"],
        &["--json", "tags", "list"],
    ];
    for args in commands {
        let output = std::process::Command::new(bin)
            .args(*args)
            .env("HOME", home.path())
            .env("USERPROFILE", home.path())
            .output()
            .unwrap();
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(
            output.status.success(),
            "command {args:?} failed\nstdout: {stdout}\nstderr: {stderr}"
        );
        let envelope: serde_json::Value = serde_json::from_str(&stdout)
            .unwrap_or_else(|error| panic!("invalid json: {error}\n{stdout}"));
        assert_eq!(envelope["ok"], true);
        assert_eq!(envelope["schemaVersion"], 1);
        assert!(envelope["data"].is_array(), "{envelope}");
    }
}

#[tokio::test]
async fn public_tag_and_note_mutations_round_trip_through_show() {
    let pool = fresh_db().await;
    let temp = tempfile::tempdir().unwrap();
    let skill = seed_central_skill(&pool, &temp.path().join("central/demo"), "demo", "Demo").await;
    let context = cli_context(pool);
    let skills = vec![skill.uid.clone()];
    let tags = vec!["docs-writing".to_string()];

    let added = context
        .add_tags(TagAddRequest {
            skill_refs: &skills,
            tag_refs: &tags,
            reason: None,
            confidence: None,
            review: false,
            dry_run: false,
            yes: false,
        })
        .await
        .unwrap();
    assert!(!added.dry_run);
    assert_eq!(added.result.unwrap().linked, 1);

    context
        .set_note(
            &skill.uid,
            NoteInput::Text("Agent note".to_string()),
            "en",
            Some("codex"),
            false,
            false,
        )
        .await
        .unwrap();

    let shown = context.show_skill(&skill.uid, "en").await.unwrap();
    assert!(shown
        .tags
        .iter()
        .any(|tag| tag.id == "docs-writing" && tag.source == "agent"));
    let explanation = shown.explanation.unwrap();
    assert_eq!(explanation.text, "Agent note");
    assert_eq!(explanation.model.as_deref(), Some("agent:codex"));

    let error = context
        .remove_tags(&skill.uid, &tags, false, false)
        .await
        .unwrap_err();
    assert_eq!(error.code(), "input.confirmation_required");
    assert_eq!(error.exit_code(), 2);
    assert_eq!(error.details()["plans"][0]["tagId"], "docs-writing");
}

fn run_cli(home: &Path, args: &[&str]) -> std::process::Output {
    std::process::Command::new(env!("CARGO_BIN_EXE_skillport-cli"))
        .args(args)
        .env("HOME", home)
        .env("USERPROFILE", home)
        .output()
        .unwrap()
}

#[tokio::test]
async fn binary_mutations_use_dry_run_and_confirmation_envelopes() {
    let home = tempfile::tempdir().unwrap();
    let db_path = home.path().join(".skillsmanage").join("db.sqlite");
    std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();
    let pool = skillport_lib::db::open_database(&db_path).await.unwrap();
    seed_central_skill(&pool, &home.path().join("central/demo"), "demo", "Demo").await;
    pool.close().await;

    let preview = run_cli(
        home.path(),
        &[
            "--json",
            "tags",
            "add",
            "demo",
            "--tag",
            "docs-writing",
            "--dry-run",
        ],
    );
    assert_eq!(preview.status.code(), Some(0));
    let envelope: serde_json::Value = serde_json::from_slice(&preview.stdout).unwrap();
    assert_eq!(envelope["schemaVersion"], 1);
    assert_eq!(envelope["data"]["dryRun"], true);
    assert_eq!(envelope["data"]["plans"][0]["action"], "link");
    assert!(envelope["data"]["result"].is_null());

    let unconfirmed = run_cli(
        home.path(),
        &["--json", "tags", "remove", "demo", "--tag", "docs-writing"],
    );
    assert_eq!(unconfirmed.status.code(), Some(2));
    assert!(unconfirmed.stdout.is_empty());
    let envelope: serde_json::Value = serde_json::from_slice(&unconfirmed.stderr).unwrap();
    assert_eq!(envelope["ok"], false);
    assert_eq!(envelope["error"]["code"], "input.confirmation_required");
    assert_eq!(envelope["error"]["details"]["plans"][0]["skillId"], "demo");

    let missing_tag = run_cli(
        home.path(),
        &["--json", "tags", "add", "demo", "--tag", "no-such-tag"],
    );
    assert_eq!(missing_tag.status.code(), Some(3));
    let envelope: serde_json::Value = serde_json::from_slice(&missing_tag.stderr).unwrap();
    assert_eq!(envelope["error"]["code"], "tag.not_found");

    let note = run_cli(
        home.path(),
        &[
            "--json", "--lang", "zh", "notes", "set", "demo", "--text", "说明",
        ],
    );
    assert_eq!(
        note.status.code(),
        Some(0),
        "{}",
        String::from_utf8_lossy(&note.stderr)
    );
    let fetched = run_cli(
        home.path(),
        &["--json", "--lang", "zh", "notes", "get", "demo"],
    );
    let envelope: serde_json::Value = serde_json::from_slice(&fetched.stdout).unwrap();
    assert_eq!(envelope["data"]["explanation"]["text"], "说明");
    assert_eq!(envelope["data"]["explanation"]["model"], "agent:cli");
}
