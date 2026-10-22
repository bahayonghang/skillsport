use sqlx::{Sqlite, Transaction};

pub(super) const SOURCE: &str = include_str!("v8.rs");

/// Rebuildable local usage provenance. Existing facts remain intact until the
/// first successful scan establishes complete occurrence ownership.
pub(crate) async fn apply(transaction: &mut Transaction<'_, Sqlite>) -> Result<(), sqlx::Error> {
    for statement in [
        "ALTER TABLE skill_call_file_cache ADD COLUMN file_key TEXT",
        "ALTER TABLE skill_call_file_cache ADD COLUMN observed_order INTEGER NOT NULL DEFAULT 0",
        "CREATE UNIQUE INDEX idx_usage_file_key ON skill_call_file_cache(target_id, provider, file_key)",
        "ALTER TABLE skill_call_scan_state ADD COLUMN local_provenance_version INTEGER NOT NULL DEFAULT 0",
        "CREATE TABLE skill_call_candidates (
            target_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            file_key TEXT NOT NULL,
            occurrence_ordinal INTEGER NOT NULL CHECK (occurrence_ordinal >= 0),
            group_key TEXT NOT NULL,
            skill TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            project TEXT NOT NULL,
            session_id TEXT NOT NULL,
            source TEXT NOT NULL,
            fact_id INTEGER UNIQUE,
            PRIMARY KEY (target_id, provider, file_key, occurrence_ordinal),
            FOREIGN KEY (target_id, provider, file_key)
                REFERENCES skill_call_file_cache(target_id, provider, file_key) ON DELETE CASCADE,
            FOREIGN KEY (fact_id) REFERENCES skill_calls(id) ON DELETE SET NULL
        )",
        "CREATE INDEX idx_usage_candidate_group ON skill_call_candidates(target_id, provider, group_key)",
    ] {
        sqlx::query(statement).execute(&mut **transaction).await?;
    }
    Ok(())
}
