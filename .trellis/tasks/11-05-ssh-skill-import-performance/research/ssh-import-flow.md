# Research: SSH GitHub import data flow and performance

- Query: Determine payload direction, SSH call scaling, integrity issues, and minimal safe optimization.
- Scope: internal source inspection
- Date: 2026-11-05

## Findings

### Data flow and counts

- `services/github_import/preview.rs:462` resolves repository/commit through local HTTP, then opens a target adapter and creates a remote workspace. `remote.rs:77` / `remote.rs:158` runs remote curl + tar. Thus GitHub archive download is REMOTE, not local-first.
- `source.rs:152` candidate discovery calls one manifest-path listing, two optional manifest reads (`plugin_manifest.rs:31`), and one bounded read for each discovered SKILL.md. For C discovered manifests, one normal preview needs C+5 SSH processes: archive acquisition (1), listing (1), optional manifest reads (2), candidate reads (C), hash inventory (1). Cleanup tickets and explicit Markdown reads add calls.
- `targets/exec.rs:214` creates a new ssh process per operation; no application-controlled ControlMaster/ControlPath. `connect_remote_target` only constructs adapter (`targets/remote.rs:9`), not persistent connection. External SSH config could still multiplex, so fresh process is certain while fresh TCP session depends on external config.
- Confirm import calls full-repository hash at `snapshot_import.rs:102`, mkdir at `remote.rs:352`, repeats candidate discovery at `remote.rs:357`, repeats full inventory at `remote.rs:450`, and serially reads N selected files at `remote.rs:461`. Before journal application this costs C+N+6 SSH processes (including initial integrity inventory). Cleanup adds 1. Journal application incurs additional per-skill scripts, hashes, stage, swap, finalize; not included in this formula.
- Selected file bytes travel REMOTE → LOCAL RAM (`remote.rs:437`), then are packed into an archive for durable REMOTE stage (`central_updates/fs/operation.rs:154` and batched stage equivalent). Existing journal path is critical: `import.rs:576` → `core/content_upsert.rs:52` → `update_skills_batch`. Do not replace with direct Central cp.
- Local preview has selected-subtree TreeRaw fast path (`preview.rs:305`); remote preview always downloads full repo. Large repositories can be slower even with no SSH latency.

### Functional integrity gap

`github_snapshot_from_remote_workspace` takes a NEW inventory and only checks returned length (`remote.rs:470`), never file SHA. Its inventory is not checked against registered preview digest. A same-size source mutation after initial `verify_snapshot_integrity` can be persisted while provenance still claims old digest. Journal verifies the bytes it received, which does not prove equality to preview. Must bind new payload to expected preview manifest/digest, including complete selected file set and SHA.

### Minimal bounded batch-fetch option

Replace N serial file reads with bounded chunks; retain journal upload for now. File order/framing must be unambiguous (binary length framing or tar), reject missing/unexpected/duplicate paths, changed lengths/digests, and oversize. Use expected manifest as authority, not newly observed values. Chunking should bound memory and command/stdin size. Benchmark call count with FakeRunner plus latency simulation, explicitly label simulated numbers.

Existing reusable pieces:
- `archive.rs:512` `snapshot_from_repository_archive[_with_budget]` parses gzip tar with entry/count/expanded limits and safe relative path checks. It strips FIRST path component (`relative_archive_path:593`), so remote tar must deliberately add one wrapper (e.g. repo/path). It currently ignores nonregular entries and HashMap insertion overwrites duplicate paths: a batch reader must reject duplicates or prove exact expected output before accepting. Avoid accidental broadening of archive contract.
- `ConnectedRemoteTarget::run_command_with_stdin_bytes` returns binary bytes, but uses standard policy: 8 MiB stdout / standard timeout. Cancellable variant uses bulk_transfer: 32 MiB stdout. These are not arbitrary bounded response helpers; add/choose an explicit supervised bounded policy instead of silently raising global limits.
- `targets/exec.rs:409` bounded_read uses explicit max bytes plus one and custom runner policy, suitable pattern.
- `services/github_import/tests.rs:878` uses fake remote inventory runner; target test-support FakeRunner captures command/stdin/policy.

### Other issues within inspection scope

- Two optional plugin reads use .ok(), swallowing transport/oversize errors as absent (`plugin_manifest.rs:62`). Existing contract allows optional invalid entries but transient transport absence may change candidate grouping.
- Remote progress sets total_files to staging_ops.len(), total_bytes=0 (`remote.rs:373`); it counts skills, not files and does not expose long acquisition/read phase.
- Remote archive resource limit is checked after download and expansion (`remote.rs:162-194`), not during. Keep as documented risk if not addressing acquisition in this task.

## Related specs

- .trellis/spec/backend/github-import-preview-contract.md:398 (local TreeRaw vs remote archive), :982 immutable snapshot, :1063 fail-closed before mutation, :1103 transport-specific repository digest.
- .trellis/spec/backend/fs-db-operation-journal.md: Central content upserts must retain update_skills_batch orchestration, UID, locks, recovery.
- .trellis/spec/backend/transport-seam.md: process runner seam, no direct spawn bypass.
- .trellis/spec/backend/process-supervision.md: bounded output, timeout, cancellation.

## Caveats / Not Found

No actual user SSH host, latency, throughput or wall-clock benchmark observed. Counts are source-derived for successful normal path, not measured elapsed times. No external references needed. A fully remote stage-copy optimization needs extending journal content source model and stage fingerprint validation; batching downloads improves latency but does NOT eliminate relay bytes.


## Sibling sweep (before implementation)
Four read sites in github_import were inspected:
- remote.rs selected payload loop: same issue, replace serial transport and enforce expected SHA.
- snapshot.rs single Markdown read: already verifies size and SHA against registered manifest; not the same bug.
- source.rs candidate metadata reads: serial per-candidate calls remain, relevant mainly to preview; source bytes at final apply must be verified by the corrected snapshot reader. Defer discovery batching.
- plugin_manifest.rs optional plugin metadata reads: missing/failed reads are treated as absent by existing behavior; separate grouping/diagnostic risk, no change in this task.
Local archive import is explicitly rejected for SSH/WSL at the command boundary; it is not a hidden local ZIP upload path.
