# C1 Design

The overall design is in the parent task's `design.md` §2 (layering), §3 (command table, read-only rows), and §4 (JSON and error contract).

Decisions specific to this child:

- Module split: `cli_api/{mod.rs, skills.rs, agents.rs, projects.rs, tags.rs}`. `mod.rs` keeps `CliContext`,
  `CliApiError`, `parse_install_source`, and the shared reference resolution. Every `pub` signature stays reachable
  from its current path (re-export from `mod.rs`) so the binary does not need to change all at once.
- Entity-level errors: expand `CliApiError::{NotFound, Ambiguous}` into a structured variant that carries the entity
  kind (`Skill | Agent | Project | Tag`), and have `code()` derive the code from the kind. Existing `Skill` codes
  stay byte-for-byte identical.
- Project reference resolution order: id → path after `std::fs::canonicalize` plus Windows case normalization
  (reuse the normalization in `services/projects`) → unique name. Do not invent a separate path comparison rule.
- `skills list` filtering is done in memory on the result of `get_central_skills_impl`, which is at most a few
  thousand rows; no new SQL. If performance becomes a problem, move filtering down to the repository later.
- The `explanation` field in `show` reads from the `skill_explanations` repository. With no `--lang` it uses the
  CLI's `--lang` value.
