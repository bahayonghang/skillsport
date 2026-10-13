# Final backend review

Scope: Rust usage service/provider/repository/commands, append-only migration v8,
page IPC and backend correctness evidence. Review is based on the actual current
paths, the performance task PRD/design and curated backend specs. The implementer
owns release measurements; main owns generated artifacts, repository CI and
Windows acceptance. No real HOME/provider logs or production database were read.

## Findings (fixed)

- File: `src-tauri/src/services/usage/delta_tests.rs`
- Issue: The new cold SQL JSON expansion had no regression proving exact
  complex-text and signed-64-bit roundtrips, or parity of its occurrence group
  keys with the Rust delta encoder across every non-deduplicating provider.
- Fix: Added one real-publication test covering Codex, Droid and OpenCode;
  duplicate occurrences, quotes, backslashes, CJK, control characters and
  `i64::MIN/MAX`; one append preserving all old fact IDs; and a zero-write warm
  publication. Added a second publication regression for empty files between
  nonempty files, and the same opaque file key in another target/provider, to
  guard cold fact/candidate ID mapping and target/provider isolation.
  The fixture helper now assigns Droid its actual display source.
  Both regressions pass in the final release usage suite.

- Files: `aggregate.rs`, `mod.rs` (`ProviderHealth`)
- Issue: The first generated `usage_get_page` contract exported mandatory `i64`
  fields as `number | null`, because new `specta(type = f64)` annotations include
  Serde floating-point null semantics. Actual Rust values and the frontend
  interface require numbers.
- Fix: Coordinated with the backend owner, who changed the codegen-only
  annotations to the repository's `i32` / `Option<i32>` pattern. Runtime fields
  remain `i64`. Regenerated output now has mandatory numeric fields, the
  temporary handwritten command is removed, and TypeScript checking passes.

- Files: `services/usage/{mod,incremental,synthetic_bench}.rs`,
  `db/repos/usage_stats_repo.rs`
- Issue: Integrated CI found historical wide repository calls growing from the
  388 limit to 410. New service and synthetic baseline calls used the compatibility
  `db::<fn>` facade; one new DISTINCT-names fallback also embedded SQL in the
  service instead of its owner.
- Fix: Routed new/reworked calls through explicit `db::repos` usage owners,
  keeping shared types on the facade. The synthetic harness uses short owner
  module aliases to preserve the 800-line budget. Moved the existing DISTINCT
  query unchanged to `usage_stats_repo::list_usage_skill_names`; its original
  target binding and names result remain unchanged. The existing `usage_repo`
  is near its size budget, so the already-established facts-statistics owner
  hosts this query. Historical wide calls now total 378; the fixed scanner and
  baseline were not changed. No schema, scan, transaction or benchmark algorithm
  was changed.

## Contract review

- Frozen migrations v1–v7 and `db/schema/usage.rs` are untouched. The measured
  v8 source SHA256 remains
  `6c2e9684a9d991e689f40686bbd1bf27d7a26dc33fb9426351db4718b5d714de`.
  Legacy rows survive migration with readiness 0; first successful Local
  publication establishes readiness atomically.
- Fingerprint lookup selects no `calls_json`; the unchanged manifest fast path
  reads no candidate payload and performs zero fact mutations. Structured
  tests additionally corrupt the unused legacy JSON and observe fact mutations
  with INSERT/DELETE/UPDATE triggers.
- Raw losers and occurrence multiplicity survive candidate publication. Claude
  retains history-first/current traversal first-winner semantics; Grok hashes
  the complete observed session-directory identity; Codex/Droid/OpenCode use
  opaque file identity plus ordinal. Reordering is treated as a manifest delta.
- Changed/deleted/reordered groups snapshot old winners before cache cascades;
  UPSERT retains ownership, equal business facts retain IDs, and provider
  outcomes plus metadata/freshness/readiness share one `BEGIN IMMEDIATE`
  publication. Independent targets can prepare concurrently and serialize only
  SQLite publication. Trigger-failure tests compare all authoritative tables.
- The final non-deduplicating cold path expands normalized JSON twice, assigning
  facts and candidate pointers through the same `ROW_NUMBER` order of observed
  file order plus raw occurrence ordinal. Both queries are target/provider
  scoped in the same writer transaction. The full TEMP expansion and F-sized
  prefix-offset experiments were removed after failing to show measured benefit;
  they are not part of the reviewed final product implementation.
- Remote fatal collection returns before publication. Remote retains complete
  safe replacement; OpenCode DB/WAL changes rebuild that provider's occurrences
  without replacing unrelated JSONL facts. No source database is modified.
- Single-flight covers actual refresh cycles, keys pool identity plus target,
  keeps a detached owner through caller drop, propagates tracing subscribers,
  and releases on typed error/panic. TTL reads remain outside the flight.
- `build_page` shares one transaction/connection for metadata, complete ranking
  (limit 0), KPI, local-day heatmap, recent, providers and scan timestamp. Source
  is applied to all facts panels. New `usage_get_page` is registered for runtime
  and code generation; `usage_refresh` accepts optional source while preserving
  its result shape. The regenerated contract is the sole frontend entry for the
  new command.

## Performance evidence boundaries

- Unchanged warm manifests are O(F) observation plus allowed K-sized metadata
  work; they return before sorting old file order. Changed-manifest reconciliation
  currently sorts prior observed order, adding O(F log F) work, in addition to
  changed full-file bytes and genuinely affected groups. Do not report every
  delta as an O(F) path or promise append-byte parsing.
- The rerun's `baseline_refresh` preserves old cache-hit decoding/cloning and
  full-target replacement, and its page builder uses the old repeated queries.
  It calls the shared, now-indexed identity resolver. It is a baseline of the old
  scan/publication flow, not a byte-for-byte execution of every algorithm from
  the old commit. That comparison does not measure the identity-index benefit.
- The original initial run was one cold sample with repeated warm/page samples;
  raw repeated cold samples and process peak memory belong to the later runner.
  Memory/file WAL and small/common/stress results must stay separate. No OS page
  cache flush, real provider throughput or native Windows result is implied.
- The final selected implementation has a measured memory-stress cold median
  regression of 19.2%, exceeding PA7's 10% limit. Production-like file-WAL
  improvements do not establish acceptance of the separate memory case. Retain
  the failure explicitly; do not mark all PA7 criteria satisfied. Full figures
  and raw samples are owned by the backend measurement report.

## Findings (not fixed)

- PA7 memory-stress cold median remains outside the required limit after the
  measured cold-path alternatives; resolving or changing acceptance is outside
  this reviewer's narrow implementation ownership.
- Full repository CI, Clippy and Windows evidence remain coordinated by main
  and are not claimed complete here.

## Verification

- Targeted rustfmt: pass for the edited test file.
- `git diff --check` for the edited test: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass after integer annotations and generated contract repair.
- Final release usage suite: 99 passed, 0 failed, 2 intentionally ignored,
  including both new review regressions (main/implementer execution evidence).
- Migration-focused suite: 12 passed, 0 failed (main/implementer execution evidence).
- `pnpm exec vitest run src/test/contracts/rustBoundaryContract.test.ts`: 4 passed
  after owner routing repair; measured historical wide calls 378 (limit 388).
- `pnpm sizecheck`: pass, 761 production files checked against the 800-line limit.
- Clippy and `just ci`: main's final repository gate is pending; no duplicate
  Cargo job was launched during release sampling or codegen.
