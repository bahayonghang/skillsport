//! Offline harness: every log and database belongs to a TempDir, never HOME.
use std::path::PathBuf;
use std::time::Instant;

use super::*;
use crate::db::repos::{usage_file_cache_repo as cache_db, usage_repo as usage_db};

pub(super) struct SyntheticFiles {
    pub root: PathBuf,
    pub reads: Arc<std::sync::atomic::AtomicUsize>,
    pub parsed: Arc<std::sync::atomic::AtomicUsize>,
}

#[async_trait]
impl UsageProvider for SyntheticFiles {
    fn supports_file_delta(&self) -> bool {
        true
    }
    fn id(&self) -> &'static str {
        "codex"
    }
    fn display_name(&self) -> &'static str {
        "Codex CLI"
    }
    async fn available(&self, _: &Scope) -> Result<bool, UsageError> {
        Ok(true)
    }
    async fn collect(&self, scope: &Scope) -> Result<Vec<SkillCall>, UsageError> {
        Ok(self
            .collect_incremental(scope, ProviderFileCache::default())
            .await?
            .1)
    }
    async fn collect_incremental(
        &self,
        _: &Scope,
        mut cache: ProviderFileCache,
    ) -> Result<(ProviderFileCache, Vec<SkillCall>), UsageError> {
        let root = self.root.clone();
        let reads = self.reads.clone();
        let parsed = self.parsed.clone();
        crate::fs_util::run_blocking_fs_with(
            "synthetic usage",
            move || {
                let mut paths = std::fs::read_dir(root)
                    .unwrap()
                    .map(|e| e.unwrap().path())
                    .collect::<Vec<_>>();
                paths.sort();
                let mut calls = Vec::new();
                for path in paths {
                    let key = path.to_string_lossy().into_owned();
                    let (mtime, size) =
                        file_cache::fingerprint_from_metadata(std::fs::metadata(&path));
                    let raw = match cache.lookup(&key, mtime, size) {
                        Some(raw) => raw,
                        None => {
                            reads.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                            let content = std::fs::read_to_string(path).unwrap();
                            let raw = content
                                .lines()
                                .map(|s| serde_json::from_str::<SkillCall>(s).unwrap())
                                .collect::<Vec<_>>();
                            parsed.fetch_add(raw.len(), std::sync::atomic::Ordering::Relaxed);
                            cache.record_or_replay(key, mtime, size, raw)
                        }
                    };
                    calls.extend(raw);
                }
                Ok((cache, calls))
            },
            UsageError::task_join,
        )
        .await
    }
}

pub(super) fn generate(root: &std::path::Path, files: usize, rows: usize, skills: usize) -> usize {
    std::fs::create_dir_all(root).unwrap();
    let mut bytes = 0;
    for file in 0..files {
        let mut text = String::new();
        for row in 0..rows {
            let call = SkillCall {
                skill: format!("skill-{:05}", (file * rows + row) % skills),
                timestamp_ms: 1_790_000_000_000 + (file * rows + row) as i64,
                project: format!("project-{}", file % 78),
                session_id: format!("session-{file}"),
                source: "Codex CLI".into(),
            };
            text.push_str(&serde_json::to_string(&call).unwrap());
            text.push('\n');
        }
        bytes += text.len();
        std::fs::write(root.join(format!("{file:05}.jsonl")), text).unwrap();
    }
    bytes
}

fn percentiles(mut samples: Vec<f64>) -> (f64, f64) {
    samples.sort_by(f64::total_cmp);
    (
        samples[samples.len() / 2],
        samples[(samples.len() * 95 / 100).min(samples.len() - 1)],
    )
}

#[tokio::test]
#[ignore = "offline synthetic benchmark; explicitly opt in"]
async fn usage_bench_synthetic_pipeline() {
    let files = std::env::var("USAGE_SYNTHETIC_FILES")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(100);
    let rows = std::env::var("USAGE_SYNTHETIC_ROWS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(100);
    assert!(files <= 5000 && files * rows <= 1_000_000);
    let temp = tempfile::TempDir::new().unwrap();
    let root = temp.path().join("logs");
    let started = Instant::now();
    let bytes = generate(&root, files, rows, 1000);
    eprintln!(
        "SYNTH fixture seed=ordinal files={files} rows={rows} bytes={bytes} generate_ms={:.3}",
        started.elapsed().as_secs_f64() * 1000.0
    );
    let reads = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let parsed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let variant = if std::env::var_os("USAGE_SYNTHETIC_BASELINE").is_some() {
        "baseline"
    } else {
        "after"
    };
    eprintln!("SYNTH variant={variant} pid={}", std::process::id());
    for storage in ["memory", "file-wal"] {
        if std::env::var("USAGE_SYNTHETIC_STORAGE").is_ok_and(|requested| requested != storage) {
            continue;
        }
        let pool = if storage == "memory" {
            crate::test_support::mem_pool().await
        } else {
            // Production file pool ensures WAL and per-connection foreign keys.
            crate::db::open_database(&temp.path().join("bench.sqlite"))
                .await
                .unwrap()
        };
        let mut warm = Vec::new();
        let mut page = Vec::new();
        let mut cold_samples = Vec::new();
        let mut serialize_samples = Vec::new();
        let mut payload_bytes = 0;
        for sample in 0..25 {
            // Reset application caches only. OS file cache is deliberately not flushed.
            for table in [
                "skill_call_candidates",
                "skill_call_file_cache",
                "skill_calls",
                "skill_call_providers",
                "skill_usage_metadata",
                "skill_call_scan_state",
            ] {
                sqlx::query(&format!("DELETE FROM {table}"))
                    .execute(&pool)
                    .await
                    .unwrap();
            }
            let start = Instant::now();
            let cold = measure_refresh(
                &pool,
                &Scope::Local,
                true,
                vec![Box::new(SyntheticFiles {
                    root: root.clone(),
                    reads: reads.clone(),
                    parsed: parsed.clone(),
                })],
            )
            .await
            .unwrap();
            assert_eq!(cold.calls_written, (files * rows) as i64);
            if sample >= 5 {
                cold_samples.push(start.elapsed().as_secs_f64() * 1000.0);
            }
        }
        reads.store(0, std::sync::atomic::Ordering::Relaxed);
        parsed.store(0, std::sync::atomic::Ordering::Relaxed);
        for sample in 0..25 {
            let start = Instant::now();
            let summary = measure_refresh(
                &pool,
                &Scope::Local,
                true,
                vec![Box::new(SyntheticFiles {
                    root: root.clone(),
                    reads: reads.clone(),
                    parsed: parsed.clone(),
                })],
            )
            .await
            .unwrap();
            assert_eq!(summary.calls_written, (files * rows) as i64);
            if sample >= 5 {
                warm.push(start.elapsed().as_secs_f64() * 1000.0);
            }
            let start = Instant::now();
            let snapshot = measure_page(&pool).await;
            assert_eq!(snapshot.overview.top_skills.len(), (files * rows).min(1000));
            assert_eq!(snapshot.recent.len(), 20);
            if sample >= 5 {
                page.push(start.elapsed().as_secs_f64() * 1000.0);
                let serialization = Instant::now();
                let bytes = serde_json::to_vec(&snapshot).unwrap();
                payload_bytes = bytes.len();
                serialize_samples.push(serialization.elapsed().as_secs_f64() * 1000.0);
            }
        }
        let start = Instant::now();
        assert!(
            measure_refresh(
                &pool,
                &Scope::Local,
                false,
                vec![Box::new(SyntheticFiles {
                    root: root.clone(),
                    reads: reads.clone(),
                    parsed: parsed.clone()
                })]
            )
            .await
            .unwrap()
            .cached
        );
        let ttl_ms = start.elapsed().as_secs_f64() * 1000.0;
        eprintln!("SYNTH {storage} raw_cold_ms={cold_samples:?} raw_warm_ms={warm:?} raw_page_ms={page:?}");
        eprintln!("SYNTH {storage} cold_p50_p95_ms={:?} warm_p50_p95_ms={:?} page_p50_p95_ms={:?} ttl_ms={ttl_ms:.3} warm_reads={} warm_parsed={}",percentiles(cold_samples),percentiles(warm),percentiles(page),reads.load(std::sync::atomic::Ordering::Relaxed),parsed.load(std::sync::atomic::Ordering::Relaxed));
        eprintln!("SYNTH {storage} serialize_p50_p95_ms={:?} payload_bytes={payload_bytes} raw_serialize_ms={serialize_samples:?}",percentiles(serialize_samples.clone()));
        let query_plan:Vec<(i64,i64,i64,String)>=sqlx::query_as("EXPLAIN QUERY PLAN SELECT timestamp_ms FROM skill_calls WHERE target_id=? AND (? IS NULL OR source=?) AND timestamp_ms>=? ORDER BY timestamp_ms").bind("local").bind(Some("Codex CLI")).bind(Some("Codex CLI")).bind(0i64).fetch_all(&pool).await.unwrap();
        eprintln!(
            "SYNTH {storage} heatmap_eqp={:?}",
            query_plan
                .iter()
                .map(|row| row.3.as_str())
                .collect::<Vec<_>>()
        );
        let prefix_plan:Vec<(i64,i64,i64,String)>=sqlx::query_as("EXPLAIN QUERY PLAN WITH offsets AS MATERIALIZED (SELECT file_key,COALESCE(SUM(json_array_length(calls_json)) OVER(ORDER BY observed_order ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS call_offset FROM skill_call_file_cache WHERE target_id=? AND provider=?) SELECT o.call_offset+CAST(j.key AS INTEGER)+1 FROM offsets o JOIN skill_call_file_cache f ON f.file_key=o.file_key,json_each(f.calls_json) j WHERE f.target_id=? AND f.provider=?").bind("local").bind("codex").bind("local").bind("codex").fetch_all(&pool).await.unwrap();
        eprintln!(
            "SYNTH {storage} cold_prefix_eqp={:?}",
            prefix_plan
                .iter()
                .map(|row| row.3.as_str())
                .collect::<Vec<_>>()
        );
        pool.close().await;
    }
}

// Frozen offline baseline; never registered as a product scan entry.
async fn baseline_refresh(
    pool: &DbPool,
    scope: &Scope,
    force: bool,
    providers: Vec<Box<dyn UsageProvider>>,
) -> Result<RefreshSummary, UsageError> {
    let target_id = scope.target_id();
    let now_ms = Utc::now().timestamp_millis();

    // 1) 缓存判定
    if !force {
        if let Some(last) = usage_db::get_last_scan_ms(pool, &target_id).await? {
            if now_ms - last < CACHE_TTL_MS {
                return Ok(RefreshSummary {
                    cached: true,
                    calls_written: 0,
                    providers_available: 0,
                    scanned_at_ms: last,
                });
            }
        }
    }

    // 2) 并发跑全部 provider。Local scope 走增量扫描（skill_call_file_cache
    //    指纹 diff，未变文件零磁盘 IO）；Remote scope 保持既有全量路径。
    let local_scan = !scope.is_remote();
    let futures = providers.iter().map(|p| {
        let target_id = target_id.clone();
        async move {
            match p.available(scope).await {
                Ok(false) => {
                    // 数据源整体消失 → 仅本地清空缓存行，避免目录复活时拿陈旧指纹对错号。
                    if local_scan
                        && cache_db::delete_file_cache_for_provider(pool, &target_id, p.id())
                            .await
                            .is_err()
                    {
                        tracing::warn!(
                            target_id = %target_id,
                            provider = p.id(),
                            "usage file cache cleanup failed"
                        );
                    }
                    return ProviderCollectResult::Ready {
                        id: p.id(),
                        display_name: p.display_name(),
                        available: false,
                        calls: Vec::new(),
                    };
                }
                Err(error) if error.is_target_fatal() => {
                    tracing::warn!(
                        target_id = %target_id,
                        provider = p.id(),
                        code = error.stable_code(),
                        retryable = error.retryable(),
                        "usage provider availability failed"
                    );
                    return ProviderCollectResult::TargetFatal {
                        provider_id: p.id(),
                        error,
                    };
                }
                Err(error) => {
                    tracing::warn!(
                        target_id = %target_id,
                        provider = p.id(),
                        code = error.stable_code(),
                        retryable = error.retryable(),
                        "usage provider availability failed"
                    );
                    return ProviderCollectResult::Ready {
                        id: p.id(),
                        display_name: p.display_name(),
                        available: false,
                        calls: Vec::new(),
                    };
                }
                Ok(true) => {}
            }
            let collected = if local_scan {
                baseline_collect_local_incremental(pool, &target_id, p.as_ref(), scope).await
            } else {
                p.collect(scope).await
            };
            match collected {
                Ok(calls) => ProviderCollectResult::Ready {
                    id: p.id(),
                    display_name: p.display_name(),
                    available: true,
                    calls,
                },
                Err(error) if error.is_target_fatal() => {
                    tracing::warn!(
                        target_id = %target_id,
                        provider = p.id(),
                        code = error.stable_code(),
                        retryable = error.retryable(),
                        "usage provider collect failed"
                    );
                    ProviderCollectResult::TargetFatal {
                        provider_id: p.id(),
                        error,
                    }
                }
                Err(error) => {
                    tracing::warn!(
                        target_id = %target_id,
                        provider = p.id(),
                        code = error.stable_code(),
                        retryable = error.retryable(),
                        "usage provider collect failed"
                    );
                    ProviderCollectResult::Ready {
                        id: p.id(),
                        display_name: p.display_name(),
                        available: false,
                        calls: Vec::new(),
                    }
                }
            }
        }
    });
    let outcomes = join_all(futures).await;
    let mut ready = Vec::with_capacity(outcomes.len());
    let mut fatal = None;
    for outcome in outcomes {
        match outcome {
            ProviderCollectResult::TargetFatal { provider_id, error } => {
                if fatal.is_none() {
                    tracing::warn!(
                        target_id = %target_id,
                        provider = provider_id,
                        code = error.stable_code(),
                        retryable = error.retryable(),
                        "usage refresh aborted"
                    );
                    fatal = Some(error);
                }
            }
            ready_outcome @ ProviderCollectResult::Ready { .. } => ready.push(ready_outcome),
        }
    }
    if let Some(error) = fatal {
        return Err(error);
    }

    // 3) 平展为落库形态。此处已确认没有 target-fatal remote error。
    let mut all_calls: Vec<NewSkillCall> = Vec::new();
    let mut provider_outcomes: Vec<ProviderScanOutcome> = Vec::with_capacity(ready.len());
    let mut providers_available = 0i64;
    for outcome in ready {
        let ProviderCollectResult::Ready {
            id,
            display_name,
            available,
            calls,
        } = outcome
        else {
            unreachable!("target-fatal outcomes already returned");
        };
        if available {
            providers_available += 1;
        }
        provider_outcomes.push(ProviderScanOutcome {
            provider_id: id.to_string(),
            display_name: display_name.to_string(),
            available,
            call_count: calls.len() as i64,
        });
        for c in calls {
            all_calls.push(NewSkillCall {
                skill: c.skill,
                timestamp_ms: c.timestamp_ms,
                project: c.project,
                session_id: c.session_id,
                source: c.source,
            });
        }
    }

    let calls_written = all_calls.len() as i64;
    let scan_completed_ms = Utc::now().timestamp_millis();

    let mut skill_names = all_calls
        .iter()
        .map(|call| call.skill.clone())
        .collect::<Vec<_>>();
    skill_names.sort();
    skill_names.dedup();
    let normalized_names = skill_names
        .iter()
        .map(|name| name.trim().to_lowercase())
        .collect::<Vec<_>>();
    let candidates = usage_db::list_usage_skill_candidates(pool, &normalized_names).await?;
    let resolved = enrichment::resolve_usage_skills(&skill_names, &candidates);
    let mut paths = resolved
        .iter()
        .filter_map(|item| item.file_path.clone())
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    let content_by_path = if paths.is_empty() {
        Default::default()
    } else {
        match scope.fs_backend().read_many_to_strings(&paths).await {
            Ok(content) => content,
            Err(_error) => {
                tracing::warn!("usage Skill.md enrichment read failed");
                Default::default()
            }
        }
    };
    let metadata = enrichment::build_usage_metadata(
        &resolved,
        &content_by_path,
        crate::services::resource_budget::ResourceBudget::default_skill(),
    );

    // 4) 事务原子替换
    usage_db::replace_calls_for_target(
        pool,
        &target_id,
        &all_calls,
        &provider_outcomes,
        &metadata,
        scan_completed_ms,
    )
    .await?;

    Ok(RefreshSummary {
        cached: false,
        calls_written,
        providers_available,
        scanned_at_ms: scan_completed_ms,
    })
}

async fn measure_refresh(
    pool: &DbPool,
    scope: &Scope,
    force: bool,
    providers: Vec<Box<dyn UsageProvider>>,
) -> Result<RefreshSummary, UsageError> {
    if std::env::var_os("USAGE_SYNTHETIC_BASELINE").is_some() {
        baseline_refresh(pool, scope, force, providers).await
    } else {
        super::refresh_with_providers(pool, scope, force, providers).await
    }
}

async fn baseline_collect_local_incremental(
    pool: &DbPool,
    target_id: &str,
    provider: &dyn UsageProvider,
    scope: &Scope,
) -> Result<Vec<SkillCall>, UsageError> {
    let cache = match cache_db::list_file_cache_rows(pool, target_id, provider.id()).await {
        Ok(rows) => ProviderFileCache::from_rows(rows),
        Err(_error) => {
            tracing::warn!(
                provider = provider.id(),
                "usage file cache load failed; falling back to full scan"
            );
            ProviderFileCache::default()
        }
    };

    let (cache, calls) = provider.collect_incremental(scope, cache).await?;

    let vanished = cache.vanished_paths();
    if !vanished.is_empty()
        && cache_db::delete_file_cache_rows(pool, target_id, provider.id(), &vanished)
            .await
            .is_err()
    {
        tracing::warn!(provider = provider.id(), "usage file cache prune failed");
    }

    if !cache.upserts().is_empty() {
        let upserts: Vec<db::NewSkillCallFileCache> = cache
            .upserts()
            .iter()
            .map(|item| db::NewSkillCallFileCache {
                file_path: item.file_path.clone(),
                mtime_ms: item.mtime_ms,
                size: item.size,
                calls_json: serde_json::to_string(&item.calls).unwrap_or_else(|_| "[]".to_string()),
            })
            .collect();
        let scanned_at_ms = Utc::now().timestamp_millis();
        if cache_db::upsert_file_cache_rows(pool, target_id, provider.id(), &upserts, scanned_at_ms)
            .await
            .is_err()
        {
            tracing::warn!(provider = provider.id(), "usage file cache upsert failed");
        }
    }

    Ok(calls)
}

async fn baseline_overview(
    pool: &DbPool,
    target_id: &str,
    source: Option<&str>,
    top_skills_limit: usize,
) -> Result<aggregate::UsageOverview, UsageError> {
    let kpis_row = usage_db::get_usage_kpis(pool, target_id, source).await?;
    let top_skill_rows =
        usage_db::list_top_skills(pool, target_id, source, top_skills_limit).await?;
    let metadata = usage_db::list_usage_metadata(pool, target_id)
        .await?
        .into_iter()
        .map(|item| (item.skill.clone(), item))
        .collect::<HashMap<_, _>>();
    let now_ms = Utc::now().timestamp_millis();
    let cutoff_ms = now_ms - (16 * 7 + 1) * 86_400_000;
    let timestamps = usage_db::list_timestamps_since(pool, target_id, source, cutoff_ms).await?;
    let last_scan_ms = usage_db::get_last_scan_ms(pool, target_id).await?;

    Ok(aggregate::UsageOverview {
        kpis: aggregate::UsageKpis {
            total_calls: kpis_row.total_calls,
            unique_skills: kpis_row.unique_skills,
            unique_projects: kpis_row.unique_projects,
            unique_sources: kpis_row.unique_sources,
            unique_sessions: kpis_row.unique_sessions,
        },
        top_skills: top_skill_rows
            .into_iter()
            .map(|row| {
                let identity = metadata.get(&row.skill);
                aggregate::SkillUsageSummary {
                    skill: row.skill,
                    count: row.count,
                    projects: row.projects,
                    sessions: row.sessions,
                    last_used_ms: row.last_used_ms,
                    match_status: identity
                        .map(|item| UsageSkillMatchStatus::from_db(&item.match_status))
                        .unwrap_or(UsageSkillMatchStatus::Unmatched),
                    resolved_skill_id: identity.and_then(|item| item.resolved_skill_id.clone()),
                    static_token_estimate: identity.and_then(|item| item.static_token_estimate),
                    static_byte_count: identity.and_then(|item| item.static_byte_count),
                }
            })
            .collect(),
        heatmap: aggregate::heatmap_grid_16w_from_timestamps(
            &timestamps,
            now_ms,
            &aggregate::SystemLocalDayResolver,
        ),
        last_scan_ms,
    })
}

async fn baseline_recent(
    pool: &DbPool,
    target_id: &str,
    source: Option<&str>,
    limit: i64,
) -> Result<Vec<aggregate::RecentSkillCall>, UsageError> {
    let rows = usage_db::list_recent_calls(pool, target_id, source, limit).await?;
    let metadata = usage_db::list_usage_metadata(pool, target_id)
        .await?
        .into_iter()
        .map(|item| (item.skill.clone(), item))
        .collect::<HashMap<_, _>>();

    Ok(rows
        .into_iter()
        .map(|row| {
            let identity = metadata.get(&row.skill);
            aggregate::RecentSkillCall {
                skill: row.skill,
                timestamp_ms: row.timestamp_ms,
                project: row.project,
                session_id: row.session_id,
                source: row.source,
                match_status: identity
                    .map(|item| UsageSkillMatchStatus::from_db(&item.match_status))
                    .unwrap_or(UsageSkillMatchStatus::Unmatched),
                resolved_skill_id: identity.and_then(|item| item.resolved_skill_id.clone()),
            }
        })
        .collect())
}

async fn measure_page(pool: &DbPool) -> UsagePageSnapshot {
    if std::env::var_os("USAGE_SYNTHETIC_BASELINE").is_some() {
        UsagePageSnapshot {
            overview: baseline_overview(pool, "local", None, 0).await.unwrap(),
            recent: baseline_recent(pool, "local", None, 20).await.unwrap(),
            providers: list_provider_health(pool, "local").await.unwrap(),
        }
    } else {
        build_page(pool, "local", None).await.unwrap()
    }
}

#[tokio::test]
async fn usage_synthetic_warm_and_file_delta_have_zero_unrelated_reads_writes() {
    use std::sync::atomic::Ordering;
    let directory = tempfile::TempDir::new().unwrap();
    let root = directory.path().join("logs");
    generate(&root, 2, 3, 6);
    let pool = crate::test_support::mem_pool().await;
    let reads = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let parsed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let provider = || SyntheticFiles {
        root: root.clone(),
        reads: reads.clone(),
        parsed: parsed.clone(),
    };
    refresh_with_providers(&pool, &Scope::Local, true, vec![Box::new(provider())])
        .await
        .unwrap();
    let before = usage_db::list_calls_for_target(&pool, "local")
        .await
        .unwrap();
    assert_eq!(reads.load(Ordering::Relaxed), 2);
    assert_eq!(parsed.load(Ordering::Relaxed), 6);
    sqlx::query("CREATE TABLE fact_mutations(kind TEXT)")
        .execute(&pool)
        .await
        .unwrap();
    for (event, kind) in [
        ("INSERT", "insert"),
        ("DELETE", "delete"),
        ("UPDATE", "update"),
    ] {
        sqlx::query(&format!("CREATE TRIGGER observe_{kind} AFTER {event} ON skill_calls BEGIN INSERT INTO fact_mutations VALUES('{kind}'); END")).execute(&pool).await.unwrap();
    }
    // Invalid legacy payload must never be selected/decoded on fingerprint hits.
    sqlx::query("UPDATE skill_call_file_cache SET calls_json='invalid-json'")
        .execute(&pool)
        .await
        .unwrap();
    reads.store(0, Ordering::Relaxed);
    parsed.store(0, Ordering::Relaxed);
    refresh_with_providers(&pool, &Scope::Local, true, vec![Box::new(provider())])
        .await
        .unwrap();
    assert_eq!(reads.load(Ordering::Relaxed), 0);
    assert_eq!(parsed.load(Ordering::Relaxed), 0);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM fact_mutations")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    let unchanged = before
        .iter()
        .filter(|c| c.session_id == "session-1")
        .cloned()
        .collect::<Vec<_>>();
    let path = root.join("00000.jsonl");
    let original = std::fs::read_to_string(&path).unwrap();
    let first = original.lines().next().unwrap();
    std::fs::write(&path, format!("{original}{first}\n")).unwrap();
    refresh_with_providers(&pool, &Scope::Local, true, vec![Box::new(provider())])
        .await
        .unwrap();
    assert_eq!(reads.load(Ordering::Relaxed), 1);
    assert_eq!(parsed.load(Ordering::Relaxed), 4);
    let after = usage_db::list_calls_for_target(&pool, "local")
        .await
        .unwrap();
    assert_eq!(after.len(), 7);
    for fact in &unchanged {
        assert!(after.contains(fact));
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM fact_mutations WHERE kind='insert'")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM fact_mutations WHERE kind!='insert'")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    std::fs::write(&path, format!("{first}\n")).unwrap();
    reads.store(0, Ordering::Relaxed);
    parsed.store(0, Ordering::Relaxed);
    refresh_with_providers(&pool, &Scope::Local, true, vec![Box::new(provider())])
        .await
        .unwrap();
    assert_eq!(reads.load(Ordering::Relaxed), 1);
    assert_eq!(
        usage_db::list_calls_for_target(&pool, "local")
            .await
            .unwrap()
            .len(),
        4
    );
    std::fs::remove_file(&path).unwrap();
    reads.store(0, Ordering::Relaxed);
    refresh_with_providers(&pool, &Scope::Local, true, vec![Box::new(provider())])
        .await
        .unwrap();
    assert_eq!(reads.load(Ordering::Relaxed), 0);
    assert_eq!(
        usage_db::list_calls_for_target(&pool, "local")
            .await
            .unwrap(),
        unchanged
    );
    std::fs::rename(root.join("00001.jsonl"), root.join("rotated.jsonl")).unwrap();
    refresh_with_providers(&pool, &Scope::Local, true, vec![Box::new(provider())])
        .await
        .unwrap();
    assert_eq!(reads.load(Ordering::Relaxed), 1);
    let mut actual = rows_to_skill_calls(
        usage_db::list_calls_for_target(&pool, "local")
            .await
            .unwrap(),
    )
    .into_iter()
    .map(|c| serde_json::to_string(&c).unwrap())
    .collect::<Vec<_>>();
    let mut oracle = provider()
        .collect(&Scope::Local)
        .await
        .unwrap()
        .into_iter()
        .map(|c| serde_json::to_string(&c).unwrap())
        .collect::<Vec<_>>();
    actual.sort();
    oracle.sort();
    assert_eq!(actual, oracle);
}
