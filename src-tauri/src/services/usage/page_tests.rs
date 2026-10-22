use super::*;

fn generation(
    count: usize,
    label: &str,
    now: i64,
) -> (
    Vec<NewSkillCall>,
    Vec<ProviderScanOutcome>,
    Vec<db::NewSkillUsageMetadata>,
) {
    let calls = (0..count)
        .map(|i| NewSkillCall {
            skill: format!("{label}-{i}"),
            timestamp_ms: now - i as i64,
            project: label.into(),
            session_id: format!("{label}-{i}"),
            source: label.into(),
        })
        .collect::<Vec<_>>();
    let providers = vec![ProviderScanOutcome {
        provider_id: label.into(),
        display_name: label.into(),
        available: true,
        call_count: count as i64,
    }];
    let metadata = calls
        .iter()
        .map(|c| db::NewSkillUsageMetadata {
            skill: c.skill.clone(),
            match_status: "unmatched".into(),
            resolved_skill_id: None,
            static_token_estimate: None,
            static_byte_count: None,
        })
        .collect();
    (calls, providers, metadata)
}

#[tokio::test]
async fn usage_page_wal_commit_barrier_preserves_one_complete_generation() {
    let (pool, _directory) = crate::test_support::file_pool().await;
    let now = Utc::now().timestamp_millis();
    let (calls, providers, metadata) = generation(144, "A", now);
    db::replace_calls_for_target(&pool, "local", &calls, &providers, &metadata, now)
        .await
        .unwrap();
    let mut reader = pool.begin().await.unwrap();
    // First SELECT establishes the WAL snapshot; the writer commits between SELECTs.
    assert_eq!(
        db::get_usage_kpis(&mut *reader, "local", None)
            .await
            .unwrap()
            .total_calls,
        144
    );
    let (calls, providers, metadata) = generation(1000, "B", now + 1);
    db::replace_calls_for_target(&pool, "local", &calls, &providers, &metadata, now + 1)
        .await
        .unwrap();
    let page = build_page_on(&mut reader, "local", None).await.unwrap();
    assert_eq!(page.overview.kpis.total_calls, 144);
    assert_eq!(page.overview.top_skills.len(), 144);
    assert!(page
        .overview
        .top_skills
        .iter()
        .all(|s| s.skill.starts_with("A-")));
    assert_eq!(
        page.overview.heatmap.iter().map(|d| d.count).sum::<i64>(),
        144
    );
    assert!(page.recent.iter().all(|c| c.source == "A"));
    assert_eq!(page.providers[0].display_name, "A");
    assert_eq!(page.overview.last_scan_ms, Some(now));
    reader.commit().await.unwrap();
    let new = build_page(&pool, "local", Some("B")).await.unwrap();
    assert_eq!(new.overview.top_skills.len(), 1000);
    assert_eq!(new.overview.last_scan_ms, Some(now + 1));
    let absent = build_page(&pool, "local", Some("A")).await.unwrap();
    assert_eq!(absent.overview.kpis.total_calls, 0);
    assert!(absent.recent.is_empty());
    let other = build_page(&pool, "other-target", None).await.unwrap();
    assert!(other.overview.top_skills.is_empty());
}
