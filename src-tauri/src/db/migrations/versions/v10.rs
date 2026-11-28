use sqlx::{Sqlite, Transaction};

pub(super) const SOURCE: &str = include_str!("v10.rs");

/// Clean stale `antigravity` rows pointing to the retired
/// `~/.gemini/config/skills/` directory after moving Antigravity into the
/// global Universal Agents group (`~/.agents/skills/`).
///
/// Preserves `agents.is_enabled`, all `project_skill_installations`, non-legacy
/// rows, unrelated platforms, and all existing files on disk.
pub(crate) async fn apply(transaction: &mut Transaction<'_, Sqlite>) -> Result<(), sqlx::Error> {
    for statement in [
        "DELETE FROM skill_installations
         WHERE agent_id = 'antigravity'
           AND lower(replace(installed_path, '\\', '/')) LIKE '%/.gemini/config/skills/%'",
        "DELETE FROM agent_skill_observations
         WHERE agent_id = 'antigravity'
           AND (
             lower(replace(dir_path, '\\', '/')) LIKE '%/.gemini/config/skills'
             OR lower(replace(dir_path, '\\', '/')) LIKE '%/.gemini/config/skills/%'
             OR lower(replace(source_root, '\\', '/')) LIKE '%/.gemini/config/skills'
             OR lower(replace(source_root, '\\', '/')) LIKE '%/.gemini/config/skills/%'
           )",
        "DELETE FROM skill_update_inventory_entries
         WHERE agent_id = 'antigravity'",
    ] {
        sqlx::query(statement).execute(&mut **transaction).await?;
    }
    Ok(())
}
