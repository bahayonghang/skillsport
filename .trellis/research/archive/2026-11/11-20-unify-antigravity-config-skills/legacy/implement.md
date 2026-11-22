# Implementation Checklist: Unify Antigravity Platform to `~/.gemini/config/skills`

## Pre-Start Gate (Antigravity Inline Workflow)

- [x] `prd.md` converged (no open questions, all requirements & ACs testable, zero OS usernames/raw user home paths)
- [x] `design.md` reviewed & aligned with `.trellis/spec/`
- [x] `implement.md` complete with exact commands and rollback points
- [x] Note: Antigravity runs in inline workflow mode (`.trellis/workflow.md:430-434`), so `implement.jsonl` / `check.jsonl` curation is skipped and Phase 2 loads specs via `trellis-before-dev`.
- [ ] User approves the final planning summary -> run `python ./.trellis/scripts/task.py start 11-20-unify-antigravity-config-skills` (with `TRELLIS_CONTEXT_ID` or session hint if required).

---

## Ordered Implementation Steps

### Step 1: Load Relevant Specs (`trellis-before-dev`)
Read:
- `.trellis/spec/backend/database-migrations.md`
- `.trellis/spec/backend/path-policy.md`
- `.trellis/spec/backend/skills-cli-global.md`
- `.trellis/spec/frontend/platform-grouping.md`

### Step 2: SQLite Migration `v9` & Migration Tests (Backend)
1. Create `src-tauri/src/db/migrations/versions/v9.rs` (`apply` + `pub(super) const SOURCE: &str = include_str!("v9.rs");`) implementing the 6-step `antigravity-cli` -> `antigravity` merge/cleanup per `design.md` §2.2.
2. Register `v9` in `src-tauri/src/db/migrations/versions/mod.rs` (`MIGRATIONS` len `9`) and dispatch `9 => versions::v9::apply` + `if state.applied_version < 9` in `src-tauri/src/db/migrations.rs`.
3. Compute normalized SHA-256 of `v9.rs` (e.g., via `cargo test db::migrations --locked` or small python helper) and lock it in `src-tauri/src/db/migrations/tests.rs::migration_sources_are_checksum_locked`.
4. Update `versions.len()` assertions (`8 -> 9`) and future-version preflight test (`9 -> 10`) in `src-tauri/src/db/migrations/tests.rs`, and add `migration_nine_merges_antigravity_cli_and_dedupes_project_installations`.
5. Run focused gate:
   ```pwsh
   cargo test --manifest-path src-tauri/Cargo.toml db::migrations --locked
   ```

### Step 3: Backend Seed, Types, Skills CLI Map & Rust Tests
1. Edit `src-tauri/src/db/seed/agents.rs`:
   - Remove `"antigravity-cli"` from `DEFAULT_ENABLED_PLATFORM_IDS` and builtin list;
   - Change `antigravity.global_skills_dir` to `skill_dir(&[".gemini", "config", "skills"])`.
2. Edit `src-tauri/src/db/seed.rs`:
   - Add defense-in-depth cleanup in `seed_builtin_agents` when deleting retired `is_builtin = 1` agent rows (`skill_installations`, `agent_skill_observations`).
3. Edit `src-tauri/src/db/types.rs`:
   - Update `UNIVERSAL_AGENT_IDS` doc comment;
   - Remove `"antigravity-cli"` from `UNIVERSAL_PROJECT_AGENT_IDS` (12) and `UNIVERSAL_PROJECT_REPRESENTATIVE_AGENT_IDS` (6).
4. Edit `src-tauri/src/services/skills_cli/agent_map.rs`:
   - Remove `("antigravity-cli", "antigravity-cli")` from `SKILLS_CLI_AGENT_MAP`.
5. Update Rust tests:
   - `src-tauri/src/commands/agents/tests.rs` (`BUILTIN_AGENT_COUNT = 36`, verify `antigravity` remote path `/home/alice/.gemini/config/skills`)
   - `src-tauri/src/db/tests.rs` (36 builtins, `antigravity` path `~/.gemini/config/skills`, remote path `/home/alice/.gemini/config/skills`, default enabled set, remove `antigravity-cli` assertions)
   - `src-tauri/src/services/installation/tests.rs` (remove `test_project_install_uses_agents_dir_for_antigravity_cli`, retain `antigravity` test)
   - `src-tauri/src/services/projects/tests.rs` (remove `rescan_uses_antigravity_cli_as_universal_representative_when_it_is_the_enabled_member`, retain `antigravity` test)
6. Run focused Rust checks:
   ```pwsh
   cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check; cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings; cargo test --manifest-path src-tauri/Cargo.toml --locked
   ```

### Step 4: Frontend Platform Registry, Path Policy, Icon, Fixtures & Vitest
1. Edit `src/lib/platformRegistry.ts`: remove `antigravity-cli` from `UNIVERSAL_PLATFORM_REGISTRY_ENTRIES` and `DEFAULT_ENABLED_PLATFORM_IDS`; keep `installPreference` 1..6 contiguous (`codex=1, opencode=2, antigravity=3, gemini-cli=4, cursor=5, amp=6`).
2. Edit `src/lib/platformPathPolicy.ts`: update `antigravity.global_skills_dir` to `"~/.gemini/config/skills/"` and remove `"antigravity-cli"`.
3. Edit `src/components/platform/PlatformIcon.tsx`: remove `"antigravity-cli"` Terminal-badge special case and unused `Terminal` import.
4. Edit `src/fixtures/platform.ts`: remove `"antigravity-cli"` fixture and count entry.
5. Update Vitest files:
   - `src/test/lib/platformRegistry.test.ts`
   - `src/test/lib/platformPathPolicy.test.ts` (if present — check or add assertion if needed) / `src/test/lib/platformTargetGroups.test.ts`
   - `src/test/lib/platformVisibility.test.ts`
   - `src/test/lib/projectSkillPlatformGroups.test.ts`
   - `src/test/components/platform/PlatformIcon.test.tsx`
   - `src/test/components/central/InstallDialog.test.tsx`
   - `src/test/components/projects/ProjectInstallDialog.test.tsx`
6. Run focused frontend gates:
   ```pwsh
   pnpm typecheck && pnpm lint && pnpm test
   ```

### Step 5: Documentation Synchronization (EN & ZH)
1. Update `README.md`, `README_CN.md`, `CONTEXT.md`.
2. Update `docs/guide/{introduction,platforms,projects}.md`, `docs/reference/{glossary,platform-paths}.md` and `docs/zh/` equivalents.
3. Add dated 2026-11-20 convergence update notes to `docs/desktop-design.md`, `docs/research-report.md`, `docs/blog/2026-04-09-research.md`, and `docs/zh/blog/2026-04-09-research.md`.
4. Run docs & full repository CI gate:
   ```pwsh
   pnpm docs:gen:check && pnpm docs:build && just ci
   ```

### Step 6: One-Time Local Machine Migration & Verification (R4)
Run **only after** `just ci` passes:
1. Check no running `SkillPort` process locks `~/.skillsmanage/db.sqlite` (`Get-Process` read-only check; if active, pause and ask user to close).
2. Create timestamped backup of `~/.skillsmanage/db.sqlite` and save sanitized pre-migration directory inventory of `~/.gemini/antigravity/skills/`, `~/.gemini/antigravity-cli/skills/`, and `~/.gemini/config/skills/`.
3. Verify each entry in `~/.gemini/antigravity/skills/` (16) and `~/.gemini/antigravity-cli/skills/` (18) is a Windows `ReparsePoint` (`LinkType` in `SymbolicLink`/`Junction`); non-recursively unlink each reparse point only (`[IO.Directory]::Delete($p, $false)`). Never delete parent dirs or target dirs.
4. Run newly built `skillport-cli`:
   ```pwsh
   cargo run --manifest-path src-tauri/Cargo.toml --bin skillport-cli -- --json agents list
   cargo run --manifest-path src-tauri/Cargo.toml --bin skillport-cli -- --json skills sync answer-me-with-html check design-atlas gh-pr-release git-commit goal-meta-skill health huashu-design hunt laoyeye learn qiaomu-meta read think ui write --agent antigravity --method auto --dry-run
   cargo run --manifest-path src-tauri/Cargo.toml --bin skillport-cli -- --json skills sync answer-me-with-html check design-atlas gh-pr-release git-commit goal-meta-skill health huashu-design hunt laoyeye learn qiaomu-meta read think ui write --agent antigravity --method auto
   ```
5. Verify filesystem & SQLite read-back:
   - `~/.gemini/antigravity/skills/` (0 entries) & `~/.gemini/antigravity-cli/skills/` (0 entries);
   - `~/.gemini/config/skills/` (20 entries: 16 Central symlinks + 4 preserved existing entries);
   - `~/.gemini/config/skills.json` absent; `~/.gemini/skills/` untouched; external target dirs intact;
   - `~/.skillsmanage/db.sqlite` at v9 with 0 `antigravity-cli` rows across all tables.

### Step 7: Trellis Wrap-Up (`trellis-check` & `trellis-update-spec`)
1. Review spec compliance (`trellis-check`).
2. Check whether `.trellis/spec/` needs updates (e.g. `database-migrations.md` v9 entry if historical versions are listed, or `platform-grouping.md`).
3. Present batched commit plan per Phase 3.4 before committing/wrapping up.

---

## Risky Files & Rollback Points

| Risk Area | File / Target | Safeguard & Rollback |
|---|---|---|
| Immutable DB migrations | `src-tauri/src/db/migrations/versions/v1..v8.rs` | **Never edit v1–v8**; only append `v9.rs`. Rollback DB via `.pre-migration-v8-*.sqlite3`. |
| Skills CLI bijection | `src-tauri/src/services/skills_cli/agent_map.rs` | Verified by `r4_every_builtin_is_mapped_or_explicitly_unsupported`. |
| Local reparse-point removal | `~/.gemini/antigravity{,-cli}/skills/*` | Must assert `ReparsePoint` per entry & non-recursive delete; restore from saved inventory manifest + DB copy if needed. |
| Desktop DB lock | `~/.skillsmanage/db.sqlite` | Read-only process check before running `skillport-cli` migration. |
