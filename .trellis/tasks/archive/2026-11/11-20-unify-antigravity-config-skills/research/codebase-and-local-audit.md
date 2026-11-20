# Codebase & Local Audit: Unify Antigravity to `~/.gemini/config/skills`

## 1. Background (User-Provided Reference & Current UI)

- Antigravity now exposes three clients sharing one canonical config root:
  - **Antigravity app** (2.0 desktop client)
  - **Antigravity IDE** (standalone editor)
  - **Antigravity CLI** (`agy`)
- **Three-client shared paths**:
  - `~/.gemini/config/skills/`
  - `~/.gemini/config/skills.json`
  - `~/.gemini/config/plugins/`
- **Legacy client-only paths**:
  - IDE-only: `~/.gemini/antigravity/skills/`
  - CLI-only: `~/.gemini/antigravity-cli/skills/` and `~/.gemini/skills/`
- None of the three clients read `~/.agents/skills/` by default unless explicitly mounted in `~/.gemini/config/skills.json`.
- Current SkillPort Platform Management UI lists two separate entries:
  - `Antigravity` (`~/.gemini/antigravity/skills`)
  - `Antigravity CLI` (`~/.gemini/antigravity-cli/skills`)

---

## 2. Codebase Impact Inventory

### 2.1 Backend Seed, Types & DB Compatibility

- `src-tauri/src/db/seed/agents.rs:5-13,349-369`
  - `DEFAULT_ENABLED_PLATFORM_IDS` currently includes both `"antigravity"` and `"antigravity-cli"`.
  - Builtin agent definitions define separate `"antigravity"` (`~/.gemini/antigravity/skills`) and `"antigravity-cli"` (`~/.gemini/antigravity-cli/skills`).
  - `builtin_agents_for_posix_home` (`src-tauri/src/db/seed/agents.rs:20-56`) rewrites local paths to remote POSIX home via `rsplit("/.")`. For `.gemini/config/skills`, `rsplit("/.")` splits at `/.gemini/config/skills` -> `.gemini/config/skills` (because `config` has no leading dot); keep dedicated unit test coverage for this case.
- `src-tauri/src/db/types.rs:64-113`
  - `UNIVERSAL_AGENT_IDS` doc comment still describes separate `~/.gemini/antigravity/skills` and `~/.gemini/antigravity-cli/skills`.
  - `UNIVERSAL_PROJECT_AGENT_IDS` includes both `"antigravity"` and `"antigravity-cli"`.
  - `UNIVERSAL_PROJECT_REPRESENTATIVE_AGENT_IDS` lists `"antigravity-cli"` before `"antigravity"`.
- `src-tauri/src/db/seed.rs:51-138`
  - `seed_builtin_agents` updates `global_skills_dir` for existing non-central builtin agents and deletes retired `is_builtin = 1` rows from `agents`.
  - `seed_builtin_scan_directories` removes retired builtin paths from `scan_directories`.
- **SQLite Upgrade / Compatibility Gaps**:
  - `seed_builtin_agents` deletes retired `is_builtin = 1` rows from `agents`, but does NOT merge `is_enabled` or clean referencing rows in tables lacking foreign keys to `agents(id)`:
    - `agents.is_enabled`: if a user previously enabled only `antigravity-cli` and disabled `antigravity`, `antigravity.is_enabled` should preserve enabled state via `MAX(antigravity, antigravity-cli)`.
    - `skill_installations` (`src-tauri/src/db/schema/core.rs:73-81`): `scanner/persistence.rs:301-307` only prunes rows where `agent_id IN scan_touched_install_agents`, so rows with retired `agent_id = 'antigravity-cli'` would stay orphaned forever.
    - `agent_skill_observations` (`src-tauri/src/db/schema/core.rs:104-120`): same pruning scope; retired `agent_id = 'antigravity-cli'` rows would remain orphaned.
    - `project_skill_installations` (`src-tauri/src/db/schema/projects.rs:31-45`): PK is `(project_id, skill_id, agent_id)`. Real local DB currently has BOTH `('goal-meta-skill', 'antigravity')` AND `('goal-meta-skill', 'antigravity-cli')` for the same project. Must deduplicate/remap `antigravity-cli` -> `antigravity` (delete conflicting `antigravity-cli` rows where `antigravity` already exists, update non-conflicting rows to `antigravity`).
    - `skill_update_inventory_entries` (`src-tauri/src/db/schema/metadata.rs:302`): clean any rows with `agent_id = 'antigravity-cli'`.
  - Per `.trellis/spec/backend/database-migrations.md`, SQLite migrations are versioned (`v1`–`v8` in `src-tauri/src/db/migrations/versions/mod.rs` and `src-tauri/src/db/migrations.rs`). Adding `v9` runs before `seed_database_with_agents` with automatic pre-migration `VACUUM INTO` backup on both local DB and remote SSH/WSL target-cache DBs (`open_database_for_remote_home`), and requires updating locked digests and bumping the future-version preflight fixture (`10`). Also add defense-in-depth cleanup in `seed_builtin_agents` when removing retired builtin agents.

### 2.2 Skills CLI Mapping & Usage Providers

- `src-tauri/src/services/skills_cli/agent_map.rs:29-30`
  - `SKILLS_CLI_AGENT_MAP` maps both `("antigravity", "antigravity")` and `("antigravity-cli", "antigravity-cli")`.
  - `src-tauri/src/services/skills_cli/tests.rs:214-234` enforces a strict bijection between `builtin_agents()` and `SKILLS_CLI_AGENT_MAP ∪ SKILLS_CLI_UNSUPPORTED`. Removing `antigravity-cli` from seed requires removing `("antigravity-cli", "antigravity-cli")` from `SKILLS_CLI_AGENT_MAP`. Verify during design whether `("antigravity", "antigravity")` remains mapped or needs adjustment against upstream CLI behavior.
- `src-tauri/src/services/usage/providers/antigravity.rs` & `src-tauri/src/services/usage/providers/mod.rs`
  - Already use a single stub provider id `"antigravity"` (no `antigravity-cli` provider existed).

### 2.3 Frontend

- `src/lib/platformRegistry.ts:18-66` (single registration point per `.trellis/spec/frontend/platform-grouping.md`):
  - Remove `antigravity-cli` from `UNIVERSAL_PLATFORM_REGISTRY_ENTRIES` and `DEFAULT_ENABLED_PLATFORM_IDS`.
  - Keep `antigravity` with `globalGroup: false` and unique `installPreference`.
- `src/lib/platformPathPolicy.ts:21-28`:
  - Update `BROWSER_PLATFORM_PATHS.antigravity.global_skills_dir` to `"~/.gemini/config/skills/"`.
  - Remove `"antigravity-cli"`.
- `src/components/platform/PlatformIcon.tsx:25,62,96-109`:
  - Remove `"antigravity-cli"` Terminal-badge special case (and remove unused `Terminal` import if no longer referenced).
- `src/fixtures/platform.ts:40-57,120-121`:
  - Remove `"antigravity-cli"` fixture and count entry.

### 2.4 Tests

- Backend:
  - `src-tauri/src/commands/agents/tests.rs`
  - `src-tauri/src/db/tests.rs`
  - `src-tauri/src/db/migrations/tests.rs`
  - `src-tauri/src/services/installation/tests.rs`
  - `src-tauri/src/services/projects/tests.rs`
  - `src-tauri/src/services/central_operation/force_abandon.rs:178` (inspect fixture semantics)
  - `src-tauri/src/services/central_skills/tests.rs:1318` (inspect fixture semantics)
  - `src-tauri/src/services/skills_cli/tests.rs`
- Frontend:
  - `src/test/components/central/InstallDialog.test.tsx`
  - `src/test/components/platform/PlatformIcon.test.tsx`
  - `src/test/components/projects/ProjectInstallDialog.test.tsx`
  - `src/test/lib/platformRegistry.test.ts`
  - `src/test/lib/platformTargetGroups.test.ts`
  - `src/test/lib/platformVisibility.test.ts`
  - `src/test/lib/projectSkillPlatformGroups.test.ts`

### 2.5 Docs & Public Wording

- `README.md`, `README_CN.md`, `CONTEXT.md`
- `docs/guide/introduction.md`, `docs/guide/platforms.md`, `docs/guide/projects.md`
- `docs/reference/glossary.md`, `docs/reference/platform-paths.md`
- `docs/zh/guide/introduction.md`, `docs/zh/guide/platforms.md`, `docs/zh/guide/projects.md`
- `docs/zh/reference/glossary.md`, `docs/zh/reference/platform-paths.md`
- Historical research/design notes (`docs/desktop-design.md`, `docs/research-report.md`, `docs/blog/2026-04-09-research.md`, `docs/zh/blog/2026-04-09-research.md`): add dated update notes where appropriate rather than rewriting historical logs.
- Check `pnpm docs:gen:check` and `pnpm docs:build` during verification (generated docs are not expected to change unless Tauri commands or `src-tauri/src/db/schema/` change).

---

## 3. Sanitized Local Machine Audit (Read-Only)

- **`~/.gemini/antigravity/skills/`** (16 entries): ALL 16 are symlinks to `~/.skillsmanage/skills/<id>`:
  - `answer-me-with-html`, `check`, `design-atlas`, `gh-pr-release`, `git-commit`, `goal-meta-skill`, `health`, `huashu-design`, `hunt`, `laoyeye`, `learn`, `qiaomu-meta`, `read`, `think`, `ui`, `write`
- **`~/.gemini/antigravity-cli/skills/`** (18 entries):
  - Same 16 symlinks to `~/.skillsmanage/skills/<id>`.
  - Plus 2 external Junctions (not in Central):
    - `ego-browser` -> `~/.local/share/ego/ego-skills`
    - `tabbit` -> `%LOCALAPPDATA%/Tabbit/LocalAgent/skills/tabbit`
- **`~/.gemini/config/skills/`** (4 existing entries):
  - `chinese-novelist` (real directory, not in Central)
  - `client-maintenance` (real directory, not in Central)
  - `ego-browser` (Junction -> `~/.local/share/ego/ego-skills`, identical to `antigravity-cli`)
  - `tabbit` (Junction -> `%LOCALAPPDATA%/Tabbit/LocalAgent/skills/tabbit`, identical to `antigravity-cli`)
- **`~/.gemini/skills/`** (`gemini-cli` legacy): 1 Junction (`tabbit`).
- **`~/.gemini/config/skills.json`**: does not exist.
- **`~/.skillsmanage/db.sqlite`** (read-only):
  - `schema_migrations`: v1..v8 applied.
  - `agents`: `antigravity` (`is_enabled=1`), `antigravity-cli` (`is_enabled=1`), `gemini-cli` (`is_enabled=0`).
  - `skill_installations`: `antigravity` = 16 symlinks, `antigravity-cli` = 18 symlinks, `gemini-cli` = 1 symlink.
  - `project_skill_installations`: 1 project has BOTH `('goal-meta-skill', 'antigravity')` AND `('goal-meta-skill', 'antigravity-cli')`.
  - `skill_saved_views`, `skill_update_inventory_runs`, `skill_update_inventory_entries`, `settings`: 0 references to `antigravity-cli`.
- **Remote target cache DB** (`~/.skillsmanage/targets/<ssh-target-id>/db.sqlite`):
  - Contains `('antigravity', 15)` and `('antigravity-cli', 15)` in `skill_installations` (confirming DB migration must also apply cleanly to remote target cache DBs).
- **`~/.agents/skills/`** (13 entries):
  - 9 Central symlinks overlapping with the 16 Antigravity Central skills: `check`, `design-atlas`, `health`, `hunt`, `learn`, `read`, `think`, `ui`, `write`.
  - 2 external Junctions also already in `~/.gemini/config/skills/`: `ego-browser`, `tabbit`.
  - 2 native directories not installed in Antigravity: `find-skills`, `handoff`.
  - Remaining 7 of the 16 Antigravity Central skills (`answer-me-with-html`, `gh-pr-release`, `git-commit`, `goal-meta-skill`, `huashu-design`, `laoyeye`, `qiaomu-meta`) are NOT in `~/.agents/skills/`.
- **`~/.gemini/config/`**:
  - Contains `hooks/`, `node_modules/`, `plugins/`, `projects/`, `scripts/`, `sidecars/`, `skills/`, `.migrated`, `config.json`, `hooks.json`, `hooks.json.bak`, `import_manifest.json`, `mcp_config.json` (no `skills.json`).
- **Safety note**:
  - `~/.gemini/antigravity/` and `~/.gemini/antigravity-cli/` hold other runtime data (such as `brain/`), so local cleanup must NEVER delete those parent directories; only the old skill link entries inside `~/.gemini/antigravity/skills/` and `~/.gemini/antigravity-cli/skills/` are removed.
