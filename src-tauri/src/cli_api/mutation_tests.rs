//! Tag and note mutation contracts for `cli_api`.

use std::sync::Arc;

use serde_json::Value;

use super::tags::TagAddRequest;
use super::{CliApiError, CliContext, NoteInput};
use crate::db::repos::{tag_groups_repo, tags_repo};
use crate::db::DbPool;
use crate::test_support;

fn context(pool: DbPool) -> CliContext {
    CliContext::new(pool, Arc::new(crate::secrets::MockSecretStore::default()))
}

async fn count(pool: &DbPool, table: &str) -> i64 {
    sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
        .fetch_one(pool)
        .await
        .unwrap()
}

/// Row counts for every table a tag/note mutation can touch.
async fn snapshot(pool: &DbPool) -> Vec<i64> {
    let mut counts = Vec::new();
    for table in [
        "skill_tags",
        "skill_tag_links",
        "skill_ai_tag_reviews",
        "skill_explanations",
        "operation_logs",
    ] {
        counts.push(count(pool, table).await);
    }
    counts
}

async fn seeded() -> (DbPool, tempfile::TempDir) {
    let pool = test_support::mem_pool().await;
    let temp = tempfile::tempdir().unwrap();
    for id in ["alpha", "beta"] {
        test_support::seed_central_skill(&pool, &temp.path().join(id), id, id).await;
    }
    (pool, temp)
}

async fn link_source(pool: &DbPool, skill_id: &str, tag_id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT source FROM skill_tag_links WHERE skill_id = ? AND tag_id = ?")
        .bind(skill_id)
        .bind(tag_id)
        .fetch_optional(pool)
        .await
        .unwrap()
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

fn add_request<'a>(
    skills: &'a [String],
    tags: &'a [String],
    review: bool,
    dry_run: bool,
    yes: bool,
) -> TagAddRequest<'a> {
    TagAddRequest {
        skill_refs: skills,
        tag_refs: tags,
        reason: Some("matches docs"),
        confidence: Some(0.8),
        review,
        dry_run,
        yes,
    }
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}

fn assert_confirmation_required(error: CliApiError, expected_plans: usize) {
    assert_eq!(error.code(), "input.confirmation_required");
    assert_eq!(error.exit_code(), 2);
    let details = error.details();
    assert_eq!(details["plans"].as_array().unwrap().len(), expected_plans);
}

#[tokio::test]
async fn tags_create_dry_run_writes_nothing_then_creates_with_group() {
    let (pool, _temp) = seeded().await;
    let group = tag_groups_repo::create_tag_group(
        &pool,
        tag_groups_repo::NewTagGroup {
            name: "Writing",
            color: None,
        },
    )
    .await
    .unwrap();
    let cli = context(pool.clone());
    let before = snapshot(&pool).await;

    let preview = cli
        .create_tag(" Release Notes ", Some("Writing"), Some("#fff"), None, true)
        .await
        .unwrap();
    assert!(preview.dry_run);
    assert!(preview.result.is_none());
    assert_eq!(preview.plans[0].name, "Release Notes");
    assert_eq!(preview.plans[0].id, "release-notes");
    assert!(!preview.plans[0].exists);
    assert_eq!(snapshot(&pool).await, before);

    let created = cli
        .create_tag("Release Notes", Some(&group.id), Some("#fff"), None, false)
        .await
        .unwrap();
    let result = created.result.unwrap();
    assert!(result.created);
    assert_eq!(result.tag.group.as_ref().unwrap().id, group.id);
    let (category, action, status, details) = last_log(&pool).await;
    assert_eq!(
        (category.as_str(), action.as_str(), status.as_str()),
        ("catalog", "create_skill_tag", "succeeded")
    );
    assert_eq!(details["source"], "cli");
    assert_eq!(details["phase"], "database");

    let again = cli
        .create_tag("Release Notes", None, None, None, false)
        .await
        .unwrap();
    assert!(again.plans[0].exists);
    assert!(!again.result.unwrap().created);

    let missing = cli
        .create_tag("Other", Some("nope"), None, None, false)
        .await
        .unwrap_err();
    assert_eq!(missing.code(), "tag_group.not_found");
    assert_eq!(missing.exit_code(), 3);
    assert!(tags_repo::get_skill_tag_by_name(&pool, "Other")
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn tags_add_unknown_tag_is_not_found_and_never_creates() {
    let (pool, _temp) = seeded().await;
    let cli = context(pool.clone());
    let before = snapshot(&pool).await;
    let skills = strings(&["alpha"]);
    let tags = strings(&["docs-writing", "no-such-tag"]);

    let error = cli
        .add_tags(add_request(&skills, &tags, false, false, true))
        .await
        .unwrap_err();
    assert_eq!(error.code(), "tag.not_found");
    assert_eq!(error.to_string(), "Tag 'no-such-tag' not found");
    assert_eq!(snapshot(&pool).await, before);
}

#[tokio::test]
async fn tags_add_dry_run_and_batch_confirmation_have_no_side_effects() {
    let (pool, _temp) = seeded().await;
    let cli = context(pool.clone());
    let before = snapshot(&pool).await;
    let skills = strings(&["alpha", "beta"]);
    let tags = strings(&["docs-writing", "文档与写作"]);

    let preview = cli
        .add_tags(add_request(&skills, &tags, false, true, false))
        .await
        .unwrap();
    assert!(preview.dry_run);
    // Same tag by id and by name collapses to one plan per skill.
    assert_eq!(preview.plans.len(), 2);
    assert!(preview.plans.iter().all(|plan| plan.action == "link"));
    assert_eq!(snapshot(&pool).await, before);

    let review_preview = cli
        .add_tags(add_request(&skills, &tags, true, true, false))
        .await
        .unwrap();
    assert!(review_preview
        .plans
        .iter()
        .all(|plan| plan.action == "review"));
    assert_eq!(snapshot(&pool).await, before);

    let error = cli
        .add_tags(add_request(&skills, &tags, false, false, false))
        .await
        .unwrap_err();
    assert_confirmation_required(error, 2);
    assert_eq!(snapshot(&pool).await, before);
}

#[tokio::test]
async fn tags_add_defaults_to_agent_source_and_survives_ai_retagging() {
    let (pool, _temp) = seeded().await;
    let cli = context(pool.clone());
    let skills = strings(&["alpha"]);
    let tags = strings(&["docs-writing"]);

    // A single skill is not a batch, so no --yes is needed.
    let output = cli
        .add_tags(add_request(&skills, &tags, false, false, false))
        .await
        .unwrap();
    assert_eq!(output.result.unwrap().linked, 1);
    assert_eq!(
        link_source(&pool, "alpha", "docs-writing").await.as_deref(),
        Some("agent")
    );
    let (confidence, reason): (Option<f64>, Option<String>) = sqlx::query_as(
        "SELECT confidence, reason FROM skill_tag_links WHERE skill_id = 'alpha' AND tag_id = 'docs-writing'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(confidence, Some(0.8));
    assert_eq!(reason.as_deref(), Some("matches docs"));
    let (category, action, status, details) = last_log(&pool).await;
    assert_eq!(
        (category.as_str(), action.as_str(), status.as_str()),
        ("catalog", "assign_skill_tags", "succeeded")
    );
    assert_eq!(details["affectedCount"], 1);
    assert!(!details.to_string().contains("matches docs"));

    // AI re-tagging deletes only `ai` links and never overwrites an existing link.
    tags_repo::replace_skill_ai_tags(
        &pool,
        "alpha",
        &[
            ("docs-writing".to_string(), 0.9, "ai".to_string()),
            ("testing-quality".to_string(), 0.9, "ai".to_string()),
        ],
    )
    .await
    .unwrap();
    tags_repo::replace_skill_ai_tags(&pool, "alpha", &[])
        .await
        .unwrap();
    assert_eq!(
        link_source(&pool, "alpha", "docs-writing").await.as_deref(),
        Some("agent")
    );
    assert_eq!(link_source(&pool, "alpha", "testing-quality").await, None);

    let shown = cli.show_skill("alpha", "en").await.unwrap();
    assert!(shown
        .tags
        .iter()
        .any(|tag| tag.id == "docs-writing" && tag.source == "agent"));
}

#[tokio::test]
async fn tags_add_review_queues_without_linking_and_keeps_other_pending_rows() {
    let (pool, _temp) = seeded().await;
    tags_repo::replace_pending_ai_tag_reviews(
        &pool,
        "alpha",
        &[crate::db::PendingAiTagReviewInput {
            tag_id: "testing-quality".to_string(),
            confidence: 0.3,
            reason: "ai".to_string(),
            proposed_name: None,
            proposed_description: None,
        }],
    )
    .await
    .unwrap();
    let cli = context(pool.clone());
    let skills = strings(&["alpha", "beta"]);
    let tags = strings(&["docs-writing"]);

    let output = cli
        .add_tags(add_request(&skills, &tags, true, false, true))
        .await
        .unwrap();
    assert_eq!(output.result.unwrap().queued, 2);
    assert_eq!(count(&pool, "skill_tag_links").await, 0);

    let pending = tags_repo::get_pending_ai_tag_reviews(&pool).await.unwrap();
    let mut pairs = pending
        .iter()
        .map(|review| (review.skill_id.clone(), review.tag.id.clone()))
        .collect::<Vec<_>>();
    pairs.sort();
    assert_eq!(
        pairs,
        [
            ("alpha".to_string(), "docs-writing".to_string()),
            ("alpha".to_string(), "testing-quality".to_string()),
            ("beta".to_string(), "docs-writing".to_string()),
        ]
    );
    let review = pending
        .iter()
        .find(|review| review.skill_id == "beta")
        .unwrap();
    assert_eq!(review.confidence, 0.8);
    assert_eq!(review.reason, "matches docs");
    let (category, action, _, _) = last_log(&pool).await;
    assert_eq!(
        (category.as_str(), action.as_str()),
        ("catalog", "suggest_skill_tags")
    );
}

#[tokio::test]
async fn tags_add_rejects_out_of_range_confidence() {
    let (pool, _temp) = seeded().await;
    let cli = context(pool);
    let skills = strings(&["alpha"]);
    let tags = strings(&["docs-writing"]);
    let mut request = add_request(&skills, &tags, false, false, true);
    request.confidence = Some(1.5);
    let error = cli.add_tags(request).await.unwrap_err();
    assert_eq!(error.code(), "input.invalid");
}

#[tokio::test]
async fn tags_remove_requires_yes_and_dry_run_is_side_effect_free() {
    let (pool, _temp) = seeded().await;
    tags_repo::assign_skill_tags(
        &pool,
        &strings(&["alpha"]),
        &strings(&["docs-writing", "testing-quality"]),
        "manual",
        None,
        None,
    )
    .await
    .unwrap();
    let cli = context(pool.clone());
    let tags = strings(&["docs-writing"]);
    let before = snapshot(&pool).await;

    let preview = cli.remove_tags("alpha", &tags, true, false).await.unwrap();
    assert!(preview.dry_run);
    assert!(preview.plans[0].already_linked);
    assert_eq!(preview.plans[0].current_source.as_deref(), Some("manual"));
    assert_eq!(snapshot(&pool).await, before);

    let error = cli
        .remove_tags("alpha", &tags, false, false)
        .await
        .unwrap_err();
    assert_confirmation_required(error, 1);
    assert_eq!(snapshot(&pool).await, before);

    let removed = cli.remove_tags("alpha", &tags, false, true).await.unwrap();
    assert_eq!(removed.result.unwrap().removed, 1);
    assert_eq!(link_source(&pool, "alpha", "docs-writing").await, None);
    assert_eq!(
        link_source(&pool, "alpha", "testing-quality")
            .await
            .as_deref(),
        Some("manual")
    );
    let (category, action, status, _) = last_log(&pool).await;
    assert_eq!(
        (category.as_str(), action.as_str(), status.as_str()),
        ("catalog", "unassign_skill_tags", "succeeded")
    );
}

#[tokio::test]
async fn notes_set_writes_agent_model_visible_to_explanation_view() {
    let (pool, _temp) = seeded().await;
    let cli = context(pool.clone());

    let empty = cli.get_note("alpha", "en").await.unwrap();
    assert!(empty.explanation.is_none());

    let before = snapshot(&pool).await;
    let preview = cli
        .set_note(
            "alpha",
            NoteInput::Text("Use for docs.".to_string()),
            "en",
            None,
            true,
            false,
        )
        .await
        .unwrap();
    assert!(preview.dry_run);
    assert_eq!(preview.plans[0].model, "agent:cli");
    assert!(!preview.plans[0].replaces_existing);
    assert_eq!(snapshot(&pool).await, before);

    let written = cli
        .set_note(
            "alpha",
            NoteInput::Text("Use for docs.".to_string()),
            "en",
            None,
            false,
            false,
        )
        .await
        .unwrap();
    let note = written.result.unwrap();
    let explanation = note.explanation.unwrap();
    assert_eq!(explanation.text, "Use for docs.");
    assert_eq!(explanation.model.as_deref(), Some("agent:cli"));

    // The desktop explanation view reads the same cache row.
    let cached =
        crate::services::ai_provider::get_skill_explanation_record_impl(&pool, "alpha", "en")
            .await
            .unwrap()
            .unwrap();
    assert!(cached.model.unwrap().starts_with("agent:"));
    assert!(cli
        .get_note("alpha", "zh")
        .await
        .unwrap()
        .explanation
        .is_none());
    let (category, action, status, details) = last_log(&pool).await;
    assert_eq!(
        (category.as_str(), action.as_str(), status.as_str()),
        ("marketplace", "refresh_skill_explanation", "succeeded")
    );
    assert_eq!(details["phase"], "database");
    assert!(!details.to_string().contains("Use for docs."));

    // Overwriting an existing explanation needs --yes.
    let before = snapshot(&pool).await;
    let error = cli
        .set_note(
            "alpha",
            NoteInput::Text("Replaced.".to_string()),
            "en",
            Some("codex"),
            false,
            false,
        )
        .await
        .unwrap_err();
    assert_confirmation_required(error, 1);
    assert_eq!(snapshot(&pool).await, before);

    let replaced = cli
        .set_note(
            "alpha",
            NoteInput::Text("Replaced.".to_string()),
            "en",
            Some("codex"),
            false,
            true,
        )
        .await
        .unwrap();
    assert_eq!(
        replaced.plans[0].previous_model.as_deref(),
        Some("agent:cli")
    );
    let explanation = replaced.result.unwrap().explanation.unwrap();
    assert_eq!(explanation.model.as_deref(), Some("agent:codex"));
    assert_eq!(count(&pool, "skill_explanations").await, 1);
}

#[tokio::test]
async fn notes_set_validates_file_size_encoding_and_input() {
    let (pool, temp) = seeded().await;
    let cli = context(pool.clone());
    let before = snapshot(&pool).await;

    let set = |input: NoteInput, author: Option<&'static str>| {
        let cli = &cli;
        async move {
            cli.set_note("alpha", input, "en", author, false, true)
                .await
        }
    };

    let big = temp.path().join("big.md");
    std::fs::write(&big, vec![b'a'; super::notes::MAX_NOTE_BYTES + 1]).unwrap();
    assert_eq!(
        set(NoteInput::File(big), None).await.unwrap_err().code(),
        "input.invalid"
    );

    let binary = temp.path().join("binary.md");
    std::fs::write(&binary, [0xff, 0xfe, 0x00, 0x41]).unwrap();
    assert_eq!(
        set(NoteInput::File(binary), None).await.unwrap_err().code(),
        "input.invalid"
    );

    let missing = set(NoteInput::File(temp.path().join("missing.md")), None)
        .await
        .unwrap_err();
    assert_eq!(missing.code(), "path.invalid");
    assert_eq!(missing.exit_code(), 2);
    assert_eq!(
        set(NoteInput::File(temp.path().to_path_buf()), None)
            .await
            .unwrap_err()
            .code(),
        "path.invalid"
    );

    assert_eq!(
        set(NoteInput::Text("   ".to_string()), None)
            .await
            .unwrap_err()
            .code(),
        "input.invalid"
    );
    assert_eq!(
        set(
            NoteInput::Text("a".repeat(super::notes::MAX_NOTE_BYTES + 1)),
            None
        )
        .await
        .unwrap_err()
        .code(),
        "input.invalid"
    );
    assert_eq!(
        set(NoteInput::Text("ok".to_string()), Some("bad author"))
            .await
            .unwrap_err()
            .code(),
        "input.invalid"
    );
    assert_eq!(snapshot(&pool).await, before);

    let exact = temp.path().join("exact.md");
    std::fs::write(&exact, "说明".repeat(10)).unwrap();
    let written = set(NoteInput::File(exact), Some("claude-code"))
        .await
        .unwrap();
    assert_eq!(
        written
            .result
            .unwrap()
            .explanation
            .unwrap()
            .model
            .as_deref(),
        Some("agent:claude-code")
    );
}

#[tokio::test]
async fn notes_get_unknown_skill_is_not_found() {
    let (pool, _temp) = seeded().await;
    let error = context(pool).get_note("missing", "en").await.unwrap_err();
    assert_eq!(error.code(), "skill.not_found");
}

#[tokio::test]
async fn tags_create_with_group_rolls_back_the_tag_when_group_assignment_fails() {
    let (pool, _temp) = seeded().await;
    let group = tag_groups_repo::create_tag_group(
        &pool,
        tag_groups_repo::NewTagGroup {
            name: "Writing",
            color: None,
        },
    )
    .await
    .unwrap();
    sqlx::query(
        "CREATE TRIGGER fail_tag_group_assignment BEFORE UPDATE OF group_id ON skill_tags
         BEGIN SELECT RAISE(ABORT, 'injected group failure'); END",
    )
    .execute(&pool)
    .await
    .unwrap();
    let cli = context(pool.clone());
    let tags_before = count(&pool, "skill_tags").await;

    let error = cli
        .create_tag("Grouped", Some(&group.id), None, None, false)
        .await
        .unwrap_err();
    assert_eq!(error.code(), "internal.error");
    assert_eq!(count(&pool, "skill_tags").await, tags_before);
    assert!(tags_repo::get_skill_tag_by_name(&pool, "Grouped")
        .await
        .unwrap()
        .is_none());
    let (_, action, status, _) = last_log(&pool).await;
    assert_eq!(
        (action.as_str(), status.as_str()),
        ("create_skill_tag", "failed")
    );
    let error_summary: Option<String> =
        sqlx::query_scalar("SELECT error_summary FROM operation_logs ORDER BY rowid DESC LIMIT 1")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(error_summary.as_deref(), Some("internal.error"));

    sqlx::query("DROP TRIGGER fail_tag_group_assignment")
        .execute(&pool)
        .await
        .unwrap();
    let created = cli
        .create_tag("Grouped", Some(&group.id), None, None, false)
        .await
        .unwrap()
        .result
        .unwrap();
    assert!(created.created);
    assert_eq!(created.tag.group.unwrap().id, group.id);
}
