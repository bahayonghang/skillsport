use sqlx::{Sqlite, Transaction};

pub(super) const SOURCE: &str = include_str!("v9.rs");

/// Unify `antigravity-cli` into `antigravity` (`~/.gemini/config/skills`),
/// preserving user enablement and deduplicating project skill records.
pub(crate) async fn apply(transaction: &mut Transaction<'_, Sqlite>) -> Result<(), sqlx::Error> {
    for statement in [
        "UPDATE agents
         SET is_enabled = 1
         WHERE id = 'antigravity'
           AND EXISTS (
             SELECT 1 FROM agents WHERE id = 'antigravity-cli' AND is_enabled = 1
           )",
        "DELETE FROM skill_installations
         WHERE agent_id = 'antigravity-cli'
            OR (
              agent_id = 'antigravity'
              AND lower(replace(installed_path, '\\', '/')) LIKE '%/.gemini/antigravity/skills/%'
            )",
        "DELETE FROM agent_skill_observations
         WHERE agent_id = 'antigravity-cli'
            OR (
              agent_id = 'antigravity'
              AND (
                lower(replace(dir_path, '\\', '/')) LIKE '%/.gemini/antigravity/skills/%'
                OR lower(replace(source_root, '\\', '/')) LIKE '%/.gemini/antigravity/skills'
                OR lower(replace(source_root, '\\', '/')) LIKE '%/.gemini/antigravity/skills/%'
              )
            )",
        "DELETE FROM project_skill_installations
         WHERE agent_id = 'antigravity-cli'
           AND EXISTS (
             SELECT 1
             FROM project_skill_installations existing
             WHERE existing.project_id = project_skill_installations.project_id
               AND existing.skill_id = project_skill_installations.skill_id
               AND existing.agent_id = 'antigravity'
           )",
        "UPDATE project_skill_installations
         SET agent_id = 'antigravity'
         WHERE agent_id = 'antigravity-cli'",
        "DELETE FROM skill_update_inventory_entries
         WHERE agent_id = 'antigravity-cli'",
        "DELETE FROM agents
         WHERE id = 'antigravity-cli' AND is_builtin = 1",
    ] {
        sqlx::query(statement).execute(&mut **transaction).await?;
    }
    Ok(())
}
