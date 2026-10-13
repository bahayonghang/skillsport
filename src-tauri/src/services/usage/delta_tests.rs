use super::delta::{FileChange, FileFingerprint, FileManifest, ObservedFile, ProviderPlan};
use super::*;

fn call(skill: &str, project: &str) -> SkillCall {
    SkillCall {
        skill: skill.into(),
        timestamp_ms: 1_790_000_000_000,
        project: project.into(),
        session_id: "same".into(),
        source: "Claude Code".into(),
    }
}

async fn plan(
    pool: &DbPool,
    provider: &str,
    files: Vec<(&str, Option<Vec<SkillCall>>)>,
) -> ProviderPlan {
    let existing = db::list_file_fingerprints(pool, "local", provider)
        .await
        .unwrap()
        .into_iter()
        .map(|f| (f.file_path.clone(), f))
        .collect::<HashMap<_, _>>();
    let display_name = match provider {
        "codex" => "Codex CLI",
        "droid" => "Droid CLI",
        "grok" => "Grok CLI",
        "opencode" => "OpenCode",
        _ => "Claude Code",
    };
    let observed = files
        .into_iter()
        .enumerate()
        .map(|(order, (path, calls))| {
            let calls = calls.map(|calls| {
                calls
                    .into_iter()
                    .map(|mut c| {
                        c.source = display_name.into();
                        c
                    })
                    .collect()
            });
            let old = existing.get(path);
            ObservedFile {
                path: path.into(),
                key: old
                    .and_then(|f| f.file_key.clone())
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
                mtime_ms: 2,
                size: 10,
                order: order as i64,
                change: calls
                    .map(FileChange::Parsed)
                    .unwrap_or(FileChange::Unchanged),
            }
        })
        .collect();
    ProviderPlan {
        id: provider.into(),
        display_name: display_name.into(),
        available: true,
        files: Some(FileManifest {
            existing,
            files: observed,
        }),
        whole_calls: Vec::new(),
    }
}

async fn publish(pool: &DbPool, p: ProviderPlan, rebuild: bool) -> db::FactWrites {
    db::publish_local_scan(pool, "local", vec![p], &[], 100, rebuild)
        .await
        .unwrap()
        .1
}

async fn facts(pool: &DbPool) -> Vec<db::SkillCallRow> {
    db::list_calls_for_target(pool, "local").await.unwrap()
}

#[tokio::test]
async fn usage_delta_winner_fallback_reorder_and_unrelated_ids() {
    let pool = crate::test_support::mem_pool().await;
    let p = plan(
        &pool,
        "claude-code",
        vec![
            ("history", Some(vec![call("review", "history")])),
            (
                "A",
                Some(vec![call("review", "A"), call("independent", "A")]),
            ),
            ("B", Some(vec![call("review", "B")])),
        ],
    )
    .await;
    assert_eq!(publish(&pool, p, true).await.inserted, 2);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM skill_call_candidates")
            .fetch_one(&pool)
            .await
            .unwrap(),
        4,
        "losers are durable"
    );
    let independent = facts(&pool)
        .await
        .into_iter()
        .find(|c| c.skill == "independent")
        .unwrap();
    let p = plan(
        &pool,
        "claude-code",
        vec![("history", Some(vec![])), ("A", None), ("B", None)],
    )
    .await;
    let w = publish(&pool, p, false).await;
    assert_eq!(w.inserted, 1);
    assert_eq!(w.deleted, 1);
    assert_eq!(
        facts(&pool)
            .await
            .iter()
            .find(|c| c.skill == "review")
            .unwrap()
            .project,
        "A"
    );
    let p = plan(
        &pool,
        "claude-code",
        vec![("history", None), ("B", None), ("A", None)],
    )
    .await;
    publish(&pool, p, false).await;
    assert_eq!(
        facts(&pool)
            .await
            .iter()
            .find(|c| c.skill == "review")
            .unwrap()
            .project,
        "B"
    );
    assert_eq!(
        facts(&pool)
            .await
            .iter()
            .find(|c| c.skill == "independent")
            .unwrap(),
        &independent
    );
    let p = plan(
        &pool,
        "claude-code",
        vec![("history", None), ("B", None), ("A", None)],
    )
    .await;
    assert_eq!(publish(&pool, p, false).await, db::FactWrites::default());
    let p = plan(
        &pool,
        "claude-code",
        vec![
            ("history", None),
            ("NEW", Some(vec![call("new", "NEW")])),
            ("B", None),
            ("A", None),
        ],
    )
    .await;
    let w = publish(&pool, p, false).await;
    assert_eq!(w.inserted, 1);
    assert_eq!(w.deleted, 0);
    let p = plan(
        &pool,
        "claude-code",
        vec![("history", None), ("NEW", None), ("A", None)],
    )
    .await;
    publish(&pool, p, false).await;
    assert_eq!(
        facts(&pool)
            .await
            .iter()
            .find(|c| c.skill == "review")
            .unwrap()
            .project,
        "A"
    );
    assert_eq!(
        facts(&pool)
            .await
            .iter()
            .find(|c| c.skill == "independent")
            .unwrap(),
        &independent
    );
}

#[tokio::test]
async fn usage_delta_occurrences_keep_multiplicity_and_preserve_equal_facts() {
    let pool = crate::test_support::mem_pool().await;
    let duplicate = call("review", "A");
    let p = plan(
        &pool,
        "codex",
        vec![
            ("A", Some(vec![duplicate.clone(), duplicate.clone()])),
            ("B", Some(vec![call("other", "B")])),
        ],
    )
    .await;
    publish(&pool, p, true).await;
    let before = facts(&pool).await;
    assert_eq!(before.len(), 3);
    let p = plan(
        &pool,
        "codex",
        vec![
            (
                "A",
                Some(vec![
                    duplicate.clone(),
                    duplicate.clone(),
                    duplicate.clone(),
                ]),
            ),
            ("B", None),
        ],
    )
    .await;
    let w = publish(&pool, p, false).await;
    assert_eq!(w.inserted, 1);
    assert_eq!(w.deleted, 0);
    let after = facts(&pool).await;
    for c in &before {
        assert!(after.contains(c));
    }
    let p = plan(
        &pool,
        "codex",
        vec![("A", Some(vec![duplicate])), ("B", None)],
    )
    .await;
    let w = publish(&pool, p, false).await;
    assert_eq!(w.deleted, 2);
    assert_eq!(w.inserted, 0);
    let p = plan(&pool, "codex", vec![("B", None)]).await;
    publish(&pool, p, false).await;
    assert_eq!(
        facts(&pool).await,
        vec![before.iter().find(|c| c.skill == "other").unwrap().clone()]
    );
}

#[tokio::test]
async fn usage_delta_initial_json_expansion_preserves_text_integer_precision_and_occurrences() {
    for provider in ["codex", "droid", "opencode"] {
        let pool = crate::test_support::mem_pool().await;
        let duplicate = SkillCall {
            skill: "检查\"技能\\\n\t\u{0000}".into(),
            timestamp_ms: i64::MAX,
            project: "C:\\项目\\\"quoted\"\n\u{0008}".into(),
            session_id: "会话\\\r\n\u{0000}".into(),
            source: String::new(),
        };
        let mut earliest = duplicate.clone();
        earliest.skill = "最早\u{000c}".into();
        earliest.timestamp_ms = i64::MIN;
        let initial = vec![duplicate.clone(), duplicate.clone(), earliest.clone()];
        let p = plan(&pool, provider, vec![("A", Some(initial.clone()))]).await;
        let source = p.display_name.clone();
        assert_eq!(publish(&pool, p, true).await.inserted, 3, "{provider}");
        let before = facts(&pool).await;
        let mut expected = initial
            .into_iter()
            .map(|mut c| {
                c.source = source.clone();
                serde_json::to_string(&c).unwrap()
            })
            .collect::<Vec<_>>();
        let mut actual = rows_to_skill_calls(before.clone())
            .into_iter()
            .map(|c| serde_json::to_string(&c).unwrap())
            .collect::<Vec<_>>();
        expected.sort();
        actual.sort();
        assert_eq!(actual, expected, "{provider}");
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM skill_call_candidates WHERE fact_id IS NOT NULL"
            )
            .fetch_one(&pool)
            .await
            .unwrap(),
            3,
            "{provider} duplicate occurrences retain separate winners"
        );

        // SQLite's cold group keys must match the Rust delta encoder exactly.
        let p = plan(
            &pool,
            provider,
            vec![(
                "A",
                Some(vec![
                    duplicate.clone(),
                    duplicate.clone(),
                    earliest,
                    duplicate,
                ]),
            )],
        )
        .await;
        assert_eq!(
            publish(&pool, p, false).await,
            db::FactWrites {
                inserted: 1,
                deleted: 0
            },
            "{provider}"
        );
        let after = facts(&pool).await;
        assert_eq!(after.len(), 4);
        for fact in before {
            assert!(
                after.contains(&fact),
                "{provider} equal facts keep their IDs"
            );
        }
        let p = plan(&pool, provider, vec![("A", None)]).await;
        assert_eq!(publish(&pool, p, false).await, db::FactWrites::default());
    }
}

#[tokio::test]
async fn usage_delta_initial_offsets_skip_empty_files_and_scope_file_keys() {
    let pool = crate::test_support::mem_pool().await;
    for target in ["other-target", "local"] {
        let mut sentinel = plan(
            &pool,
            "droid",
            vec![("sentinel", Some(vec![call("sentinel", target)]))],
        )
        .await;
        sentinel.files.as_mut().unwrap().files[0].key = "shared-opaque-key".into();
        db::publish_local_scan(&pool, target, vec![sentinel], &[], 1, false)
            .await
            .unwrap();
    }
    let before_other = db::list_calls_for_target(&pool, "other-target")
        .await
        .unwrap();
    let before_local = facts(&pool).await;
    let duplicate = call("duplicate", "B");
    let mut p = plan(
        &pool,
        "codex",
        vec![
            ("A", Some(vec![])),
            ("B", Some(vec![duplicate.clone(), duplicate])),
            ("C", Some(vec![])),
            ("D", Some(vec![call("one", "D"), call("two", "D")])),
        ],
    )
    .await;
    p.files.as_mut().unwrap().files[1].key = "shared-opaque-key".into();
    assert_eq!(publish(&pool, p, false).await.inserted, 4);
    let after = facts(&pool).await;
    assert_eq!(after.len(), 5);
    assert!(after.contains(&before_local[0]));
    assert_eq!(after.iter().filter(|c| c.skill == "duplicate").count(), 2);
    assert!(after.iter().any(|c| c.skill == "one"));
    assert!(after.iter().any(|c| c.skill == "two"));
    assert_eq!(
        db::list_calls_for_target(&pool, "other-target")
            .await
            .unwrap(),
        before_other
    );
    let pointers: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT c.fact_id,f.id FROM skill_call_candidates c JOIN skill_calls f ON f.id=c.fact_id
         WHERE c.target_id='local' AND c.provider='codex' AND f.target_id='local' AND f.source='Codex CLI'"
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(pointers.len(), 4);
    assert_eq!(
        pointers
            .iter()
            .map(|p| p.0)
            .collect::<std::collections::HashSet<_>>()
            .len(),
        4
    );
}

#[tokio::test]
async fn usage_delta_grok_groups_use_project_session_directory() {
    let pool = crate::test_support::mem_pool().await;
    let p = plan(
        &pool,
        "grok",
        vec![
            (
                "/p1/s/updates.jsonl",
                Some(vec![call("review", "p1-updates")]),
            ),
            (
                "/p1/s/chat_history.jsonl",
                Some(vec![call("review", "p1-chat")]),
            ),
            ("/p2/s/updates.jsonl", Some(vec![call("review", "p2")])),
        ],
    )
    .await;
    publish(&pool, p, true).await;
    assert_eq!(facts(&pool).await.len(), 2);
    let p2 = facts(&pool)
        .await
        .into_iter()
        .find(|c| c.project == "p2")
        .unwrap();
    let p = plan(
        &pool,
        "grok",
        vec![
            ("/p1/s/chat_history.jsonl", None),
            ("/p2/s/updates.jsonl", None),
        ],
    )
    .await;
    publish(&pool, p, false).await;
    assert!(facts(&pool).await.contains(&p2));
    assert!(facts(&pool).await.iter().any(|c| c.project == "p1-chat"));
}

async fn snapshot(pool: &DbPool) -> Vec<String> {
    let mut result = Vec::new();
    for table in [
        "skill_calls",
        "skill_call_file_cache",
        "skill_call_candidates",
        "skill_call_providers",
        "skill_usage_metadata",
        "skill_call_scan_state",
    ] {
        let columns: Vec<(i64, String, String, i64, Option<String>, i64)> =
            sqlx::query_as(&format!("PRAGMA table_info({table})"))
                .fetch_all(pool)
                .await
                .unwrap();
        let names = columns
            .iter()
            .map(|c| c.1.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let data:String=sqlx::query_scalar(&format!("SELECT json_group_array(json_array({names})) FROM (SELECT * FROM {table} ORDER BY rowid)")).fetch_one(pool).await.unwrap();
        result.push(format!("{table}:{data}"));
    }
    result
}

#[tokio::test]
async fn usage_delta_all_publication_stages_rollback_and_retry() {
    for table in [
        "skill_call_file_cache",
        "skill_call_candidates",
        "skill_calls",
        "skill_usage_metadata",
    ] {
        let pool = crate::test_support::mem_pool().await;
        let p = plan(
            &pool,
            "claude-code",
            vec![("A", Some(vec![call("old", "A")]))],
        )
        .await;
        publish(&pool, p, true).await;
        let before = snapshot(&pool).await;
        sqlx::query(&format!("CREATE TRIGGER reject_publication BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'fixture'); END")).execute(&pool).await.unwrap();
        let p = plan(
            &pool,
            "claude-code",
            vec![("A", Some(vec![call("new", "A")]))],
        )
        .await;
        let metadata = vec![db::NewSkillUsageMetadata {
            skill: "new".into(),
            match_status: "unmatched".into(),
            resolved_skill_id: None,
            static_token_estimate: None,
            static_byte_count: None,
        }];
        assert!(
            db::publish_local_scan(&pool, "local", vec![p], &metadata, 200, false)
                .await
                .is_err(),
            "{table}"
        );
        assert_eq!(snapshot(&pool).await, before, "{table}");
        sqlx::query("DROP TRIGGER reject_publication")
            .execute(&pool)
            .await
            .unwrap();
        let p = plan(
            &pool,
            "claude-code",
            vec![("A", Some(vec![call("new", "A")]))],
        )
        .await;
        db::publish_local_scan(&pool, "local", vec![p], &metadata, 200, false)
            .await
            .unwrap();
        assert_eq!(facts(&pool).await[0].skill, "new");
    }
}

#[test]
fn usage_delta_fingerprint_cache_never_materializes_unchanged_payload() {
    let mut cache = ProviderFileCache::fingerprints(vec![FileFingerprint {
        file_path: "A".into(),
        file_key: Some("opaque".into()),
        mtime_ms: 2,
        size: 3,
        observed_order: 0,
    }]);
    assert_eq!(cache.lookup("A", 2, 3), Some(vec![]));
    assert!(matches!(
        cache.into_manifest().files[0].change,
        FileChange::Unchanged
    ));
}

#[tokio::test]
async fn usage_delta_unreadable_and_unavailable_clear_only_own_contribution_and_recover() {
    let pool = crate::test_support::mem_pool().await;
    let a = plan(
        &pool,
        "claude-code",
        vec![("A", Some(vec![call("a", "A")]))],
    )
    .await;
    let b = plan(&pool, "codex", vec![("B", Some(vec![call("b", "B")]))]).await;
    db::publish_local_scan(&pool, "local", vec![a, b], &[], 1, true)
        .await
        .unwrap();
    let sentinel = facts(&pool)
        .await
        .into_iter()
        .find(|c| c.skill == "b")
        .unwrap();
    let mut a = plan(&pool, "claude-code", vec![("A", None)]).await;
    a.files.as_mut().unwrap().files[0].change = FileChange::Unreadable;
    let b = plan(&pool, "codex", vec![("B", None)]).await;
    db::publish_local_scan(&pool, "local", vec![a, b], &[], 2, false)
        .await
        .unwrap();
    assert_eq!(facts(&pool).await, vec![sentinel.clone()]);
    assert!(db::local_usage_ready(&pool, "local").await.unwrap());
    assert!(db::list_file_fingerprints(&pool, "local", "claude-code")
        .await
        .unwrap()
        .is_empty());
    let a = plan(
        &pool,
        "claude-code",
        vec![("A", Some(vec![call("a", "A")]))],
    )
    .await;
    let b = plan(&pool, "codex", vec![("B", None)]).await;
    db::publish_local_scan(&pool, "local", vec![a, b], &[], 3, false)
        .await
        .unwrap();
    assert!(facts(&pool).await.contains(&sentinel));
    assert_eq!(facts(&pool).await.len(), 2);
    let mut a = plan(&pool, "claude-code", vec![]).await;
    a.available = false;
    a.files = None;
    let b = plan(&pool, "codex", vec![("B", None)]).await;
    db::publish_local_scan(&pool, "local", vec![a, b], &[], 4, false)
        .await
        .unwrap();
    assert_eq!(facts(&pool).await, vec![sentinel]);
}

#[tokio::test]
async fn usage_delta_legacy_rebuild_failure_keeps_readiness_and_old_facts_until_retry() {
    let pool = crate::test_support::mem_pool().await;
    db::replace_calls_for_target(
        &pool,
        "local",
        &[NewSkillCall {
            skill: "legacy".into(),
            timestamp_ms: 1,
            project: "old".into(),
            session_id: "old".into(),
            source: "Old Provider".into(),
        }],
        &[],
        &[],
        1,
    )
    .await
    .unwrap();
    let before = snapshot(&pool).await;
    assert!(!db::local_usage_ready(&pool, "local").await.unwrap());
    sqlx::query("CREATE TRIGGER reject_initial BEFORE INSERT ON skill_call_candidates BEGIN SELECT RAISE(ABORT,'fixture'); END").execute(&pool).await.unwrap();
    let p = plan(&pool, "codex", vec![("A", Some(vec![call("new", "A")]))]).await;
    assert!(
        db::publish_local_scan(&pool, "local", vec![p], &[], 2, true)
            .await
            .is_err()
    );
    assert_eq!(snapshot(&pool).await, before);
    sqlx::query("DROP TRIGGER reject_initial")
        .execute(&pool)
        .await
        .unwrap();
    let p = plan(&pool, "codex", vec![("A", Some(vec![call("new", "A")]))]).await;
    publish(&pool, p, true).await;
    assert!(db::local_usage_ready(&pool, "local").await.unwrap());
    assert_eq!(facts(&pool).await[0].skill, "new");
}

#[tokio::test]
async fn usage_delta_distinct_target_publications_both_complete_without_read_upgrade_race() {
    let (pool, _directory) = crate::test_support::file_pool().await;
    let a = plan(&pool, "codex", vec![("A", Some(vec![call("a", "A")]))]).await;
    let b = plan(&pool, "codex", vec![("B", Some(vec![call("b", "B")]))]).await;
    let (a, b) = tokio::join!(
        db::publish_local_scan(&pool, "target-a", vec![a], &[], 1, true),
        db::publish_local_scan(&pool, "target-b", vec![b], &[], 2, true)
    );
    assert_eq!(a.unwrap().0, 1);
    assert_eq!(b.unwrap().0, 1);
    assert_eq!(
        db::list_calls_for_target(&pool, "target-a").await.unwrap()[0].skill,
        "a"
    );
    assert_eq!(
        db::list_calls_for_target(&pool, "target-b").await.unwrap()[0].skill,
        "b"
    );
}
