# Skill Usage Analytics Contract

## 1. Scope / Trigger

Read this spec before changing `services/usage`, usage DB tables, provider refresh,
the unused-skills report, or the usage Tauri commands. It protects three invariants:
provider logs remain immutable facts, skill identity is never guessed, and calendar
buckets follow the machine running SkillPort rather than UTC.

## 2. Signatures

```text
skill_calls(target_id, skill, timestamp_ms, project, session_id, source)

skill_usage_metadata(
  target_id, skill, match_status,
  resolved_skill_id?, static_token_estimate?, static_byte_count?, scanned_at_ms
)
PRIMARY KEY (target_id, skill)

skill_call_file_cache(..., file_key?, observed_order)
skill_call_scan_state(..., local_provenance_version)
skill_call_candidates(
  target_id, provider, file_key, occurrence_ordinal, group_key,
  skill, timestamp_ms, project, session_id, source, fact_id?
)
PRIMARY KEY (target_id, provider, file_key, occurrence_ordinal)

usage_get_overview(topSkillsLimit?, source?) -> UsageOverview
usage_get_page(source?) -> { overview, recent, providers }
usage_refresh(force, source?) -> UsageRefreshResult
usage_get_recent(limit?, source?) -> RecentSkillCall[]
usage_get_skill_detail(skill, source?) -> SkillUsageDetail
usage_resolve_skill_id(skillName) -> string?
usage_get_unused_skills(source?, thresholdDays?) -> UnusedSkillsReport
usage_get_skill_counts(skills, days: u32) -> { skill -> count }
usage_get_skill_usage_stats(skills, days: u32?) -> { skill -> { count, lastUsedMs } }

UnusedAgentInstall {
  agentId, linkType, installedPath, hasPendingRecovery
}
UnusedPlatformInstall {
  agentId, rowId?, skillId, linkType, sourceKind?, isReadOnly,
  installedPath, hasPendingRecovery
}
```

`replace_calls_for_target` remains the full-replacement boundary for Remote and
compatibility fixtures. Local `publish_local_scan` publishes file fingerprints,
opaque occurrence candidates, facts, provider outcomes, metadata and scan state
in one transaction. Neither provider preparation nor file-cache lookup writes.

## 3. Contracts

- Application SQL stays in explicit `db::repos` owners. Use `usage_stats_repo`
  for distinct fact names and `usage_repo` / `usage_delta_repo` for page and
  publication queries; do not grow historical wide `db::<repo_fn>` calls.
- Generated usage DTO integer metadata uses feature-gated `specta(type = i32)`
  or `Option<i32>` while runtime fields stay `i64`. This is the existing TS
  number contract, not runtime narrowing. `f64` metadata incorrectly exports
  mandatory integers as nullable because JSON floats may be non-finite.
- `skill_calls` stores only facts proven by logs. Never add a resolved skill id,
  file path, static Token estimate, or current Central-library interpretation.
- Local readiness is v8 `local_provenance_version=1`, set only after a complete
  successful target publication. A migrated target starts unready with legacy
  facts intact; its first successful Local scan rebuilds the complete target.
  Later provider failure/recovery affects that provider only and keeps readiness.
- Fingerprint reads select only path/key/mtime/size/observed order, never JSON
  payload. Manifest set/order/fingerprints unchanged means no log-content reads,
  raw-call materialization, candidate payload queries, or fact writes. Changed
  files are parsed in full; no append-byte complexity guarantee is made.
- Candidates retain every raw occurrence and loser. Claude groups by exact
  skill+timestamp, Grok by opaque full project/session directory+skill; both keep
  the current observed file-order/occurrence first winner. Codex/Droid/OpenCode
  preserve multiplicity. Reconcile changed/deleted/reordered groups only; equal
  business facts and unrelated groups retain their fact IDs.
- File-cache UPSERT uses `ON CONFLICT DO UPDATE` to preserve opaque ownership;
  `OR REPLACE` must not cascade surviving candidates. Cache/candidate/fact/health/
  metadata/scan-state SQL failure rolls back the complete publication.
- All actual scans share a pool/target single-flight, including force, cold,
  background and Remote. Force joins an in-flight scan. A detached owner keeps
  the flight until publication ends even if a caller is dropped; error/panic
  releases it. TTL-only reads do not own a scan flight. Cross-target scans may run
  concurrently; this lease is independent of Central mutation locking.
- `usage_get_page` and the page portion of refresh use the same read transaction
  and connection for KPI, complete ranking, metadata, local-date heatmap, recent,
  provider health and freshness. Page limit is always 0 (all skills); an explicit
  source filters every facts panel. Compatibility getters remain callable and
  read-only, with no additional remote connection.
- `RefreshSummary.calls_written` keeps its complete available-call count meaning
  for actual scans (and 0 for TTL hits). Actual fact writes are separate counters;
  a warm zero-write scan still reports all historical calls.
- Resolve metadata against `skills.is_central = 1`: normalized exact id first,
  then a unique normalized name. Multiple normalized matches are `ambiguous`;
  no match is `unmatched`. Only `matched` rows have `resolved_skill_id`.
- Read matched `SKILL.md` files through the active `Scope::fs_backend()` batch
  API. Apply `ResourceBudget::default_skill()` after reading. A missing,
  unreadable, non-UTF-8, or oversized file leaves both static metrics `NULL` but
  does not fail the usage scan.
- Static Token is a Skill.md content-size estimate: CJK characters count 1:1;
  other non-whitespace characters count at about 3.8:1, rounded up. It is never
  task Token consumption.
- SQL returns raw `timestamp_ms`. `SystemLocalDayResolver` converts every event
  independently with `Utc -> Local`; do not capture one fixed offset because DST
  may change inside the 16-week window. Invalid timestamps are skipped.
- Fixed horizons: overview KPI/ranking = all recorded history; heatmap = 112
  local calendar days arranged as 16 weeks; recent = latest 20; skill-card 30-day
  badges stay on `usage_get_skill_counts`. Platform list sort and corner rank use
  `usage_get_skill_usage_stats` with `days = None` (all recorded history).
- `usage_get_skill_usage_stats` prefills every requested name with
  `{ count: 0, lastUsedMs: null }`, then overlays query rows. `days = None` omits
  the time cutoff. `days = Some(0)` is "since now", not all history — callers must
  pass `None`. Platform pages must not subscribe to `usageStore`.
- `source` is optional but, when present, must filter overview, recent, detail
  summary, project distribution, and detail heatmap consistently.
- A target-fatal remote transport, protocol, or permission error aborts
  `refresh_with_providers` before enrichment and `replace_calls_for_target`.
  That target's calls, provider health, usage metadata, scan state, and file
  cache stay as they were. A transport-confirmed empty collection may still
  commit a clear. Local provider parse/source failure stays provider-unavailable,
  not target-fatal.
- Refresh warnings and IPC errors may include only a target-safe id, provider
  id, stable code, and retryable. They must not include remote path, command,
  raw stdout/stderr, host diagnostic, or `TargetsError::to_string()`.
- The unused report reads usage facts from the always-local usage pool and inventory
  facts from the already-resolved active-target skills pool. `target_id` scopes calls,
  metadata, and pending recovery; the report must not re-resolve ambient target state.
- Central entries expose one `UnusedAgentInstall` per `skill_installations` row.
  Platform entries use `agent_skill_observations` as authority and expose one
  `UnusedPlatformInstall` per observation, including the exact `rowId` required by
  row-aware unlink. Read-only/plugin observations remain visible but are not writable.
- Platform observations with the same normalized skill name share usage statistics.
  Preserve every observation in `installs`: one agent can have both a writable user
  copy and a read-only plugin copy, and collapsing either row loses action authority.
- `hasPendingRecovery` is derived from pending FS/DB operations for the same target and
  skill id. The renderer uses it only to disable the action; the installation service
  repeats the authoritative guard before mutation.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| duplicate normalized Central names | `ambiguous`, no id, no file read |
| no Central candidate | `unmatched`, no id, no file read |
| matched file missing/oversized | keep `matched`; static metrics are `NULL` |
| provider collect fails | provider unavailable; other provider facts persist |
| metadata insert violates CHECK | entire target replacement rolls back |
| remote target unreachable | do not replace cache; command returns last complete cache when present |
| remote exists/walk/list is transport, protocol, or permission `Err` | target-fatal; no cache replacement |
| remote exists/walk/list is confirmed missing or `Ok([])` | success; empty collection may clear that target |
| timestamp cannot be parsed | omit it from heatmap; never create a 1970 bucket |
| platform observation is read-only or plugin-owned | include it with row metadata; renderer disables unlink |
| same agent has user and plugin observations for one normalized name | return both `installs`; do not duplicate or discard facts in the repository layer |
| pending recovery exists for the target/skill | set `hasPendingRecovery=true`; mutation still fails closed in installation service |
| `usage_get_skill_usage_stats` empty `skills` | empty map, no query |
| `usage_get_skill_usage_stats` name has no calls | prefilled `{ count: 0, lastUsedMs: null }` |
| `usage_get_skill_usage_stats` `days = Some(0)` | cutoff is now; do not treat as all history |

## 5. Good / Base / Bad Cases

- Good: `" REVIEW "` uniquely matches Central id `review`, reads its current
  target-aware Skill.md, and records matched metadata with estimates.
- Base: an old database has no metadata rows; overview remains usable with
  `unmatched` and unavailable static metrics until the next successful scan.
- Good: Codex has user and plugin observations for `review`; one platform report entry
  contains both rows, retaining their distinct `rowId`, source, and read-only state.
- Bad: two Central rows normalize to `review`; selecting the first by sort order
  would create a false navigation target and is forbidden.
- Bad: use `skill_installations` alone for platform entries; loose native directories
  and plugin ownership/read-only facts would disappear.
- Bad: map remote walk/list/exists `Err` to empty success and call
  `replace_calls_for_target`; that deletes the last complete cache.

## 6. Tests Required

- Delta publication: fingerprint hits perform no content reads/JSON parses or
  fact writes; append/rewrite/delete/rotation preserve the oracle multiset and
  unrelated IDs; failure at cache/candidate/fact/metadata stages rolls back all.
- Cold SQL expansion: complex text, control characters, integer extremes,
  duplicate occurrences, empty files and cross-target/provider ownership.
- Single-flight: same target coalesces, distinct targets overlap, caller drop
  and error/panic release correctly; WAL barriers prove one page generation.
- Generated DTO parity: mandatory integer fields remain `number`, nullable
  static metrics remain nullable, and no handwritten command overlaps the map.
- Schema/repo: table creation, target isolation, CHECK constraints, and rollback
  preserving old calls + metadata.
- Enrichment: exact id, unique name, ambiguous name, unmatched, trim/case, ASCII,
  CJK, mixed content, empty content, missing file, and over-budget file.
- Aggregation: Asia/Shanghai crossing a UTC boundary, an injectable resolver that
  changes offsets between events, invalid timestamps, and exactly 112 cells.
- Detail: source filtering and `COUNT(DISTINCT session_id)` per project.
- Command/IPC: Rust camelCase serialization and matching TypeScript command map.
- Unused report: target/source isolation, Central per-agent link metadata, platform
  `rowId`/source/read-only fields, pending-recovery flags, and same-agent user/plugin
  observations preserved in one normalized entry.
- Skill usage stats: empty list, prefetch zeros, optional cutoff vs none, target
  isolation, and `last_used_ms`.
- Remote refresh failure: Fake SSH/WSL three-state exists/walk/list; target-fatal
  preserves every cache table; confirmed empty commits; one target's failure
  does not mutate another; tracing/IPC omit path, command, and streams.
- AC7 tracing capture is a default-parallelism gate. Install a thread-local
  subscriber (`tracing::subscriber::set_default`) for the whole current-thread
  `block_on(refresh...)`. `Instrument::with_subscriber` does not propagate into
  `async_trait` / `join_all` boxes; an isolated-only capture is not evidence.

## 7. Wrong vs Correct

```rust
// Wrong: UTC SQL grouping, days=0 as all-history, arbitrary Central navigation.
strftime("%Y-%m-%d", timestamp_ms / 1000, "unixepoch");
usage_get_skill_counts(skills, 0);
SELECT id FROM skills WHERE LOWER(name) = LOWER(?) LIMIT 1;

// Correct: raw facts -> per-event local resolver; unique metadata only.
usage_get_skill_usage_stats(skills, None);
let timestamps = db::repos::usage_repo::list_timestamps_since(...).await?;
let heatmap = heatmap_grid_16w_from_timestamps(
    &timestamps,
    now_ms,
    &SystemLocalDayResolver,
);
```
