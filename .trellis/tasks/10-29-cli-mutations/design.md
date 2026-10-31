# C2 Design

The overall design is in the parent task's `design.md` §3 (command table, write rows), §4 (confirmation contract), §5 (notes), §6 (tags), and §10 (security).

Decisions specific to this child:

- Confirmation contract: one helper, `cli_api::confirm::require(plans, yes, dry_run)`, used by every write command.
  It returns `Plan(dry_run)` / `Proceed` / `Err(ConfirmationRequired { plans })`. The binary puts `plans` into the
  error envelope's `details`.
- ZIP import: the CLI runs as a single process, so it calls preview → fingerprint → import in sequence inside the
  same `CliContext` call. It keeps the fingerprint check so the file cannot be swapped between steps; it does not
  have to keep the GUI's two-phase IPC.
- Directory import: first audit how the scanner/centralize path adopts external directories (the
  `ensure_centralized` entry point). If an existing use case accepts an arbitrary directory, reuse it. Otherwise add
  `services::installation::import_local_dir` in `services/`, have it take the Central lock, and route it through
  `ensure_centralized`. Record the audit result here before implementing.
- Tag source: extend the `source` parameter of `db::assign_skill_tags` to accept `"agent"`, and add the value to the
  `central-skill-tags` spec. `--review` goes through the existing write entry in `services/ai_tagging` (the pending
  review rows).
- Notes: use the `skill_explanations` upsert. If the only existing write path is inside the AI generation flow,
  add a provider-independent `upsert_skill_explanation` to the repository layer and have both the AI flow and the
  CLI call it. `--file` caps the size at 64 KiB and requires UTF-8.
- Operation logs: reuse `record_operation_log_best_effort` the way the existing `cli_api` code does, with the same
  category and phase as the matching GUI command in `ipc_registry`.

## Directory import audit (2026-10-30, before implementing `--from-dir`)

Candidates inspected:

| Entry point | Accepts an arbitrary directory? | Why it cannot be reused as-is |
| --- | --- | --- |
| `services::installation::centralize::ensure_centralized(pool, skill_id, canonical_dir)` | No | Its copy source is the `file_path` of an existing `skills` row. It never takes a directory argument, and it returns early when `canonical_dir/SKILL.md` exists and the row is already central, so it cannot replace. Routing a directory through it would require first writing a fake non-central `skills` row that points outside every agent root, which pollutes the platform view on failure and would overwrite an unrelated agent observation with the same id. Callers own the lock; it does not take one. |
| `services::obsidian::import_obsidian_skill_to_central_impl(pool, dir_path)` | Yes | No Central mutation lock; copies before checking `SKILL.md`, so an invalid directory leaves a copied tree with no row; uses `paths::central_skills_dir()` instead of the Central agent row; no replace or rollback; it belongs to the Obsidian domain and its operation-log category is `obsidian`. |
| `services::scanner::scan_directory` | Read only | Discovery only (one level, follows a symlinked skill root, id = lowercased entry name with spaces replaced by `-`, requires `SKILL.md` frontmatter `name`). Used here as the policy reference. |
| `services::local_archive_import::import` | ZIP bytes only | Provides the pattern: validate → stage under a unique work dir in Central → take the Central lock → backup/swap → upsert → restore on failure. |

Result: no existing use case accepts an arbitrary directory with the required lock and rollback. Added
`services::installation::local_dir_import::{preview_local_dir_import, import_local_dir}` in `services/`. It reuses the
primitives `ensure_centralized` uses (`copy_dir_all_with_budget`, `run_blocking_fs`, `reject_pending_recovery`,
`acquire_target_mutation_guard(Local)`, `skills_repo::upsert_skill`) and the archive import's staging/swap/restore
shape. Upsert keeps the existing row `uid` (the upsert SQL never updates `uid`).

Policy decisions:

- Source path is resolved against the caller-supplied cwd, then canonicalized (a symlinked skill root is followed, as the
  scanner does). The skill id comes from the given path's final component (the link name, as in the scanner), falling
  back to the canonical name for `.`; same normalisation as the scanner. Ids that are empty or start with `.` are
  `path.invalid`.
- The canonical source must not equal, be inside, or contain the canonical Central root → `path.invalid`.
- `SKILL.md` must be a regular file at the root (`path.invalid` if missing) with frontmatter `name` (`input.invalid`).
- Nested symlinks anywhere in the tree are rejected (`path.invalid`), matching the archive import's symlink rejection.
  `copy_dir_all` would otherwise silently dereference file links that point outside the skill.
- Copying into a staging dir happens before the lock; the lock covers the pending-recovery check, existence recheck,
  backup/swap, and DB upsert. Staging is discarded on any failure, including `mutation.busy`.
