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
