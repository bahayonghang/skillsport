//! Atomic local publication with occurrence provenance and affected-group reconciliation.
use std::collections::HashSet;

use sqlx::{QueryBuilder, Sqlite, SqliteConnection};

use crate::db::{DbPool, NewSkillUsageMetadata};
use crate::services::usage::delta::{
    group_key, FileChange, FileFingerprint, FileManifest, ProviderPlan,
};

pub async fn local_usage_ready(pool: &DbPool, target: &str) -> Result<bool, sqlx::Error> {
    let version: Option<(i64,)> = sqlx::query_as(
        "SELECT local_provenance_version FROM skill_call_scan_state WHERE target_id=?",
    )
    .bind(target)
    .fetch_optional(pool)
    .await?;
    Ok(version.is_some_and(|v| v.0 == 1))
}

pub async fn list_file_fingerprints(
    pool: &DbPool,
    target: &str,
    provider: &str,
) -> Result<Vec<FileFingerprint>, sqlx::Error> {
    sqlx::query_as("SELECT file_path,file_key,mtime_ms,size,observed_order FROM skill_call_file_cache WHERE target_id=? AND provider=?").bind(target).bind(provider).fetch_all(pool).await
}

/// Counts real fact mutations separately from the public complete-call summary.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct FactWrites {
    pub inserted: u64,
    pub deleted: u64,
}

pub async fn publish_local_scan(
    pool: &DbPool,
    target: &str,
    plans: Vec<ProviderPlan>,
    metadata: &[NewSkillUsageMetadata],
    scan_ms: i64,
    rebuild: bool,
) -> Result<(i64, FactWrites), sqlx::Error> {
    // Serialize SQLite publication before any SELECT; deferred read→write
    // upgrades can fail with SQLITE_BUSY_SNAPSHOT across independent targets.
    let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
    let mut writes = FactWrites::default();
    if rebuild {
        writes.deleted += sqlx::query("DELETE FROM skill_calls WHERE target_id=?")
            .bind(target)
            .execute(&mut *tx)
            .await?
            .rows_affected();
        sqlx::query("DELETE FROM skill_call_file_cache WHERE target_id=?")
            .bind(target)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM skill_call_providers WHERE target_id=?")
            .bind(target)
            .execute(&mut *tx)
            .await?;
    }
    let mut total = 0;
    for plan in plans {
        let previous: Option<(i64,)> = sqlx::query_as(
            "SELECT call_count FROM skill_call_providers WHERE target_id=? AND provider_id=?",
        )
        .bind(target)
        .bind(&plan.id)
        .fetch_optional(&mut *tx)
        .await?;
        let count = if plan.available {
            if let Some(files) = plan.files {
                reconcile_files(
                    &mut tx,
                    target,
                    &plan.id,
                    files,
                    previous.map_or(0, |v| v.0),
                    scan_ms,
                    &mut writes,
                )
                .await?
            } else {
                writes.deleted +=
                    sqlx::query("DELETE FROM skill_calls WHERE target_id=? AND source=?")
                        .bind(target)
                        .bind(&plan.display_name)
                        .execute(&mut *tx)
                        .await?
                        .rows_affected();
                sqlx::query("DELETE FROM skill_call_file_cache WHERE target_id=? AND provider=?")
                    .bind(target)
                    .bind(&plan.id)
                    .execute(&mut *tx)
                    .await?;
                for chunk in plan.whole_calls.chunks(100) {
                    let mut query = QueryBuilder::<Sqlite>::new("INSERT INTO skill_calls(target_id,skill,timestamp_ms,project,session_id,source) ");
                    query.push_values(chunk, |mut row, c| {
                        row.push_bind(target)
                            .push_bind(&c.skill)
                            .push_bind(c.timestamp_ms)
                            .push_bind(&c.project)
                            .push_bind(&c.session_id)
                            .push_bind(&c.source);
                    });
                    writes.inserted += query.build().execute(&mut *tx).await?.rows_affected();
                }
                plan.whole_calls.len() as i64
            }
        } else {
            writes.deleted += sqlx::query("DELETE FROM skill_calls WHERE target_id=? AND source=?")
                .bind(target)
                .bind(&plan.display_name)
                .execute(&mut *tx)
                .await?
                .rows_affected();
            sqlx::query("DELETE FROM skill_call_file_cache WHERE target_id=? AND provider=?")
                .bind(target)
                .bind(&plan.id)
                .execute(&mut *tx)
                .await?;
            0
        };
        total += count;
        sqlx::query("INSERT INTO skill_call_providers(target_id,provider_id,display_name,available,call_count,scanned_at) VALUES(?,?,?,?,?,?) ON CONFLICT(target_id,provider_id) DO UPDATE SET display_name=excluded.display_name,available=excluded.available,call_count=excluded.call_count,scanned_at=excluded.scanned_at")
            .bind(target).bind(&plan.id).bind(&plan.display_name).bind(plan.available).bind(count).bind(scan_ms).execute(&mut *tx).await?;
    }
    // Enrichment was prepared outside the writer transaction.
    for chunk in metadata.chunks(100) {
        let mut query = QueryBuilder::<Sqlite>::new("INSERT INTO skill_usage_metadata(target_id,skill,match_status,resolved_skill_id,static_token_estimate,static_byte_count,scanned_at_ms) ");
        query.push_values(chunk, |mut row, m| {
            row.push_bind(target)
                .push_bind(&m.skill)
                .push_bind(&m.match_status)
                .push_bind(&m.resolved_skill_id)
                .push_bind(m.static_token_estimate)
                .push_bind(m.static_byte_count)
                .push_bind(scan_ms);
        });
        query.push(" ON CONFLICT(target_id,skill) DO UPDATE SET match_status=excluded.match_status,resolved_skill_id=excluded.resolved_skill_id,static_token_estimate=excluded.static_token_estimate,static_byte_count=excluded.static_byte_count,scanned_at_ms=excluded.scanned_at_ms");
        query.build().execute(&mut *tx).await?;
    }
    // Newly removed names may have been part of the prepared metadata superset.
    sqlx::query("DELETE FROM skill_usage_metadata WHERE target_id=? AND NOT EXISTS(SELECT 1 FROM skill_calls c WHERE c.target_id=skill_usage_metadata.target_id AND c.skill=skill_usage_metadata.skill)").bind(target).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO skill_call_scan_state(target_id,last_full_scan_ms,local_provenance_version) VALUES(?,?,1) ON CONFLICT(target_id) DO UPDATE SET last_full_scan_ms=excluded.last_full_scan_ms,local_provenance_version=1").bind(target).bind(scan_ms).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok((total, writes))
}

async fn reconcile_files(
    conn: &mut SqliteConnection,
    target: &str,
    provider: &str,
    manifest: FileManifest,
    previous_count: i64,
    scan_ms: i64,
    writes: &mut FactWrites,
) -> Result<i64, sqlx::Error> {
    if manifest.existing.is_empty() {
        return super::usage_delta_insert::insert_new_files(
            conn,
            target,
            provider,
            &manifest.files,
            scan_ms,
            writes,
        )
        .await;
    }
    if manifest.files.len() == manifest.existing.len()
        && manifest.files.iter().all(|f| {
            matches!(f.change, FileChange::Unchanged)
                && manifest
                    .existing
                    .get(&f.path)
                    .is_some_and(|old| old.observed_order == f.order)
        })
    {
        return Ok(previous_count);
    }
    let new_paths = manifest
        .files
        .iter()
        .filter(|f| !matches!(f.change, FileChange::Unreadable))
        .map(|f| f.path.as_str())
        .collect::<HashSet<_>>();
    let removed = manifest
        .existing
        .values()
        .filter(|f| !new_paths.contains(f.file_path.as_str()))
        .collect::<Vec<_>>();
    let mut touched = removed
        .iter()
        .filter_map(|f| f.file_key.as_ref())
        .cloned()
        .collect::<HashSet<_>>();
    for file in &manifest.files {
        if !matches!(file.change, FileChange::Unchanged) {
            touched.insert(file.key.clone());
        }
    }
    // Inserting a new file shifts absolute ordinals but leaves old relative order intact.
    let mut old_order = manifest
        .existing
        .values()
        .filter(|f| new_paths.contains(f.file_path.as_str()))
        .collect::<Vec<_>>();
    old_order.sort_by_key(|f| f.observed_order);
    let new_order = manifest
        .files
        .iter()
        .filter(|f| {
            manifest.existing.contains_key(&f.path) && !matches!(f.change, FileChange::Unreadable)
        })
        .collect::<Vec<_>>();
    for (old, new) in old_order.iter().zip(&new_order) {
        if old.file_key.as_deref() != Some(&new.key) {
            if let Some(key) = &old.file_key {
                touched.insert(key.clone());
            }
            touched.insert(new.key.clone());
        }
    }
    if touched.is_empty()
        && manifest
            .files
            .iter()
            .all(|f| matches!(f.change, FileChange::Unchanged))
    {
        return Ok(previous_count);
    }

    for statement in [
        "DROP TABLE IF EXISTS temp.usage_affected", "DROP TABLE IF EXISTS temp.usage_old", "DROP TABLE IF EXISTS temp.usage_winners",
        "CREATE TEMP TABLE usage_affected(group_key TEXT PRIMARY KEY)",
        "CREATE TEMP TABLE usage_old(group_key TEXT PRIMARY KEY,fact_id INTEGER,skill TEXT,timestamp_ms INTEGER,project TEXT,session_id TEXT,source TEXT)",
        "CREATE TEMP TABLE usage_winners(group_key TEXT PRIMARY KEY,file_key TEXT,occurrence_ordinal INTEGER,skill TEXT,timestamp_ms INTEGER,project TEXT,session_id TEXT,source TEXT,fact_id INTEGER)",
        "CREATE INDEX usage_winner_occurrence ON usage_winners(file_key,occurrence_ordinal)",
        "CREATE INDEX usage_winner_fact ON usage_winners(fact_id)",
        "DROP TABLE IF EXISTS temp.usage_new_ids",
        "CREATE TEMP TABLE usage_new_ids(group_key TEXT PRIMARY KEY,fact_id INTEGER)",
    ] { sqlx::query(statement).execute(&mut *conn).await?; }
    let touched = touched.into_iter().collect::<Vec<_>>();
    for chunk in touched.chunks(800) {
        let mut q = QueryBuilder::<Sqlite>::new("INSERT OR IGNORE INTO usage_affected SELECT group_key FROM skill_call_candidates WHERE target_id=");
        q.push_bind(target)
            .push(" AND provider=")
            .push_bind(provider)
            .push(" AND file_key IN (");
        let mut list = q.separated(",");
        for key in chunk {
            list.push_bind(key);
        }
        list.push_unseparated(")");
        q.build().execute(&mut *conn).await?;
    }
    let mut new_groups = HashSet::new();
    for file in &manifest.files {
        if let FileChange::Parsed(calls) = &file.change {
            for (ordinal, call) in calls.iter().enumerate() {
                new_groups.insert(group_key(provider, file, ordinal, call));
            }
        }
    }
    let new_groups = new_groups.into_iter().collect::<Vec<_>>();
    for chunk in new_groups.chunks(800) {
        let mut q = QueryBuilder::<Sqlite>::new("INSERT OR IGNORE INTO usage_affected(group_key) ");
        q.push_values(chunk, |mut r, g| {
            r.push_bind(g);
        });
        q.build().execute(&mut *conn).await?;
    }
    sqlx::query("INSERT INTO usage_old SELECT c.group_key,c.fact_id,c.skill,c.timestamp_ms,c.project,c.session_id,c.source FROM usage_affected a CROSS JOIN skill_call_candidates c ON c.group_key=a.group_key WHERE c.target_id=? AND c.provider=? AND c.fact_id IS NOT NULL").bind(target).bind(provider).execute(&mut *conn).await?;
    let old_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM usage_old")
        .fetch_one(&mut *conn)
        .await?;
    sqlx::query("UPDATE skill_call_candidates SET fact_id=NULL WHERE target_id=? AND provider=? AND group_key IN(SELECT group_key FROM usage_affected)").bind(target).bind(provider).execute(&mut *conn).await?;
    let removed_paths = removed
        .iter()
        .map(|f| f.file_path.as_str())
        .collect::<Vec<_>>();
    for chunk in removed_paths.chunks(800) {
        let mut q =
            QueryBuilder::<Sqlite>::new("DELETE FROM skill_call_file_cache WHERE target_id=");
        q.push_bind(target)
            .push(" AND provider=")
            .push_bind(provider)
            .push(" AND file_path IN(");
        let mut list = q.separated(",");
        for path in chunk {
            list.push_bind(path);
        }
        list.push_unseparated(")");
        q.build().execute(&mut *conn).await?;
    }
    let changed = manifest
        .files
        .iter()
        .filter(|f| matches!(f.change, FileChange::Parsed(_)))
        .collect::<Vec<_>>();
    let changed_keys = changed.iter().map(|f| f.key.as_str()).collect::<Vec<_>>();
    for chunk in changed_keys.chunks(800) {
        let mut q =
            QueryBuilder::<Sqlite>::new("DELETE FROM skill_call_candidates WHERE target_id=");
        q.push_bind(target)
            .push(" AND provider=")
            .push_bind(provider)
            .push(" AND file_key IN(");
        let mut list = q.separated(",");
        for key in chunk {
            list.push_bind(key);
        }
        list.push_unseparated(")");
        q.build().execute(&mut *conn).await?;
    }
    // Cache UPSERT preserves the opaque key; OR REPLACE would cascade candidates.
    for chunk in changed.chunks(80) {
        let payloads = chunk
            .iter()
            .map(|f| {
                if let FileChange::Parsed(calls) = &f.change {
                    serde_json::to_string(calls).expect("calls")
                } else {
                    unreachable!()
                }
            })
            .collect::<Vec<_>>();
        let mut q=QueryBuilder::<Sqlite>::new("INSERT INTO skill_call_file_cache(target_id,provider,file_path,mtime_ms,size,calls_json,scanned_at_ms,file_key,observed_order) ");
        q.push_values(chunk.iter().zip(&payloads), |mut r, (f, json)| {
            r.push_bind(target)
                .push_bind(provider)
                .push_bind(&f.path)
                .push_bind(f.mtime_ms)
                .push_bind(f.size)
                .push_bind(json)
                .push_bind(scan_ms)
                .push_bind(&f.key)
                .push_bind(f.order);
        });
        q.push(" ON CONFLICT(target_id,provider,file_path) DO UPDATE SET mtime_ms=excluded.mtime_ms,size=excluded.size,calls_json=excluded.calls_json,scanned_at_ms=excluded.scanned_at_ms,file_key=excluded.file_key,observed_order=excluded.observed_order");
        q.build().execute(&mut *conn).await?;
    }
    for file in &manifest.files {
        if matches!(file.change, FileChange::Unchanged)
            && manifest
                .existing
                .get(&file.path)
                .is_some_and(|old| old.observed_order != file.order)
        {
            sqlx::query("UPDATE skill_call_file_cache SET observed_order=? WHERE target_id=? AND provider=? AND file_key=?").bind(file.order).bind(target).bind(provider).bind(&file.key).execute(&mut *conn).await?;
        }
    }
    // One vector of references, no full candidate/call copies. All raw losers survive.
    let occurrences = changed
        .iter()
        .flat_map(|file| {
            if let FileChange::Parsed(calls) = &file.change {
                calls
                    .iter()
                    .enumerate()
                    .map(|(ordinal, call)| (*file, ordinal, call))
                    .collect::<Vec<_>>()
            } else {
                unreachable!()
            }
        })
        .collect::<Vec<_>>();
    for chunk in occurrences.chunks(80) {
        let groups = chunk
            .iter()
            .map(|(f, o, c)| group_key(provider, f, *o, c))
            .collect::<Vec<_>>();
        let mut q=QueryBuilder::<Sqlite>::new("INSERT INTO skill_call_candidates(target_id,provider,file_key,occurrence_ordinal,group_key,skill,timestamp_ms,project,session_id,source) ");
        q.push_values(chunk.iter().zip(&groups), |mut r, ((f, o, c), g)| {
            r.push_bind(target)
                .push_bind(provider)
                .push_bind(&f.key)
                .push_bind(*o as i64)
                .push_bind(g)
                .push_bind(&c.skill)
                .push_bind(c.timestamp_ms)
                .push_bind(&c.project)
                .push_bind(&c.session_id)
                .push_bind(&c.source);
        });
        q.build().execute(&mut *conn).await?;
    }
    sqlx::query("INSERT INTO usage_winners SELECT group_key,file_key,occurrence_ordinal,skill,timestamp_ms,project,session_id,source,NULL FROM (SELECT c.*,ROW_NUMBER() OVER(PARTITION BY c.group_key ORDER BY f.observed_order,c.occurrence_ordinal) AS rank FROM usage_affected a CROSS JOIN skill_call_candidates c ON c.group_key=a.group_key JOIN skill_call_file_cache f ON f.target_id=c.target_id AND f.provider=c.provider AND f.file_key=c.file_key WHERE c.target_id=? AND c.provider=?) WHERE rank=1").bind(target).bind(provider).execute(&mut *conn).await?;
    // Preserve facts with identical business values even when their winning file changes.
    sqlx::query("UPDATE usage_winners SET fact_id=(SELECT o.fact_id FROM usage_old o WHERE o.group_key=usage_winners.group_key AND o.skill=usage_winners.skill AND o.timestamp_ms=usage_winners.timestamp_ms AND o.project=usage_winners.project AND o.session_id=usage_winners.session_id AND o.source=usage_winners.source)").execute(&mut *conn).await?;
    writes.deleted += sqlx::query("DELETE FROM skill_calls WHERE id IN(SELECT fact_id FROM usage_old) AND id NOT IN(SELECT fact_id FROM usage_winners WHERE fact_id IS NOT NULL)").execute(&mut *conn).await?.rows_affected();
    // Reserve IDs in one batch, avoiding a SQL roundtrip per occurrence/group.
    let (max_id,): (i64,) = sqlx::query_as("SELECT MAX(COALESCE((SELECT MAX(id) FROM skill_calls),0),COALESCE((SELECT seq FROM sqlite_sequence WHERE name='skill_calls'),0))").fetch_one(&mut *conn).await?;
    sqlx::query("INSERT INTO usage_new_ids SELECT group_key,?+ROW_NUMBER() OVER(ORDER BY group_key) FROM usage_winners WHERE fact_id IS NULL").bind(max_id).execute(&mut *conn).await?;
    sqlx::query("UPDATE usage_winners SET fact_id=(SELECT fact_id FROM usage_new_ids n WHERE n.group_key=usage_winners.group_key) WHERE fact_id IS NULL").execute(&mut *conn).await?;
    writes.inserted += sqlx::query("INSERT INTO skill_calls(id,target_id,skill,timestamp_ms,project,session_id,source) SELECT w.fact_id,?,w.skill,w.timestamp_ms,w.project,w.session_id,w.source FROM usage_winners w WHERE NOT EXISTS(SELECT 1 FROM skill_calls c WHERE c.id=w.fact_id)").bind(target).execute(&mut *conn).await?.rows_affected();
    sqlx::query("UPDATE skill_call_candidates SET fact_id=(SELECT w.fact_id FROM usage_winners w WHERE w.file_key=skill_call_candidates.file_key AND w.occurrence_ordinal=skill_call_candidates.occurrence_ordinal) WHERE target_id=? AND provider=? AND group_key IN(SELECT group_key FROM usage_affected)").bind(target).bind(provider).execute(&mut *conn).await?;
    let new_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM usage_winners")
        .fetch_one(&mut *conn)
        .await?;
    Ok(previous_count - old_count.0 + new_count.0)
}
