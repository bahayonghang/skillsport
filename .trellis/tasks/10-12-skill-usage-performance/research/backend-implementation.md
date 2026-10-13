# Rust implementation evidence

## Scope and decisions

- Only synthetic TempDir logs, isolated memory/file WAL databases, and FakeRunner transports were read. No real HOME logs, application SQLite, or external target was scanned.
- `usage_get_page(source?)` returns one transactional `UsagePageSnapshot { overview, recent, providers }`; all page rankings use limit 0 (complete set). `usage_refresh` accepts optional source; existing callers remain valid. Only explicit refresh establishes remote connectivity.
- Usage single-flight is keyed by pool identity and target. The detached publication owner survives caller cancellation, force joins an in-flight scan, distinct targets can scan concurrently, and panic/error releases the flight. TTL-only reads do not become scan owners.
- Existing provider parsers and observed traversal order are retained. Fingerprint-mode cache returns no raw calls for unchanged files and never selects/decodes `calls_json`. Changed files retain all raw occurrence candidates, including Claude/Grok losers. Codex/Droid/OpenCode keep duplicate occurrences.
- New v8 migration adds opaque file identities, observed order, readiness, and candidate ownership without altering v1–v7 or frozen `schema/usage.rs`. Checksum: `6c2e9684a9d991e689f40686bbd1bf27d7a26dc33fb9426351db4718b5d714de`.
- Publication owns one transaction for file cache, candidates, facts, health, metadata, scan state/readiness. Changed/vanished/reordered groups reconcile winners; equal business facts keep IDs; unaffected facts do not change. Initial rebuild uses batched occurrence/fact publication, avoiding per-group SQL roundtrips. Remote keeps full safe replacement; OpenCode changes affect its provider only.
- Unique skill names are deduplicated before sorting; Central identity candidates are normalized into multivalue id/name indexes, preserving exact-id priority and ambiguity. Page loads metadata once. Unchanged file-manifest handling is O(F); changed/reordered manifests sort the prior file order (O(F log F)) before bounded affected-group reconciliation.

## Initial baseline before product changes

Canonical command: `cargo test --manifest-path src-tauri/Cargo.toml --release --locked usage_bench_synthetic_pipeline -- --ignored --nocapture --test-threads=1`.

Release/Rust 1.98.0 Windows x64, deterministic ordinal fixture: 100 files × 100 calls = 10,000 calls / 1,000 skills / 1,207,000 bytes. No OS page-cache flush. Fixture generation 57.194ms; initial release compilation 5m21s (excluded). Five warmups + twenty measured warm/page samples:

| Storage | First cold ms | Warm p50/p95 ms | Complete page p50/p95 ms | TTL ms |
| --- | ---: | ---: | ---: | ---: |
| memory | 66.163 | 70.8502 / 76.6455 | 30.1348 / 34.0385 | 0.041 |
| file WAL | 192.219 | 191.0104 / 313.3550 | 44.2390 / 52.0076 | 0.054 |

This initial run preserved old cache-hit decode/clone/full-replacement behavior. It did not capture individual raw samples or process peak memory. The subsequent reference is an **old publication-pipeline baseline**, not a complete immutable old-commit benchmark: it shares the current identity resolver. Synthetic fixtures have no Central candidates, and identity-index speedups are not attributed to this comparison.

## Correctness verification to date

`cargo test --manifest-path src-tauri/Cargo.toml --lib --locked usage -- --test-threads=1`: 91 passed, 0 failed, 2 intentionally ignored (real HOME benchmark and opt-in synthetic benchmark). Coverage includes existing parser/provider, remote-fatal redaction/cache preservation, DST, source/target isolation, plus new tests for:

- complete 144/1,000 skill pages and a file-WAL writer commit between read SELECTs;
- single-flight coalescing, independent targets, dropped caller, error and panic recovery;
- Claude history winner fallback, observed-order changes, insertion before existing files, unchanged IDs;
- Grok project/session-directory scope;
- occurrence multiplicity and equal-fact ID retention;
- file-cache, candidate, fact, and metadata trigger-injected rollback followed by successful retry;
- fingerprint hit returns no payload materialization.

One iteration caught the missing tracing subscriber propagation in the detached scan; it now inherits the subscriber and preserves stable target/provider/error fields. Another caught a test relying on timestamp-tied row order; the sentinel assertion now matches by skill, consistent with the undefined tie order contract.

## Selected release comparison

Hardware: Intel Core Ultra 9 275HX, 24 logical processors, 68,143,853,568 physical RAM bytes; Rust 1.98.0, release, Windows x64. One fresh test-binary process per variant/storage/size; 5 cold/warm/page warmups + 20 measured observations. Process peak WorkingSet sampled at 5ms. Fixture creation and release compilation are excluded; application caches are reset for cold, OS caches are not flushed. Percentiles use `sorted[floor(n*p)]`; for 20 observations the reported p95 is the highest observation (a conservative upper order statistic).

The tracked [benchmark-results.json](./benchmark-results.json) contains every selected raw observation, input size, WorkingSet, measurement method and rejected experiment. Original small/common and file-WAL raw logs remain alongside their metadata; the earlier selected memory-stress observations are copied from captured test output into JSON because subsequent experiments reused their stdout filenames.

| Fixture / DB | Cold p50 / p95 ms before → after | Warm p50 / p95 ms before → after | Page p50 / p95 ms before → after | Peak MB before → after |
| --- | --- | --- | --- | --- |
| common: 10×20 calls, 23,800 bytes; memory | 4.765 / 7.148 → 7.432 / 10.493 | 3.610 / 5.733 → 3.849 / 4.424 | 2.521 / 2.696 → 1.746 / 2.116 | 19.485 → 19.263 |
| common: 10×20 calls; file WAL | 12.084 / 23.143 → 7.211 / 15.136 | 6.729 / 8.989 → 5.374 / 6.423 | 3.191 / 3.817 → 2.004 / 2.605 | 19.612 → 18.862 |
| stress: 100×100 calls, 1,207,000 bytes; memory | 73.808 / 110.477 → 87.985 / 96.682 | 69.763 / 75.967 → 16.947 / 19.043 | 25.354 / 28.813 → 20.949 / 22.752 | 35.213 → 33.792 |
| stress: 100×100 calls; file WAL | 344.575 / 611.571 → 216.188 / 337.111 | 250.521 / 329.900 → 34.669 / 50.140 | 43.158 / 54.197 → 31.349 / 38.971 | 34.726 → 28.451 |

Production-like file WAL cold, warm, page and peak memory improve. Common baselines are below 50ms, so use PA5/PA6 structural evidence rather than claiming a reliable percentage speedup. **PA7 remains incomplete:** memory-stress cold p50 regresses 19.2%, and common-memory cold increases in the <50ms/noise range. Its lower p95 does not erase the p50 regression. Additional occurrence storage and ownership-index writes are a real cold-path cost.

Two local cold candidates were tested and rejected, leaving the simpler batched direct SQL expansion:

- A full TEMP normalized-occurrence copy avoided duplicate JSON/window work but added N-row materialization: memory p50 77.018 → 120.543ms. Raw results/WorkingSet are in `cold-single-expansion-experiment/` and the JSON report.
- A per-file prefix-offset window reduced the SQL sort input from N occurrences to F files (EQP confirms `MATERIALIZE offsets`, one file-order sort, indexed file lookup and `json_each`); same-condition final memory p50/p95 64.545/78.675 → 116.159/183.929ms. It did not improve wall time and was reverted. Latest warm readings also show substantial host timing variability; no new stable performance claim is based on this rejected run. Results are in `cold-prefix-experiment/` and JSON.

1,000-skill coherent page JSON is 196,299 bytes. Observed serialize p95 ~0.22–0.51ms in final profiling runs. Heatmap EQP uses existing `idx_skill_calls_target_ts`; no additional page-read index or aggregate cache was introduced without evidence.

## Structural and final checks

- Fingerprint-only warm: log reads=0, parsed log calls=0, fact INSERT/DELETE/UPDATE trigger counts=0, including deliberately invalid legacy `calls_json` (candidate ownership remains the authority).
- Append: only the changed file is read/parsed; one duplicate occurrence inserts one fact, no deletion/update; independent-file IDs are unchanged.
- Truncate/delete/rotation: only changed/new files are read; deleted contribution is removed without reading unrelated content; complete five-field multiset equals the full provider oracle. Controlled same-length rewrites/winner replacement are covered separately by explicit parsed plans and rollback fixtures.
- Claude/Grok winner fallback, order changes, new-file insertion, unreadable file, unavailable provider/recovery, legacy rebuild failure/retry and cross-target WAL publication all pass.
- Remote-fatal snapshots now compare candidate data and readiness as well as facts/cache/metadata/health/scan state. Source DB WAL-only OpenCode change adds only its own contribution and preserves the Codex sentinel ID.
- Direct final release binary: **99 usage tests passed, 2 intentionally ignored**, plus **12 migration tests passed**. This includes reviewer-owned complex-text/control-character/i64-extreme/occurrence regression. The rejected prefix experiment and selected direct expansion share this behavior; final repository CI must cover the selected post-revert source.
- Canonical locked Clippy passed at the earlier integration checkpoint. Final `cargo fmt --all -- --check` passed. Latest Clippy/codegen/full CI are owned by the main session; no further Cargo lock is held by this agent.
- `usage_get_page` is runtime ReadOnly and generated-command registered. Specta maps only type metadata to `i32` / `Option<i32>` as the repository's TS-number convention; runtime fields remain `i64`. Earlier `f64` metadata caused erroneous nullable exports and was corrected without changing global BigInt strategy or hand-editing generated output.

Actual provider/hardware behavior, real HOME scan throughput, remote throughput and native Windows WebView2 evidence remain separate from synthetic tests. Main session owns native build, generated docs/codegen and the final CI/bundle gates.
