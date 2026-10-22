//! Batched initial provenance publication: no per-group SQL or payload copies.
use super::usage_delta_repo::FactWrites;
use crate::services::usage::delta::{group_key, FileChange, ObservedFile};
use sqlx::{QueryBuilder, Sqlite, SqliteConnection};
use std::collections::HashSet;

pub(super) async fn insert_new_files(
    conn: &mut SqliteConnection,
    target: &str,
    provider: &str,
    files: &[ObservedFile],
    scan_ms: i64,
    writes: &mut FactWrites,
) -> Result<i64, sqlx::Error> {
    let readable = files
        .iter()
        .filter(|f| matches!(f.change, FileChange::Parsed(_)))
        .collect::<Vec<_>>();
    for chunk in readable.chunks(80) {
        let payloads = chunk
            .iter()
            .map(|f| {
                if let FileChange::Parsed(c) = &f.change {
                    serde_json::to_string(c).expect("calls")
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
        q.build().execute(&mut *conn).await?;
    }
    let (mut id,):(i64,)=sqlx::query_as("SELECT MAX(COALESCE((SELECT MAX(id) FROM skill_calls),0),COALESCE((SELECT seq FROM sqlite_sequence WHERE name='skill_calls'),0))").fetch_one(&mut *conn).await?;
    let initial_id = id;
    if !matches!(provider, "claude-code" | "grok") {
        // Expand the existing normalized JSON in SQLite, avoiding per-field
        // SQLx binding/copies and another full scratch-table materialization.
        let inserted = sqlx::query(
            "INSERT INTO skill_calls(id,target_id,skill,timestamp_ms,project,session_id,source)
             SELECT ?+ROW_NUMBER() OVER(ORDER BY f.observed_order,CAST(j.key AS INTEGER)),
                    f.target_id,json_extract(j.value,'$.skill'),json_extract(j.value,'$.timestampMs'),
                    json_extract(j.value,'$.project'),json_extract(j.value,'$.sessionId'),json_extract(j.value,'$.source')
             FROM skill_call_file_cache f,json_each(f.calls_json) j
             WHERE f.target_id=? AND f.provider=?"
        ).bind(initial_id).bind(target).bind(provider).execute(&mut *conn).await?.rows_affected();
        sqlx::query(
            "INSERT INTO skill_call_candidates(target_id,provider,file_key,occurrence_ordinal,group_key,
                                               skill,timestamp_ms,project,session_id,source,fact_id)
             SELECT f.target_id,f.provider,f.file_key,CAST(j.key AS INTEGER),json_array(f.file_key,CAST(j.key AS INTEGER)),
                    json_extract(j.value,'$.skill'),json_extract(j.value,'$.timestampMs'),json_extract(j.value,'$.project'),
                    json_extract(j.value,'$.sessionId'),json_extract(j.value,'$.source'),
                    ?+ROW_NUMBER() OVER(ORDER BY f.observed_order,CAST(j.key AS INTEGER))
             FROM skill_call_file_cache f,json_each(f.calls_json) j
             WHERE f.target_id=? AND f.provider=?"
        ).bind(initial_id).bind(target).bind(provider).execute(&mut *conn).await?;
        writes.inserted += inserted;
        return Ok(inserted as i64);
    }
    let mut seen = HashSet::new();
    let dedup = matches!(provider, "claude-code" | "grok");
    let mut occurrences = Vec::new();
    for file in readable {
        if let FileChange::Parsed(calls) = &file.change {
            for (ordinal, call) in calls.iter().enumerate() {
                let group = group_key(provider, file, ordinal, call);
                let winner = !dedup || seen.insert(group.clone());
                let fact_id = if winner {
                    id += 1;
                    Some(id)
                } else {
                    None
                };
                occurrences.push((file, ordinal, call, group, fact_id));
            }
        }
    }
    for chunk in occurrences.chunks(80) {
        // Facts must exist before the candidate FK can point at them.
        let winners = chunk.iter().filter(|r| r.4.is_some()).collect::<Vec<_>>();
        if !winners.is_empty() {
            let mut q=QueryBuilder::<Sqlite>::new("INSERT INTO skill_calls(id,target_id,skill,timestamp_ms,project,session_id,source) ");
            q.push_values(winners, |mut r, (_, _, c, _, id)| {
                r.push_bind(*id)
                    .push_bind(target)
                    .push_bind(&c.skill)
                    .push_bind(c.timestamp_ms)
                    .push_bind(&c.project)
                    .push_bind(&c.session_id)
                    .push_bind(&c.source);
            });
            writes.inserted += q.build().execute(&mut *conn).await?.rows_affected();
        }
        let mut q=QueryBuilder::<Sqlite>::new("INSERT INTO skill_call_candidates(target_id,provider,file_key,occurrence_ordinal,group_key,skill,timestamp_ms,project,session_id,source,fact_id) ");
        q.push_values(chunk, |mut r, (f, o, c, g, id)| {
            r.push_bind(target)
                .push_bind(provider)
                .push_bind(&f.key)
                .push_bind(*o as i64)
                .push_bind(g)
                .push_bind(&c.skill)
                .push_bind(c.timestamp_ms)
                .push_bind(&c.project)
                .push_bind(&c.session_id)
                .push_bind(&c.source)
                .push_bind(*id);
        });
        q.build().execute(&mut *conn).await?;
    }
    Ok(id - initial_id)
}
