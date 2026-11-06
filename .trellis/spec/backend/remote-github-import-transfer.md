# Remote GitHub Import Transfer

## 1. Scope / Trigger
Applies to SSH/WSL GitHub confirmation, remote skills.sh installation, and changes to selected snapshot byte acquisition. Keep the immutable preview and durable operation journal contracts.

## 2. Signatures
- `import_github_repo_skills_remote_from_workspace(..., expected_files: Option<&[PreviewSnapshotFile]>, ...)`
- `remote::batch_read::read_verified_files(connection, repo_dir, selected)`
- Marketplace `install_skills_sh_remote` uses `preview_github_repo_import_remote_staged` followed by `import_github_repo_skills_from_preview_with_branch` with the same token.

## 3. Contracts
- Remote preview downloads the pinned repository archive on the target. Confirmation still relays selected contents through local RAM into the shared journaled writer; never claim batching removes this bandwidth cost.
- Registered-preview callers pass the registered file manifest; pinned-update callers pass their digest-verified manifest. Only non-preview acquisition may obtain a new inventory. Never replace a confirmed manifest with a fresh listing during readback.
- Retain whole-snapshot verification before import. Selected file reads must match each authoritative length and SHA-256 before Central directory creation or journal application.
- Batch at most 64 files and 32 MiB of raw payload, using the existing supervised BulkTransfer API. Its stdout cap is the byte cap; no Base64/tar overhead is added. Empty files count toward the file limit. Validate safe paths, uniqueness, file/count/aggregate budgets before spawning.
- Quote paths in the stdin script; only the fixed shell command is passed as SSH command arguments. A failed command yields no accepted snapshot. Reject truncated, extra, or wrong-hash payloads. No fallback to unverified reads.
- Preserve `journaled_central_content_upsert_with_fs` and its lock, UID, rollback, staging fingerprint and DB commit behavior. Do not substitute direct copying into Central.
- skills.sh SSH/WSL branches before local snapshot acquisition. Resolve the candidate and duplicate policy from one remote pinned preview; import that token and discard it on terminal success/error. Retry unauthenticated only at repository-inspection failure, preserving previous resolution fallback without repeating a failed archive acquisition.
- Local skills.sh behavior remains unchanged. No IPC/schema changes.

## 4. Validation & Error Matrix
| Condition | Required result |
| --- | --- |
| selected path duplicate/unsafe, count or bytes exceed budget | reject before remote process |
| output truncated, extra or SHA differs | `PreviewSnapshotIntegrity`, no Central mutation |
| remote file missing/resized (exit 44) | typed exit status maps to `PreviewSnapshotIntegrity`, no Central mutation |
| other script/transport failure | Remote error, no accepted partial snapshot |
| empty selected set | no payload-read process |
| exactly 32 MiB file | one bounded batch; no infinite zero-length batching loop |
| marketplace missing candidate/conflict without replace | reject and discard acquired preview |
| preview acquisition failure after repo inspection | no unauthenticated second archive attempt |

## 5. Good / Base / Bad Cases
- Good: 128 small selected files use two payload-read calls, preserve byte-for-byte contents, and reject same-length tampering.
- Base: one selected file is read in one supervised batch and then applied through the existing journal.
- Bad: replace the expected SHA with one observed after confirmation, accept length-only validation, or download locally before entering the remote marketplace branch.

## 6. Tests Required
- SSH/WSL FakeRunner: binary, Unicode/quoted filenames, empty files, complete stdin and BulkTransfer policy.
- Rejection: unsafe/duplicate paths, size limits, truncated/extra output, same-length tampering, transport failure.
- Batch boundaries: file count and byte cap including maximum entry; empty selection.
- Latency experiment compares legacy per-file reads with batches using identical bytes and injected per-call delay. Report elapsed time and calls as simulated, not real SSH throughput. Avoid wall-clock speed thresholds in CI.
- Optional local POSIX shell fixture executes generated script via ProcessRunner and proves binary output plus missing/resized rejection. This is shell evidence, not live SSH.
- Marketplace selection precedence, conflict behavior, fallback stage and same-token routing. Structural assertions do not establish live HTTP/SSH cleanup.
- Focused Rust tests followed by `just ci`.

## 7. Wrong vs Correct
```rust
// Wrong: new inventory replaces the confirmed authority; length-only acceptance.
let files = remote_preview_repository_files(connection, root).await?;
assert_eq!(bytes.len() as u64, file.byte_len);

// Correct: registered inventory remains authority through the payload read.
let snapshot = read_verified_files(connection, root, selected_confirmed_files).await?;
// Each output slice must match confirmed length AND SHA before journal apply.
```

Remaining costs: remote preview still fetches the full archive, candidate discovery reads individual manifests, journal staging still uploads selected bytes, and real network latency depends on host/network/SSH configuration.
