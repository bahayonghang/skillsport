# Technical Design: Unify Antigravity Platform to `~/.gemini/config/skills`

## 1. Architecture & Layer Boundaries

```
+-------------------------------------------------------------------+
| Frontend Registry & Path Policy (UI + Browser Demo Mode)          |
|  - src/lib/platformRegistry.ts (single registration point)        |
|  - src/lib/platformPathPolicy.ts (BROWSER_PLATFORM_PATHS)         |
|  - src/components/platform/PlatformIcon.tsx                       |
|  - src/fixtures/platform.ts                                       |
+-------------------------------------------------------------------+
                                  | IPC (unchanged contracts)
                                  v
+-------------------------------------------------------------------+
| Backend Seed, Types & CLI Mapping                                 |
|  - src-tauri/src/db/seed/agents.rs                                |
|  - src-tauri/src/db/types.rs                                      |
|  - src-tauri/src/services/skills_cli/agent_map.rs                 |
+-------------------------------------------------------------------+
                                  | DB Startup Pipeline
                                  v
+-------------------------------------------------------------------+
| SQLite Open -> Preflight -> VACUUM Backup -> Migrations (v1..v9)  |
|  -> Foreign Key Check -> seed_builtin_agents & scan_directories   |
+-------------------------------------------------------------------+
```

### 1.1 Backend Seed, Types & Skills CLI

1. **`src-tauri/src/db/seed/agents.rs`**:
   - Remove `"antigravity-cli"` from `DEFAULT_ENABLED_PLATFORM_IDS` (array length `7` -> `6`).
   - Update builtin `"antigravity"` entry:
     - `global_skills_dir`: `skill_dir(&[".gemini", "config", "skills"])`
     - `project_skills_dir`: `Some(UNIVERSAL_PROJECT_SKILLS_DIR.to_string())`
     - `icon_name`: `Some("antigravity".to_string())`
   - Remove builtin `"antigravity-cli"` entry (`37` -> `36` builtin agents).
   - Remote POSIX mapping (`builtin_agents_for_posix_home`): uses `rsplit("/.")` on normalized `"/__skillport_remote_home__/.gemini/config/skills"` which yields `".gemini/config/skills"` because `config` has no leading dot, rewriting cleanly to `<remote_home>/.gemini/config/skills`. Lock this with an explicit unit test assertion in `src-tauri/src/db/tests.rs` and `src-tauri/src/commands/agents/tests.rs`.
2. **`src-tauri/src/db/types.rs`**:
   - Update doc comment on `UNIVERSAL_AGENT_IDS` to reflect unified `Antigravity` using `~/.gemini/config/skills`.
   - Remove `"antigravity-cli"` from `UNIVERSAL_PROJECT_AGENT_IDS` (length `13` -> `12`).
   - Remove `"antigravity-cli"` from `UNIVERSAL_PROJECT_REPRESENTATIVE_AGENT_IDS` (length `7` -> `6`), keeping `"antigravity"` after `"opencode"`.
3. **`src-tauri/src/services/skills_cli/agent_map.rs`**:
   - Remove `("antigravity-cli", "antigravity-cli")` from `SKILLS_CLI_AGENT_MAP`.
   - Keep `("antigravity", "antigravity")` so the strict bijection check in `src-tauri/src/services/skills_cli/tests.rs::r4_every_builtin_is_mapped_or_explicitly_unsupported` (`36 == mapped.len() + unsupported.len()`) remains satisfied.
4. **`src-tauri/src/services/usage/providers/`**:
   - Already defines a single stub provider `"antigravity"` (`antigravity.rs`, `mod.rs`); no code change needed.

### 1.2 Frontend Single Registration Point & Presentation

Per `.trellis/spec/frontend/platform-grouping.md`:

1. **`src/lib/platformRegistry.ts`**:
   - Remove `{ id: "antigravity-cli", globalGroup: false, installPreference: 3 }` from `UNIVERSAL_PLATFORM_REGISTRY_ENTRIES`.
   - Re-index `installPreference` to remain contiguous `1..6` and preserve representative priority (`codex=1, opencode=2, antigravity=3, gemini-cli=4, cursor=5, amp=6`).
   - Remove `"antigravity-cli"` from `DEFAULT_ENABLED_PLATFORM_IDS`.
2. **`src/lib/platformPathPolicy.ts`**:
   - Update `BROWSER_PLATFORM_PATHS.antigravity.global_skills_dir` to `"~/.gemini/config/skills/"`.
   - Remove `"antigravity-cli"` from `BROWSER_PLATFORM_PATHS`.
3. **`src/components/platform/PlatformIcon.tsx`**:
   - Remove the `if (agentId === "antigravity-cli")` Terminal-badge branch and remove the unused `Terminal` import from `lucide-react`.
4. **`src/fixtures/platform.ts`**:
   - Remove `"antigravity-cli"` from `MOCK_AGENTS` and `MOCK_CACHED_SKILL_COUNTS`.

---

## 2. Database Migration (`v9`) & Seed Defense-in-Depth

### 2.1 Why a Versioned Migration Is Required

`seed_builtin_agents` (`src-tauri/src/db/seed.rs:81-94`) deletes retired `is_builtin = 1` rows from `agents`, and `seed_builtin_scan_directories` cleans retired `scan_directories` entries. However:

- If a user disabled `antigravity` and enabled `antigravity-cli`, `seed_builtin_agents` would drop `antigravity-cli` without transferring `is_enabled = 1` to `antigravity`.
- Tables referencing `agent_id` (`skill_installations`, `agent_skill_observations`, `project_skill_installations`, `skill_update_inventory_entries`) do NOT have foreign keys to `agents(id)`.
- `scanner/persistence.rs:301-314` only deletes stale rows for `agent_id IN scan_touched_install_agents` / `scan_touched_observation_agents`. Retired `agent_id = 'antigravity-cli'` is never scanned again, leaving orphaned rows forever.
- `project_skill_installations` has composite PK `(project_id, skill_id, agent_id)`. Real local DB currently has BOTH `('goal-meta-skill', 'antigravity')` AND `('goal-meta-skill', 'antigravity-cli')` for the same project; a naive `UPDATE` would hit a `UNIQUE` constraint error.
- Remote SSH/WSL target cache DBs (`~/.skillsmanage/targets/<id>/db.sqlite`) share the exact same migration pipeline (`open_database_for_remote_home`).

### 2.2 Immutable Migration `v9` Contract

Create `src-tauri/src/db/migrations/versions/v9.rs` (`pub(super) const SOURCE: &str = include_str!("v9.rs");`) and register it in `versions/mod.rs` (`MIGRATIONS: [MigrationDescriptor; 9]`) and `migrations.rs` (`apply_migration` + `migrate_and_seed`). Leave `v1`–`v8` completely untouched per `.trellis/spec/backend/database-migrations.md`.

Operations inside `v9::apply` (all within one transaction, guarded by automatic pre-migration `VACUUM INTO` backup):

1. **Preserve user enablement**:
   ```sql
   UPDATE agents
   SET is_enabled = 1
   WHERE id = 'antigravity'
     AND EXISTS (
       SELECT 1 FROM agents WHERE id = 'antigravity-cli' AND is_enabled = 1
     )
   ```
2. **Purge legacy installation records** (`antigravity-cli` rows and `antigravity` rows pointing to the retired `~/.gemini/antigravity/skills/` path so stale paths never linger before next scan):
   ```sql
   DELETE FROM skill_installations
   WHERE agent_id = 'antigravity-cli'
      OR (
        agent_id = 'antigravity'
        AND lower(replace(installed_path, '\', '/')) LIKE '%/.gemini/antigravity/skills/%'
      )
   ```
3. **Purge legacy observation records**:
   ```sql
   DELETE FROM agent_skill_observations
   WHERE agent_id = 'antigravity-cli'
      OR (
        agent_id = 'antigravity'
        AND (
          lower(replace(dir_path, '\', '/')) LIKE '%/.gemini/antigravity/skills/%'
          OR lower(replace(source_root, '\', '/')) LIKE '%/.gemini/antigravity/skills'
          OR lower(replace(source_root, '\', '/')) LIKE '%/.gemini/antigravity/skills/%'
        )
      )
   ```
4. **Deduplicate and remap `project_skill_installations`**:
   ```sql
   DELETE FROM project_skill_installations
   WHERE agent_id = 'antigravity-cli'
     AND EXISTS (
       SELECT 1
       FROM project_skill_installations existing
       WHERE existing.project_id = project_skill_installations.project_id
         AND existing.skill_id = project_skill_installations.skill_id
         AND existing.agent_id = 'antigravity'
     );

   UPDATE project_skill_installations
   SET agent_id = 'antigravity'
   WHERE agent_id = 'antigravity-cli';
   ```
5. **Clean inventory cache rows**:
   ```sql
   DELETE FROM skill_update_inventory_entries
   WHERE agent_id = 'antigravity-cli'
   ```
6. **Delete retired builtin agent row**:
   ```sql
   DELETE FROM agents
   WHERE id = 'antigravity-cli' AND is_builtin = 1
   ```

Followed by `seed_database_with_agents`, which updates `antigravity.global_skills_dir` to `~/.gemini/config/skills` and updates `scan_directories` (`is_builtin = 1`) to drop the two old paths and insert `~/.gemini/config/skills`.

### 2.3 Defense-in-Depth in `seed_builtin_agents`

In `src-tauri/src/db/seed.rs::seed_builtin_agents`, when removing any retired `is_builtin = 1` agent id, also clean residual rows for that `agent_id` in `skill_installations` and `agent_skill_observations` inside the cleanup loop so any future builtin retirement cannot orphan those tables.

### 2.4 Migration Test Locks

Per `.trellis/spec/backend/database-migrations.md`:
- Compute exact SHA-256 of normalized `v9.rs` and append to `migration_sources_are_checksum_locked` in `src-tauri/src/db/migrations/tests.rs`.
- Update `versions.len()` assertions (`8 -> 9`) in `selected_release_fixtures_upgrade_with_backup_and_cascades`.
- Bump future-version preflight test from `9` to `10` in `preflight_rejects_checksum_gap_and_future_versions_without_backup`.
- Add `migration_nine_merges_antigravity_cli_and_dedupes_project_installations` testing:
  - `antigravity` disabled + `antigravity-cli` enabled -> merged `antigravity` enabled;
  - `skill_installations` & `agent_skill_observations` cleanup (preserving unrelated agents and `~/.gemini/config/skills` entries);
  - `project_skill_installations` conflict deduplication (`('p1', 's1', 'antigravity')` kept + `('p1', 's1', 'antigravity-cli')` removed) and non-conflicting remap (`('p1', 's2', 'antigravity-cli')` -> `('p1', 's2', 'antigravity')`);
  - `open_database_for_remote_home` upgrade path.

### 2.5 Intentionally Untouched Historical Recovery Tests

`src-tauri/src/services/central_operation/force_abandon.rs:178` and `src-tauri/src/services/central_skills/tests.rs:1318` build path-only mock strings for historical Central delete recovery manifests without reading `agents`; keep them untouched to preserve unrelated test fidelity.

---

## 3. Documentation Alignment

Update current documentation so all platform lists, path tables, and explanations reflect single `Antigravity` at `~/.gemini/config/skills/`:
- `README.md`, `README_CN.md`
- `CONTEXT.md`
- `docs/guide/introduction.md`, `docs/guide/platforms.md`, `docs/guide/projects.md`
- `docs/reference/glossary.md`, `docs/reference/platform-paths.md`
- `docs/zh/guide/introduction.md`, `docs/zh/guide/platforms.md`, `docs/zh/guide/projects.md`
- `docs/zh/reference/glossary.md`, `docs/zh/reference/platform-paths.md`

For historical notes (`docs/desktop-design.md`, `docs/research-report.md`, `docs/blog/2026-04-09-research.md`, `docs/zh/blog/2026-04-09-research.md`), append/update dated addendum notes documenting the 2026-11-20 convergence to `~/.gemini/config/skills/` rather than erasing historical logs.

---

## 4. One-Time Local Machine Migration Design (R4)

Executed only **after** all Rust/Frontend/CI gates are green:

1. **Pre-flight Lock Check**:
   - Inspect running processes for `SkillPort` desktop app (read-only). Never kill user processes; if `SkillPort` is running and holding `~/.skillsmanage/db.sqlite`, pause and ask the user to close it before proceeding.
2. **Backups**:
   - Export pre-migration inventory JSON/manifest of `~/.gemini/antigravity/skills/`, `~/.gemini/antigravity-cli/skills/`, and `~/.gemini/config/skills/` to the task scratch/backup note (path-sanitized).
   - Copy `~/.skillsmanage/db.sqlite` to a timestamped sibling backup (in addition to `open_database`'s `.pre-migration-v8-*.sqlite3` `VACUUM INTO` snapshot).
3. **Safe Reparse-Point Removal**:
   - Enumerate every entry in `~/.gemini/antigravity/skills/` (expected 16 Central symlinks) and `~/.gemini/antigravity-cli/skills/` (expected 16 Central symlinks + `ego-browser` Junction + `tabbit` Junction).
   - For every entry, verify Windows `ReparsePoint` attribute (or `is_symlink()`) before removal — fail closed if any non-reparse regular directory or unexpected file exists.
   - Remove ONLY the reparse point non-recursively (`[System.IO.Directory]::Delete($entryPath, $false)` / `os.rmdir`), NEVER recursing into targets, NEVER deleting `~/.gemini/antigravity/` or `~/.gemini/antigravity-cli/` parent directories, and NEVER touching external targets (`~/.skillsmanage/skills/*`, `~/.local/share/ego/ego-skills`, `%LOCALAPPDATA%/Tabbit/LocalAgent/skills/tabbit`).
4. **Install via New `skillport-cli`**:
   - Invoke freshly built `cargo run --manifest-path src-tauri/Cargo.toml --bin skillport-cli -- ...`:
     1. `agents list --json` (triggers v9 DB migration + seed, confirms `antigravity` points to `~/.gemini/config/skills`).
     2. `skills sync <16 ids> --agent antigravity --method auto --dry-run --json` (inspect plan: 16 symlinks into `~/.gemini/config/skills/`, zero interference with existing 4 entries).
     3. `skills sync <16 ids> --agent antigravity --method auto --json` (creates 16 Central symlinks in `~/.gemini/config/skills/` and records `skill_installations` under Central mutation lock).
5. **Post-Migration Verification**:
   - Filesystem: old two `skills/` dirs empty (0 entries); `~/.gemini/config/skills/` has 20 entries (original 4 untouched + 16 Central symlinks); `~/.gemini/config/skills.json` still absent; `~/.gemini/skills/` untouched; external target dirs intact.
   - SQLite (read-only): `schema_migrations` at v9; `agents` has `antigravity` pointing to `~/.gemini/config/skills` and 0 `antigravity-cli` rows; `skill_installations` has 16 `antigravity` rows and 0 `antigravity-cli` rows; `project_skill_installations` has 1 deduplicated `antigravity` row.

---

## 5. Trade-offs & Rollback Strategy

- **No in-app automatic disk migration**: keeps application upgrades safe for existing users with potentially customized directories (per Q1), while still leaving existing user DBs completely clean via `v9`.
- **Single-source `antigravity` id**: preserves `antigravity` id and `usage` stub compatibility rather than minting a new id.
- **Code rollback**: `git revert` cleanly reverts code; `.pre-migration-v8-*.sqlite3` restores pre-v9 DB if ever needed.
- **Local rollback**: recreate the 16 + 18 symlinks/junctions from the recorded manifest and restore the timestamped `db.sqlite` copy.
- **Installed binary note**: local `skillport-cli` on `PATH` or installed Windows desktop app will retain old code until user runs `npm run install:cli` / `just install` (noted as a follow-up reminder after verification, not run silently unless requested).
