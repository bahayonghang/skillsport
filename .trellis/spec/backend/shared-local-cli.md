# Shared Local CLI Contract

## 1. Scope / Trigger

Apply this contract when changing `skillport-cli`, `cli_api`, CLI-visible service signatures, or Tauri packaging in a package with multiple Rust binaries. The MVP manages only the Local target.

Read commands live in `cli_api/{skills,agents,projects,tags}.rs`. `mod.rs` keeps `CliContext`, `CliApiError`, `CliEntity`, and `parse_install_source`.

## 2. Signatures

```rust
pub struct CliContext { /* DbPool + SecretStore + ActiveTarget::Local */ }

pub enum CliEntity { Skill, Agent, Project, Tag }

pub fn parse_install_source(value: &str) -> Result<InstallSource, CliApiError>;
pub async fn list_skills(&self) -> Result<Vec<CliSkill>, CliApiError>;
pub async fn list_skills_filtered(&self, tags: &[String], agent_id: Option<&str>, source: Option<&str>) -> Result<Vec<CliSkill>, CliApiError>;
pub async fn show_skill(&self, reference: &str, lang: &str) -> Result<CliSkillDetail, CliApiError>;
pub async fn list_agents(&self) -> Result<Vec<CliAgent>, CliApiError>;
pub async fn list_projects(&self) -> Result<Vec<CliProject>, CliApiError>;
pub async fn list_project_skills(&self, reference: &str, cwd: &Path) -> Result<Vec<CliProjectSkill>, CliApiError>;
pub async fn list_tags(&self) -> Result<Vec<CliTag>, CliApiError>;
pub async fn sync_skills(refs, all, agents, method, dry_run) -> Result<SyncOutput, CliApiError>;
```

`CliSkill` JSON keys, and the same keys on `CliSkillDetail`, are `uid`, `id`, `name`, `description`, `canonicalPath`, `linkedAgents`. `skills list` does not add fields. `skills show` adds only `tags` (`id`, `name`, `source`), `projects` (`projectId`, `name`, `path`, `agentId`, `installedPath`, `linkType`), and `explanation` (`{ lang, text, model }` or null).

`agents list` returns `id`, `displayName`, `enabled`, `globalSkillsDir` and omits the Central agent (`id == "central"` or `category == "central"`). `projects list` returns `id`, `name`, `path`, `pinned`. `tags list` returns `id`, `name`, `description`, `color`, and `group` (`{ id, name }` or null).

Development and installation entry points:

```powershell
npm run cli -- <args>
cargo install --path src-tauri --bin skillport-cli --locked --force
```

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
- `skills show` explanation reads `skill_explanations` for `--lang` (default `en`) through `get_skill_explanation_record_impl`. That read does not call the AI provider and does not delete empty rows. No row, or blank text, is `explanation: null`.

## 4. Validation & Error Matrix

| Condition | Code / exit |
| --- | --- |
| Invalid source, method, or sync scope | `input.invalid` / 2 |
| Missing skill | `skill.not_found` / 3 |
| Ambiguous skill name | `skill.ambiguous` / 3 |
| Duplicate skill | `skill.duplicate` / 3 |
| Missing agent | `agent.not_found` / 3 |
| Missing project | `project.not_found` / 3 |
| Ambiguous project name | `project.ambiguous` / 3 |
| Missing tag | `tag.not_found` / 3 |
| Shared mutation lock busy/timeout | `mutation.busy` / 4 |
| Mixed batch result | success payload / 5 |
| Internal service or DB error | `internal.error` / 1 |
| Success | payload / 0 |

`agent.ambiguous` and `tag.ambiguous` exist so the `CliEntity` match is exhaustive. No read command produces them. Unknown `--source` returns an empty list, not an error. GitHub and marketplace not-found mappings stay `skill.not_found`.

## 5. Good / Base / Bad Cases

- Good: `install --sync` imports through GitHub/skills.sh services, then passes imported ids to the installation batch service.
- Good: `skills list --tag docs --tag writing --agent codex` returns only Central skills that have both tags and that agent.
- Base: `skills sync <ref> --dry-run` resolves Central skills and agents but writes no DB or filesystem state.
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
