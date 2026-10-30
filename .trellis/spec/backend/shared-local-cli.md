# Shared Local CLI Contract

## 1. Scope / Trigger

Apply this contract when changing `skillport-cli`, `cli_api`, CLI-visible service signatures, or Tauri packaging in a package with multiple Rust binaries. The MVP manages only the Local target.

Commands live in `cli_api/{skills,agents,projects,tags,notes,import}.rs`. `mod.rs` keeps `CliContext`, `CliApiError`, `CliEntity`, `parse_install_source`, and the `record_cli_mutation_log` helpers. `confirm.rs` owns the shared `--dry-run` / `--yes` decision.

## 2. Signatures

```rust
pub struct CliContext { /* DbPool + SecretStore + ActiveTarget::Local */ }

pub enum CliEntity { Skill, Agent, Project, Tag, TagGroup }

pub fn parse_install_source(value: &str) -> Result<InstallSource, CliApiError>;
pub async fn list_skills(&self) -> Result<Vec<CliSkill>, CliApiError>;
pub async fn list_skills_filtered(&self, tags: &[String], agent_id: Option<&str>, source: Option<&str>) -> Result<Vec<CliSkill>, CliApiError>;
pub async fn show_skill(&self, reference: &str, lang: &str) -> Result<CliSkillDetail, CliApiError>;
pub async fn list_agents(&self) -> Result<Vec<CliAgent>, CliApiError>;
pub async fn list_projects(&self) -> Result<Vec<CliProject>, CliApiError>;
pub async fn list_project_skills(&self, reference: &str, cwd: &Path) -> Result<Vec<CliProjectSkill>, CliApiError>;
pub async fn list_tags(&self) -> Result<Vec<CliTag>, CliApiError>;
pub async fn sync_skills(refs, all, agents, method, dry_run) -> Result<SyncOutput, CliApiError>;

// Write commands: every one returns MutationOutput<Plan, Result>.
pub struct MutationOutput<P, R> { pub dry_run: bool, pub plans: Vec<P>, pub result: Option<R> }
pub fn confirm::require<P: Serialize>(plans: &[P], needs_confirmation: bool, yes: bool, dry_run: bool)
    -> Result<ConfirmDecision /* DryRun | Proceed */, CliApiError>;
pub async fn import_skill(&self, request: SkillImportRequest<'_>) -> Result<MutationOutput<ImportPlan, ImportResult>, CliApiError>;
pub async fn unlink_skills(&self, refs: &[String], agent_id: &str, dry_run: bool, yes: bool) -> ...;
pub async fn add_project(&self, path: Option<&str>, cwd: &Path, dry_run: bool) -> ...;
pub async fn install_to_project(&self, request: ProjectInstallRequest<'_>) -> ...;
pub async fn uninstall_from_project(&self, project, refs, agent_id, cwd, dry_run, yes) -> ...;
pub async fn create_tag(&self, name, group, color, description, dry_run) -> ...;
pub async fn add_tags(&self, request: TagAddRequest<'_>) -> ...;
pub async fn remove_tags(&self, reference, tag_refs, dry_run, yes) -> ...;
pub async fn get_note(&self, reference, lang) / set_note(&self, reference, input, lang, author, dry_run, yes) -> ...;

// Service entry added for directory import (no earlier use case fit; see the C2 task design audit).
pub async fn services::installation::preview_local_dir_import(pool, source: &Path) -> Result<LocalDirImportPreview, InstallationError>;
pub async fn services::installation::import_local_dir(pool, source: &Path, replace: bool) -> Result<LocalDirImportResult, InstallationError>;
pub(crate) fn crate::fs_util::rename_with_retry(source: &Path, target: &Path) -> io::Result<()>;
```

`CliSkill` JSON keys, and the same keys on `CliSkillDetail`, are `uid`, `id`, `name`, `description`, `canonicalPath`, `linkedAgents`. `skills list` does not add fields. `skills show` adds only `tags` (`id`, `name`, `source`), `projects` (`projectId`, `name`, `path`, `agentId`, `installedPath`, `linkType`), and `explanation` (`{ lang, text, model }` or null).

`agents list` returns `id`, `displayName`, `enabled`, `globalSkillsDir` and omits the Central agent (`id == "central"` or `category == "central"`). `projects list` returns `id`, `name`, `path`, `pinned`. `tags list` returns `id`, `name`, `description`, `color`, and `group` (`{ id, name }` or null).

Development and installation entry points:

```powershell
npm run cli -- <args>
cargo install --path src-tauri --bin skillport-cli --locked --force
```

### Write commands

| Command | `--yes` required when | Lock | Service | Operation Log (category from GUI command) |
| --- | --- | --- | --- | --- |
| `skills import --from-zip <file>` | target exists and `--replace`, or `--sync` to more than one agent | Local Central (inside the service) | `local_archive_import` preview, then `import_local_skill_archive_impl` with the preview fingerprint | `import_local_skill_archive` |
| `skills import --from-dir <dir>` | same as ZIP | Local Central (inside the service) | `installation::import_local_dir` | action `cli_import_local_dir`, category/phase of `import_local_skill_archive` |
| `skills unlink <ref>... --agent A` | always | Local Central, per item (inside `installation::uninstall_skill`) | `installation::uninstall_skill` | `uninstall_skill_from_agent` / `batch_uninstall_skills_from_agent` |
| `projects add [path]` | never | none | `projects::add_project_impl` | `add_project` |
| `projects install <project> <ref>... --agent A` | more than one skill, or already installed | none (same as GUI; reads Central, writes the project) | `install_skill_to_project_impl` | `install_skill_to_project` |
| `projects uninstall <project> <ref>... --agent A` | always | none (same as GUI) | projects service | `uninstall_skill_from_project` |
| `tags create <name>` | never | none | `tags_repo` (one transaction with `--group`) | `create_skill_tag` |
| `tags add <ref>... --tag T...` | more than one skill | none | `assign_skill_tags(source = "agent")`, or `ai_tagging::enqueue_pending_tag_reviews` with `--review` | `assign_skill_tags` / `suggest_skill_tags` |
| `tags remove <ref> --tag T...` | always | none | `unassign_skill_tags` | `unassign_skill_tags` |
| `notes set <ref> (--text or --file)` | an explanation already exists for `--lang` | none | `upsert_skill_explanation`, `model = "agent:<author or cli>"` | `refresh_skill_explanation`, phase `database` |

`skills import` flags: exactly one of `--from-zip` / `--from-dir`, plus `--replace`, `--sync`, repeated `--agent`, `--method auto|symlink|copy`, `--dry-run`, `--yes`. Relative source paths resolve against the caller's cwd. `ImportPlan` keys: `sourceType` (`zip|dir`), `skillId`, `skillName`, `targetPath`, `action` (`create|replace|duplicate`), `exists`, `fileCount` / `totalBytes` (ZIP only, else null), `syncAgents`, `method` (null without `--sync`). `ImportResult` keys: `skillUid`, `skillId`, `replacedExisting`, `sync` (`SyncOutput` or null), `syncError` (`{ code, message }` or null).

## 3. Contracts

- `src/bin/skillport-cli.rs` owns Clap, human/JSON rendering, and process exit codes only.
- `cli_api` calls `services::*` and `db::repos::*`. It never calls `commands::*` or performs skill file placement directly.
- Skill refs resolve only against Central rows in order: exact uid, exact slug/id, unique case-sensitive name.
- Project refs resolve in order: exact id, then path, then unique case-sensitive name. `.` is the caller-supplied cwd. A reference is a path when it is `.`, absolute, or contains `/` or `\`. Comparison uses `services::projects::normalize_project_path` and `paths::paths_equivalent`.
- `skills list` filters are AND, applied in memory on `get_central_skills_impl`. Repeated `--tag` values are AND. `--tag` resolves by id, then exact name. `--source` is an exact match on the skill `source` string.
- Source classification for install is deterministic: github.com URL or `owner/repo@skill`; filesystem existence is not a classifier.
- JSON uses `schemaVersion: 1`, locale-neutral error codes, stdout for success, and stderr for errors/diagnostics.
- Read commands do not take the Central mutation lock and do not write operation logs. They do not call `SecretStore`.
- CLI mutations use the shared Central lock through existing services and write existing redacted operation logs.
- Lock use matches the GUI command for the same mutation (table above). `cli_api` never acquires the lock itself; the service does. Pure DB writes (tags, notes, projects add) and project install/uninstall take no Central lock.
- Every write command writes one terminal Operation Log row through `record_cli_mutation_log` with `details.source = "cli"`. Category and phase come from the GUI command's registry policy. Details carry counts, booleans, and static values only: no paths, archive names, fingerprints, note text, or raw errors. Failure rows store the stable CLI error code as `error_summary`. Dry runs and confirmation failures write no row.
- Confirmation contract (`confirm::require`): `--dry-run` always wins and returns `{ dryRun: true, plans, result: null }` with no DB, filesystem, or Operation Log write. A command whose policy needs confirmation and lacks `--yes` fails with `input.confirmation_required` / exit 2, and the error envelope carries `details.plans` (the same plan objects the dry run returns). Every other error has `details: {}`. Successful writes return `{ dryRun: false, plans, result }`.
- `skills import` order: validate method and `--sync` agents, read-only preview, plan. A dry run returns the plan (action `duplicate` when the target exists without `--replace`). Otherwise an existing Central row or target directory without `--replace` is `skill.duplicate` / 3 before confirmation. Replacing keeps the existing `uid` (the skills upsert never updates `uid`).
- ZIP import reads the archive twice in one call: preview, then the archive service re-reads and requires the preview's SHA-256 + length before any staging, Central, DB, or log write. A mismatch is `archive.fingerprint_mismatch`. Other archive failures use the archive module's safe `local_archive.<code>:<summary>` text as the message; entry names, absolute paths, and fingerprints never appear.
- Directory import canonicalizes the source (a symlinked skill root is followed, as the scanner does). The skill id is the given path's last component, lowercased with spaces replaced by `-` (scanner rule); `.` uses the canonical name. `path.invalid`: missing or non-directory source, source equal to, inside, or containing the canonical Central root, id empty or starting with `.`, missing `SKILL.md`, and any nested symlink. A `SKILL.md` without frontmatter `name` is `input.invalid`. The copy uses the `ResourceBudget::default_skill()` budget into a staging directory under the Central root before the lock; the lock covers the pending-recovery check, the existence recheck, backup/swap, and upsert. Every failure removes staging; a DB failure restores the previous directory. Imported rows use `source = "local-dir"`.
- `--sync` after an import calls `sync_skills` for the new skill. If that sync fails as a whole, the import result is still returned with `syncError` set, and the process exits 5.
- Windows renames of freshly written Central directories go through `fs_util::rename_with_retry` (OS error 5/32, bounded to about 2 s) inside a blocking closure. Antivirus or indexer handles otherwise make the swap flaky.
- `skills show` explanation reads `skill_explanations` for `--lang` (default `en`) through `get_skill_explanation_record_impl`. That read does not call the AI provider and does not delete empty rows. No row, or blank text, is `explanation: null`.

## 4. Validation & Error Matrix

| Condition | Code / exit |
| --- | --- |
| Invalid source, method, or sync scope | `input.invalid` / 2 |
| Missing skill | `skill.not_found` / 3 |
| Ambiguous skill name | `skill.ambiguous` / 3 |
| Duplicate skill (install, or import without `--replace`) | `skill.duplicate` / 3 |
| Write needs confirmation and `--yes` is missing | `input.confirmation_required` / 2, with `details.plans` |
| Invalid or missing local path (project path, import source, archive file, source overlapping Central, nested symlink, missing `SKILL.md`) | `path.invalid` / 2 |
| Unsafe or invalid archive (traversal, symlink entry, budget, layout, frontmatter) | `input.invalid` / 2 |
| ZIP bytes changed between preview and import | `archive.fingerprint_mismatch` / 3 |
| Missing or ambiguous `--group` for `tags create` | `tag_group.not_found` / `tag_group.ambiguous` / 3 |
| Missing agent | `agent.not_found` / 3 |
| Missing project | `project.not_found` / 3 |
| Ambiguous project name | `project.ambiguous` / 3 |
| Missing tag | `tag.not_found` / 3 |
| Shared mutation lock busy/timeout | `mutation.busy` / 4 |
| Mixed batch result (some items failed, or the import succeeded but its `--sync` failed) | success payload / 5 |
| Internal service or DB error | `internal.error` / 1 |
| Success | payload / 0 |

`agent.ambiguous` and `tag.ambiguous` exist so the `CliEntity` match is exhaustive. No read command produces them. Unknown `--source` returns an empty list, not an error. GitHub and marketplace not-found mappings stay `skill.not_found`.

## 5. Good / Base / Bad Cases

- Good: `install --sync` imports through GitHub/skills.sh services, then passes imported ids to the installation batch service.
- Good: `skills list --tag docs --tag writing --agent codex` returns only Central skills that have both tags and that agent.
- Base: `skills sync <ref> --dry-run` resolves Central skills and agents but writes no DB or filesystem state.
- Good: `skills import --from-dir skills/skillport --dry-run`, show the plan, then rerun without `--dry-run`; with `--replace`, add `--yes`.
- Good: while the desktop app holds the Central lock, `skills import` and `skills unlink` exit 4 with `mutation.busy` and leave Central and agent directories unchanged.
- Bad: `cli_api` taking the Central lock around a service that locks again; routing a directory import through `ensure_centralized` by inventing a non-central `skills` row; logging the archive path or fingerprint.
- Base: `skills show <uid> --lang zh` returns the cached zh explanation and its `model`, or null.
- Bad: copying Tauri command loops or invoking `commands::marketplace` from the binary or from `cli_api`.
- Bad: adding `tags` or `explanation` onto `skills list` items, or deleting an existing `CliSkill` JSON key.

## 6. Tests Required

- Parser table for shorthand, GitHub URL, unsupported URL, and local path rejection.
- Clap tests for `agents list`, `projects list`, `projects skills .`, `tags list`, and repeated `skills list --tag`.
- Stable uid/slug/name list-show tests plus non-Central name-shadow coverage.
- Project not-found, ambiguous name, and `.` with an explicit cwd. Do not change the process cwd.
- Unknown tag and unknown agent errors; unknown source returns an empty list.
- Show tags include link `source`. Explanation follows `--lang`. Operation-log count is unchanged. A secret store that panics on use still succeeds.
- JSON envelope and exit-code tests in the binary target.
- Each write command: a dry run leaves table counts and directory snapshots unchanged; commands with a confirmation policy return `input.confirmation_required` with plans when `--yes` is missing (`cli_api/{mutation_tests,install_mutation_tests,import_tests}.rs`).
- ZIP import: success, duplicate without `--replace`, `--replace` needs `--yes` and keeps `uid`, fingerprint mismatch with no write, path traversal rejected, missing file, `--sync` to one agent, multi-agent confirmation, unknown sync agent fails before import.
- Directory import: success, dry run, missing `SKILL.md` / bad frontmatter / missing path, source inside or containing Central, replace keeps `uid`, symlinked root followed and nested symlink rejected (skips when the OS refuses symlinks), DB failure restores the old directory with no staging residue.
- Binary lock test (`tests/cli_api_e2e.rs`): with the test process holding `HOME/.skillsmanage/locks/central-mutation.lock`, ZIP import, directory import, and `skills unlink --yes` each exit 4 with `mutation.busy` and the Central and agent trees are unchanged; after release the ZIP import succeeds.
- Temporary HOME binary smoke with an empty Local DB. On Windows set both `HOME` and `USERPROFILE` to that directory so the test cannot open the developer profile database.
- `pnpm entrypointcheck`, `just ci`, locked release CLI build, and Windows `pnpm tauri build`.
- Verify both `target/release/skillport.exe` and `target/release/skillport-cli.exe` exist and run their expected entry points.

## 7. Wrong vs Correct

```toml
# Wrong: multiple Cargo bins without an explicit default application target.
[package]
name = "skillport"

# Correct: Cargo and Tauri both resolve the desktop application as the main bin.
[package]
name = "skillport"
default-run = "skillport"
```

`mainBinaryName` only overrides the selected app binary's output filename. It does not
select a Cargo target and must not replace the `package.default-run` contract.

```rust
// Wrong: cli_api calls a Tauri command impl, or skills list grows show-only fields.
commands::agents::get_agents_impl(&pool).await?;

// Correct: read agents from the repository and resolve paths in cli_api.
let agents = crate::db::repos::agents_repo::get_all_agents(&pool).await?;
```
