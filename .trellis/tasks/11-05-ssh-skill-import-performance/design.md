# Design

## Evidence and root causes
- GitHub remote preview downloads tarball on target (`github_import/remote.rs:create_remote_preview_workspace`). Inventory already hashes remotely in one call; do not replace it.
- Import `github_snapshot_from_remote_workspace` reads each selected file serially into local memory. Journal writer packages these bytes and uploads them again. Each read uses a new SSH process. This is avoidable O(files) latency.
- Readback verifies length but not SHA against the preview manifest; same-length tampering can retain stale provenance.
- skills.sh install acquires a local pinned snapshot before choosing the remote branch, then resolves/downloads again remotely. This duplicates acquisition and can change commits.

## Chosen implementation
1. Keep the existing journaled Central writer and rollback model. Replace serial remote file reads with bounded batched binary reads, using existing supervised process APIs. Validate exact bytes/length/SHA against a manifest bound to the confirmed preview. Deduplicate selected paths; preserve file/aggregate budgets and fail closed on malformed/truncated/extra output. Avoid new remote runtime dependencies. Reuse existing archive or framing helpers where appropriate.
2. Thread expected snapshot identity into the workspace importer; compare current inventory and readback bytes before any Central mutation. Non-preview calls use the just-acquired inventory as authority and verify readback SHA too.
3. Route skills.sh remote install through the existing pinned remote preview and import lifecycle, resolving the chosen candidate and duplicate policy there. Discard temporary preview on every terminal path. Local flow remains unchanged; authentication fallback behavior must be preserved.

## Tradeoff
The minimal change still relays selected content through local memory because the durable Central writer consumes bytes. Remote-only staging would require changing the shared journal content source/recovery boundary; defer that separate architecture change rather than bypassing it. Quantify round-trip improvement without claiming removal of all bandwidth overhead.

## Compatibility
No IPC or schema change intended. Preserve target binding, preview leases, provenance, persisted uid, locks, overwrite/rename/skip and WSL. No real remote writes for tests.
