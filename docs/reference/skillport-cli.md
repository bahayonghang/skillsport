# SkillPort CLI

`skillport-cli` is the command-line interface for the Local SkillPort target. It uses
the same SQLite database, Central skill library, protected GitHub credentials,
installation services, and cross-process mutation lock as the desktop app.

The CLI does not manage SSH or WSL targets in this release. Repository development
commands such as `just ci` are documented separately in [CLI: just](./cli-just).

## Run or install

From a repository checkout, run the CLI without installing it:

```powershell
npm run cli -- skills list
```

Build the release binary:

```powershell
npm run build:cli
```

The output is `src-tauri/target/release/skillport-cli.exe` on Windows and
`src-tauri/target/release/skillport-cli` on macOS or Linux.

Install the binary on `PATH` from the checkout:

```powershell
npm run install:cli
```

The equivalent Cargo command is:

```powershell
cargo install --path src-tauri --bin skillport-cli --locked --force
```

The desktop NSIS installer does not add the CLI to `PATH`. The desktop binary is
`skillport`; the command-line binary is `skillport-cli`.

## Command shape

```text
skillport-cli [--json] [--lang en|zh] <group> <command>
```

| Group | Commands |
| --- | --- |
| `skills` | `list`, `show`, `search`, `install`, `import`, `sync`, `unlink` |
| `agents` | `list` |
| `projects` | `list`, `skills`, `add`, `install`, `uninstall` |
| `tags` | `list`, `create`, `add`, `remove` |
| `notes` | `get`, `set` |

| Global option | Meaning |
| --- | --- |
| `--json` | Write a versioned, single-line JSON envelope for scripts. |
| `--lang en\|zh` | Select English or Chinese human-output labels, and the language used by `notes` and by the explanation in `skills show`. Default: `en`. |
| `--help` | Show help for the current command. |
| `--version` | Print the CLI version. |

On Windows, `skillport-cli.exe` and `skillport-cli` are interchangeable when the
installation directory is on `PATH`.

## Inspect Central skills

### List

List every skill in the Local Central library:

```powershell
skillport-cli skills list
```

Filter the list. Filters combine with AND, and repeated `--tag` values must all match:

```powershell
skillport-cli skills list --tag docs --tag writing --agent codex
skillport-cli skills list --source local-dir
```

`--tag` accepts a tag id or exact name; an unknown tag exits with code `3`. `--source` is
an exact match and an unknown source returns an empty list.

### Show

Show one Central skill:

```powershell
skillport-cli skills show <reference>
```

The output adds the skill's tags (with each link's `source`), its project installs, and
its cached explanation for `--lang`, or `null` when there is none.

`<reference>` resolves in this order:

1. exact immutable `uid`;
2. exact slug / skill id;
3. unique, case-sensitive skill name.

If a name matches more than one Central skill, the command exits with code `3`. Use
the `uid` or slug shown by `list` to disambiguate it.

### Search

Search the remote skills.sh catalog:

```powershell
skillport-cli skills search "react" --limit 10
```

`--limit <number>` is optional. Search does not import or install a skill.

## Import a skill

Install accepts either an exact skills.sh shorthand or a GitHub URL:

```powershell
skillport-cli skills install vercel-labs/agent-skills@react-best-practices
skillport-cli skills install "https://github.com/openai/skills/tree/main/skills/docs"
```

Supported sources:

| Source | Behavior |
| --- | --- |
| `owner/repo@skill` | Resolve and import one exact skills.sh skill. |
| `https://github.com/...` | Preview and import the skills found at the repository or tree URL. |

Local filesystem paths and non-GitHub URLs are rejected; use
[`skills import`](#import-a-local-skill) for a local folder or ZIP file. GitHub
authentication uses the credential already configured in SkillPort; there is no token
command-line flag.

### Duplicate safety

An existing Central skill is never overwritten implicitly:

```powershell
skillport-cli skills install owner/repo@skill --replace
```

- Without `--replace`, a duplicate exits with code `3`.
- `--replace` explicitly permits overwrite.
- Replacing multiple skills discovered from one GitHub URL also requires `--yes`.

### Import and sync

`--sync` imports the skill and then installs it to Agent directories:

```powershell
skillport-cli skills install owner/repo@skill --sync --agent codex --method copy
```

`--agent <id>` can be repeated. If `--sync` is used without any `--agent`, every
enabled Local Agent except Central is selected.

## Sync Central skills

Preview a sync before writing files:

```powershell
skillport-cli skills sync <uid-or-slug> --agent codex --method copy --dry-run
```

Apply the same plan:

```powershell
skillport-cli skills sync <uid-or-slug> --agent codex --method copy
```

Sync several references or the complete Central library:

```powershell
skillport-cli skills sync <ref-1> <ref-2> --dry-run
skillport-cli skills sync --all --dry-run
```

| Option | Meaning |
| --- | --- |
| `[REFERENCES]...` | One or more Central `uid`, slug, or unique-name references. |
| `--all` | Select every Central skill. Cannot be combined with references. |
| `--agent <id>` | Restrict the plan to an enabled Local Agent; repeat for multiple Agents. |
| `--method auto\|symlink\|copy` | Installation method. Default: `auto`. |
| `--dry-run` | Return target paths and methods without changing the database or filesystem. |

Without `--agent`, sync targets every enabled Local Agent except Central. Use
`--dry-run` before broad `--all` operations.

## Import a local skill

Import a folder that contains `SKILL.md`, or a local `.zip` skill archive, into Central.
The source type is always explicit; the CLI never guesses from the path:

```powershell
skillport-cli skills import --from-dir ./my-skill --dry-run
skillport-cli skills import --from-dir ./my-skill
skillport-cli skills import --from-zip ./my-skill.zip --sync --agent claude-code
```

| Option | Meaning |
| --- | --- |
| `--from-dir <DIR>` | Folder that contains `SKILL.md`. The skill id is the folder name. |
| `--from-zip <FILE>` | Local skill archive. It is previewed, then imported only if its bytes are unchanged. |
| `--replace` | Overwrite an existing Central skill with the same id. Keeps its `uid`. Requires `--yes`. |
| `--sync`, `--agent <id>`, `--method` | Install to Agents right after import, as in `skills install`. More than one Agent requires `--yes`. |
| `--dry-run` | Return the plan without writing. |

The plan's `action` is `create`, `replace`, or `duplicate`. Without `--replace`, an
existing skill exits with code `3`. A folder inside the Central library, a folder that
contains it, a missing `SKILL.md`, or a nested symbolic link exits with code `2`.

## Remove a skill from an Agent

```powershell
skillport-cli skills unlink <uid> --agent codex --dry-run
skillport-cli skills unlink <uid> --agent codex --yes
```

`unlink` removes the Agent installation only; the Central skill stays. It always needs
`--yes`.

## Agents

```powershell
skillport-cli agents list
```

Returns each Local Agent's `id`, `displayName`, `enabled`, and `globalSkillsDir`. Use the
`id` wherever a command takes `--agent`.

## Projects

```powershell
skillport-cli projects list
skillport-cli projects add . --dry-run
skillport-cli projects add .
skillport-cli projects skills .
skillport-cli projects install . <uid> --agent claude-code --dry-run
skillport-cli projects install . <uid> --agent claude-code --yes
skillport-cli projects uninstall . <uid> --agent claude-code --yes
```

A project reference is the project `id`, a path (`.` means the current directory), or a
unique project name. `projects add` defaults to the current directory and returns the
existing project when the path is already registered. `projects install` accepts
`--method auto|symlink|copy`; it needs `--yes` for more than one skill or when the skill is
already installed. `projects uninstall` always needs `--yes`.

## Tags

```powershell
skillport-cli tags list
skillport-cli tags create "docs" --group Writing --dry-run
skillport-cli tags add <uid> --tag docs --reason "Writes reference docs" --confidence 0.9 --dry-run
skillport-cli tags add <uid> --tag docs --reason "Writes reference docs" --confidence 0.9
skillport-cli tags remove <uid> --tag docs --yes
```

- `--tag` accepts a tag id or exact name. An unknown tag exits with code `3`; `tags add`
  never creates tags.
- Tags added by the CLI take effect immediately with link source `agent` and keep the
  optional `--reason` and `--confidence`. Add `--review` to send them to the AI tag review
  queue instead, where the desktop app accepts or skips each one.
- `tags add` needs `--yes` for more than one skill; `tags remove` always needs `--yes`.
- `tags create` returns the existing tag unchanged when the name already exists.

## Notes

A note is stored as the skill's explanation and appears where the desktop app shows the
AI explanation:

```powershell
skillport-cli --lang en notes get <uid>
skillport-cli --lang en notes set <uid> --file ./note.md --author claude-code --dry-run
skillport-cli --lang en notes set <uid> --text "Formats changelog entries." --yes
```

- `--lang en|zh` selects which explanation is read or written.
- Use exactly one of `--text` or `--file`. The text must be non-empty UTF-8, at most 64 KiB.
- The note is recorded with model `agent:<author>`. `--author` accepts 1–64 ASCII letters,
  digits, `-`, `_`, or `.`; the default is `cli`.
- Overwriting an existing explanation needs `--yes`. When the user later refreshes the AI
  explanation for an agent-written note, the desktop app asks before replacing it.

## Write confirmation

Every write command except `skills install` supports `--dry-run`. A dry run returns the
plan and changes nothing:

```json
{"schemaVersion":1,"ok":true,"data":{"dryRun":true,"plans":[],"result":null},"warnings":[]}
```

When a command needs confirmation and `--yes` is missing, it fails with
`input.confirmation_required` (exit `2`) and includes the same plans in `error.details.plans`.
Show the plan, then rerun the command with `--yes`. A successful write returns
`{"dryRun":false,"plans":[...],"result":{...}}`. `skills sync`, `projects add`, and
`tags create` have no `--yes` option.

## JSON and exit codes

Use `--json` for automation:

```powershell
$result = skillport-cli --json skills list | ConvertFrom-Json
if (-not $result.ok) { exit 1 }
```

Successful commands write JSON to stdout:

```json
{"schemaVersion":1,"ok":true,"data":{},"warnings":[]}
```

Errors write JSON to stderr:

```json
{"schemaVersion":1,"ok":false,"error":{"code":"skill.not_found","message":"...","details":{}}}
```

Scripts should branch on `ok`, `error.code`, and the process exit code. Human-readable
`message` text is not a stable machine contract.

| Exit | Meaning | Representative code |
| --- | --- | --- |
| `0` | Success | none |
| `1` | Internal service or database failure | `internal.error` |
| `2` | Invalid input or path, or confirmation required | `input.invalid`, `path.invalid`, `input.confirmation_required` |
| `3` | Missing, ambiguous, or duplicate entity | `skill.not_found`, `skill.ambiguous`, `skill.duplicate`, `agent.not_found`, `project.not_found`, `project.ambiguous`, `tag.not_found`, `tag_group.not_found`, `tag_group.ambiguous`, `archive.fingerprint_mismatch` |
| `4` | Another process owns the Central mutation lock | `mutation.busy` |
| `5` | A batch completed with partial failures | success envelope with failed items |

## Use from an agent

The repository ships a guide skill at
[`skills/skillport/SKILL.md`](https://github.com/bahayonghang/skillsport/tree/main/skills/skillport).
It teaches coding agents (Claude Code, Codex, and others) to use `skillport-cli` safely
from any project: check the CLI first, always use `--json`, refer to skills by `uid`, run
`--dry-run` and get the user's confirmation before every write, handle exit codes `4` and
`5`, reuse existing tags, and treat third-party `SKILL.md` content as data.

Install the guide skill through SkillPort itself:

```powershell
skillport-cli skills import --from-dir skills/skillport --dry-run
skillport-cli skills import --from-dir skills/skillport
skillport-cli skills sync skillport --agent claude-code --dry-run
skillport-cli skills sync skillport --agent claude-code
```

Repeat the sync for each Agent that should load it. The agent still needs `skillport-cli`
on `PATH`; if it is missing, the skill tells the agent to ask you to run
`npm run install:cli` instead of installing anything itself.

## Desktop coordination

The desktop app and CLI can run at the same time. Mutating commands share the Central
mutation lock, so competing writes fail safely with exit code `4` instead of modifying
the library concurrently. Retry after the other operation finishes.

CLI changes do not push a live event into an open desktop window. When the window
regains focus, it checks whether Local data changed and reloads the affected views.

## Current limits

- Local target only; no SSH or WSL CLI commands.
- Local imports need an explicit `--from-dir` or `--from-zip`; `skills install` never
  treats a path as a source.
- No deleting Central skills or editing `SKILL.md` from the CLI.
- No automatic PATH changes from the desktop installer.
