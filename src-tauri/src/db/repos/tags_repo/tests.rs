use super::*;
use crate::db::{upsert_skill, UNCATEGORIZED_TAG_ID};
use crate::test_support::{central_skill_row, mem_pool, mem_pool_single_conn};
use std::path::Path;

async fn add_skill(pool: &DbPool, id: &str, is_central: bool) {
    let mut skill = central_skill_row(id, Path::new(&format!("/tmp/{id}")));
    skill.is_central = is_central;
    upsert_skill(pool, &skill).await.unwrap();
}

async fn link_tag(pool: &DbPool, skill_id: &str, tag_id: &str) {
    assign_skill_tags(
        pool,
        &[skill_id.to_string()],
        &[tag_id.to_string()],
        "manual",
        None,
        None,
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn central_top_tags_excludes_non_central_and_orphan_links() {
    let pool = mem_pool_single_conn().await;
    let alpha = create_skill_tag(&pool, "alpha", None, None).await.unwrap();
    add_skill(&pool, "central-one", true).await;
    add_skill(&pool, "platform-copy", false).await;
    link_tag(&pool, "central-one", &alpha.id).await;
    link_tag(&pool, "platform-copy", &alpha.id).await;
    // Semantic corruption fixture: migrated production connections keep FK
    // enabled, so disable it explicitly on this single test connection.
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO skill_tag_links
         (skill_id, tag_id, confidence, reason, source, added_at)
         VALUES ('ghost-skill', ?, NULL, NULL, 'manual', ?)",
    )
    .bind(&alpha.id)
    .bind(now_rfc3339())
    .execute(&pool)
    .await
    .unwrap();

    let top = list_central_top_tags(&pool, 10).await.unwrap();

    assert_eq!(top.len(), 1);
    assert_eq!(top[0].id, alpha.id);
    assert_eq!(top[0].count, 1);
}

#[tokio::test]
async fn central_top_tags_excludes_uncategorized() {
    let pool = mem_pool().await;
    add_skill(&pool, "central-one", true).await;
    link_tag(&pool, "central-one", UNCATEGORIZED_TAG_ID).await;

    let top = list_central_top_tags(&pool, 10).await.unwrap();

    assert!(top.is_empty());
}

#[tokio::test]
async fn central_top_tags_orders_by_count_desc_then_name_asc() {
    let pool = mem_pool().await;
    let beta = create_skill_tag(&pool, "beta", None, None).await.unwrap();
    let delta = create_skill_tag(&pool, "delta", None, None).await.unwrap();
    let gamma = create_skill_tag(&pool, "gamma", None, None).await.unwrap();
    for skill_id in ["s1", "s2", "s3"] {
        add_skill(&pool, skill_id, true).await;
    }
    // 多技能共享同一 tag：gamma 计数 3。
    for skill_id in ["s1", "s2", "s3"] {
        link_tag(&pool, skill_id, &gamma.id).await;
    }
    // beta / delta 并列 2：按 name ASC（beta < delta）。
    for skill_id in ["s1", "s2"] {
        link_tag(&pool, skill_id, &beta.id).await;
        link_tag(&pool, skill_id, &delta.id).await;
    }

    let top = list_central_top_tags(&pool, 10).await.unwrap();

    let summary: Vec<(&str, u32)> = top
        .iter()
        .map(|tag| (tag.name.as_str(), tag.count))
        .collect();
    assert_eq!(summary, [("gamma", 3), ("beta", 2), ("delta", 2)]);
}

#[tokio::test]
async fn central_top_tags_applies_limit_and_clamps_range() {
    let pool = mem_pool().await;
    add_skill(&pool, "central-one", true).await;
    for index in 0..55 {
        let tag = create_skill_tag(&pool, &format!("tag-{index:02}"), None, None)
            .await
            .unwrap();
        link_tag(&pool, "central-one", &tag.id).await;
    }

    // limit 截断生效。
    let top3 = list_central_top_tags(&pool, 3).await.unwrap();
    assert_eq!(top3.len(), 3);

    // clamp 范围 1..=50：0 → 1，999 → 50。
    let clamped_low = list_central_top_tags(&pool, 0).await.unwrap();
    assert_eq!(clamped_low.len(), 1);
    let clamped_high = list_central_top_tags(&pool, 999).await.unwrap();
    assert_eq!(clamped_high.len(), 50);
}
