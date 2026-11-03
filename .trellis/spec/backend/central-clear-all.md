# Central Clear-All Contract

## 1. Scope / Trigger

Use this contract when changing the target-scoped "clear all Central skills"
flow: `preview_clear_central_skills`, `clear_central_skills`,
`cancel_central_clear`, the orphan/untracked sweep, or the
`central://clear-progress` event.

It is **not** unknown-source reset (`unknown-source-reset.md`), repository
delete, or `rebuild_startup_database`. Skill deletion reuses the journaled
batch delete (`skill-deletion-integrity.md`, `fs-db-operation-journal.md`).
Cross-layer DTO shapes live in
`.trellis/tasks/11-02-central-clear-all/design.md` (archived with the task).

## 2. Signatures

```rust
// services/central_skills/clear_all
pub async fn preview_clear_central_skills_impl(
    pool: &DbPool,
    target: &ActiveTarget,
) -> Result<ClearCentralPreview, CentralSkillsError>;

pub async fn clear_central_skills_impl(
    pool: &DbPool,
    target: &ActiveTarget,
    request: &ClearCentralRequest,
    job: ClearJob<'_>, // job_id + cancel flag + progress sink (no AppHandle)
) -> Result<ClearCentralResult, CentralSkillsError>;

// paths.rs (Path Policy)
pub fn path_comparison_key(path: &Path) -> String;          // lexical, no FS
pub fn path_is_within(root: &Path, child: &Path) -> bool;
pub fn key_is_within(root_key: &str, child_key: &str) -> bool;
pub fn slot_paths_equivalent(left: &Path, right: &Path) -> bool; // never follows the leaf
pub fn attributable_central_roots(current: &Path) -> Vec<PathBuf>;
pub fn remote_attributable_central_roots(current: &str, remote_home: &str) -> Vec<String>;
```

```text
preview_clear_central_skills() -> ClearCentralPreview          runtime_only(Preview)
clear_central_skills({ jobId, request }) -> ClearCentralResult  operation(Central, Filesystem, StartedThenTerminal)
cancel_central_clear({ jobId }) -> boolean                      operation(Central, Job, TerminalOnly)
event central://clear-progress { jobId, phase, status, completed, total }
```

## 3. Contracts

- Each command resolves one `TargetContext`; only that pool and that target's
  Central root are read or written. Local never touches SSH/WSL cache DBs or
  remote files, and the reverse.
- **Attributable roots** = current Central root ∪ `app_data_dir()/skills` ∪
  `~/.skillsmanage/skills` (remote: current ∪ `<remote_home>/.skillsmanage/skills`).
  Local roots are kept raw and canonicalized; comparison is lexical
  (`path_comparison_key`: `\\?\` stripped, `/` separators, `.`/`..` resolved,
  lowercase on Windows) and component-aware.
- **Scan set** = every `agents` row except `central` (enabled or not, detected
  or not, custom included) plus every registered project × agent project
  skills dir; deduplicated by key; dirs equal to or inside the Central root are
  skipped (native shared roots go with the Central dir). Missing dirs are
  empty; unreadable dirs become `sweepWarnings` (`code=unreadable`).
- Sweep is one level only: `symlink_metadata` (no follow), link target read
  from the link itself (works for dangling junctions/symlinks), no `SKILL.md`
  parsing, no recursion, no link canonicalization. `.skillport-*` journal
  artifacts are ignored; hidden Central entries are ignored.
- Classification: link → target attributable and path not DB-registered →
  `orphanLinks`; plain dir without a DB installation/psi row →
  `skippedUnmanagedCount` only (never deleted); link to a non-attributable
  target (Skills CLI, user links) → untouched. Central root children that are
  not DB skill dirs → `untrackedCentralEntries`; files are ignored. "DB skill
  dir" matches by lexical key **or** canonical-ancestor slot key (leaf not
  followed), so a root configured through a link never lists a tracked dir.
- `projectLinks` = psi rows with `link_type='symlink'` whose current link
  target (or, if the link is gone, stored `symlink_target`) is attributable.
- Preview takes **no** mutation lock and writes nothing. SQL is a fixed set of
  batch queries (agents, Central skills, installations in 500-id chunks,
  projects, all psi rows) plus the pending-journal count. The per-skill
  check matches `preview_delete_central_skill_impl` (`skill_delete_dir` +
  `ensure_child_path`) without per-skill SQL.
- Path lists are capped at 2000 per category (`truncated=true`); the
  `projectLinkCount` / `orphanLinkCount` / `untrackedCentralEntryCount`
  fields stay exact. A truncated category is confirmed with `["*"]`, the only
  wildcard; `skillIds` never accepts a wildcard.
- Apply order, all inside one exclusive job lease and one
  `acquire_target_mutation_guard` (helpers never re-lock), one remote
  connection: recovery of **every** pending `fs_db_operations` row of the
  target → locked rescan → `projectLinks` → skills (journaled batch delete in
  chunks of 25, same `batch_id`) → untracked entries → orphan links →
  finalize. Only "rescanned ∩ requested" items are touched; requested items
  absent from the rescan count in `skippedChanged`. Items created after the
  preview are never deleted unless the category was confirmed with `"*"`.
- Each removal re-observes: links must still be links with an attributable
  target (remote: `[ -L ]` and unchanged `readlink`, see below), untracked entries must be direct non-hidden
  children of the Central root and not a DB skill dir. Links are removed
  without following; only untracked real directories use `remove_dir_all`.
- psi rows are deleted in one transaction for removed (or already-gone) links.
- Remote (SSH/WSL) protocol: paths and expected targets travel only as
  positional args (`sh -s --`, batches of at most 200), never interpolated.
  Every file-system-derived field (entry names, `readlink` values, the
  resolved root) is hex-encoded with `od -An -tx1 -v`; records are
  `TAG	<1-based index>[	<hex>...]` with an exact field count per tag.
  Unknown tags, out-of-range or non-digit indexes, odd/non-hex fields,
  invalid UTF-8, NUL, and entry names that are empty, `.`, `..`, or contain
  `/` are dropped (missing removal records count as failed). A name or
  target containing a newline or tab can never forge or split a record.
- Remote root identity: the directory probe also emits `REAL` (`cd -P && pwd
  -P` of the Central root) or `UNRESOLVED`, once per preview/apply. A
  Central entry is untracked only when the root resolved and its name is not
  the final component of any DB skill dir of the target (a superset of
  matching `<stored root>/<name>` and `<resolved root>/<name>`). With an
  unresolved root nothing is offered or deleted as untracked; requested
  untracked keys count in `skippedChanged`.
- Remote link removal is verified at removal time: the script receives
  `(path, expectedTarget)` pairs (the raw `readlink` value captured by the
  locked rescan) and runs `rm -f` only when `[ -L ]` and `readlink` still
  equals the expected value; otherwise it reports `SKIP` →
  `skippedChanged`. A link without a captured target is never removed.
- A pending recovery failure blocks only that skill; it is reported in
  `skills.failed` with `phase="recovery"` and counted in `recovery.failed`.
- Cancellation is checked at chunk boundaries; committed deletes are not
  rolled back; result `cancelled=true`; progress ends with `status=cancelled`.
- Finalize clears that pool's update inventory and pending additions when at
  least one skill was deleted.
- Progress emits on every phase start and terminal state, otherwise at most
  every 25 items or 100 ms. `completed <= total` always.
- Operation Log action is the command name `clear_central_skills` (category
  `central`), details are counts plus `scope=central_clear_all`; no paths,
  URLs, keys, or skill contents.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Mutation lock busy/timeout | IPC `central_skills.mutation_lock_failed` |
| Same-family job active | IPC `job.central_clear_busy` |
| Other outer failure | IPC `central.clear_failed` |
| Requested key/id no longer in rescan (or never in scope) | Skipped, `skippedChanged += 1`, nothing deleted |
| Link replaced by a plain dir / non-Central link before removal | `skippedChanged` |
| Removal IO failure (locked file, permission) | `failed[].errorCode = central_clear.remove_failed`; retry is idempotent |
| Untracked path not a direct Central child | `failed[].errorCode = central_clear.path_outside_scope` |
| Per-skill delete failure | Existing `FailedCentralSkillDelete.error_code` |
| Nothing to clear | Empty preview; renderer disables confirm |

## 5. Good / Base / Bad Cases

- Good: DB row gone, Central dir gone, a dangling junction in Claude's dir
  points at the old default root → listed as an orphan and removed alone.
- Base: Universal and another agent share one dir → scanned once.
- Bad: deleting `~/.agents/skills/<x>` because its name matches a Central skill;
  following a junction into Central with `remove_dir_all`; listing candidates
  outside the lock and deleting without a rescan.

## 6. Tests Required

- `services::central_skills::clear_all::tests` — S1–S16, out-of-scope keys,
  cancellation between chunks, progress phases, truncation + wildcard,
  bulk-vs-single preview parity, FakeRunner SSH preview/apply, script
  invariants (`[ -L ] || [ -e ]`, links removed with `rm -f` only, hex
  encoding, `[ "$LT" = "$want" ]`), forged-record rejection (newline in a
  name), tracked dir through a symlinked remote root, unresolved remote root
  deletes no untracked entry, link retargeted between probe and removal is
  skipped.
- `paths::tests` — component-aware containment, Windows case/`\\?\`,
  relative `..`, dangling children under default roots.
- `central_operation::fs_dedupe_tests` — a link slot and its target stay two
  manifest entries (`slot_paths_equivalent`).
- `commands::central_clear::tests` — policies, reviewed codes, Operation Log
  without paths.
- Perf: `perf_clear_preview_1000x6` (`--ignored --nocapture`, release).

## 7. Wrong vs Correct

```rust
// Wrong: canonicalize follows the junction, so a link and its Central target
// look "equivalent" and the Central directory is silently skipped.
if paths_equivalent(&existing, &path) { continue; }

// Correct: compare slots without following the final component.
if slot_paths_equivalent(&existing, &path) { continue; }
```

```rust
// Wrong: scanner-style probe drops dangling links.
// [ -e "$entry" ] || continue
// Correct
// [ -L "$entry" ] || [ -e "$entry" ] || continue
```
