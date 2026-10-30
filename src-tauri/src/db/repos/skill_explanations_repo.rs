//! `skill_explanations` writes shared by AI generation and external authors.

use crate::db::types::DbPool;

/// Insert or replace the explanation for `(skill_id, lang)`.
///
/// `created_at` survives replacement so the first write time is kept. This
/// function does not call an AI provider and does not validate content;
/// callers reject blank text before writing.
pub async fn upsert_skill_explanation(
    pool: &DbPool,
    skill_id: &str,
    lang: &str,
    model: &str,
    explanation: &str,
) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR REPLACE INTO skill_explanations (skill_id, explanation, lang, model, created_at, updated_at)
         VALUES (?, ?, ?, ?,
            COALESCE((SELECT created_at FROM skill_explanations WHERE skill_id = ? AND lang = ?), ?),
            ?)",
    )
    .bind(skill_id)
    .bind(explanation)
    .bind(lang)
    .bind(model)
    .bind(skill_id)
    .bind(lang)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;
    Ok(())
}
