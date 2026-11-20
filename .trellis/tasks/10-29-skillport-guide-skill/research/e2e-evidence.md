# C3 end-to-end evidence

## 1. CLI-level run (isolated, VERIFIED)

Date: 2026-11-20, branch `dev`, release build from `npm run build:cli` (`skillport-cli 1.1.1`).

Environment: a fresh temporary directory used as both `HOME` and `USERPROFILE` (empty Local DB, no
developer profile data), with a sample project at `$TMP_HOME/sample-project`. Script:
the session scratch `c3-smoke.ps1` (not committed). Full commands with sanitized JSON output:
[`smoke-raw.md`](smoke-raw.md). `--help` capture: [`cli-help.md`](cli-help.md).

| Step | Command | Exit | Result |
| --- | --- | --- | --- |
| Preflight | `--version` | 0 | `skillport-cli 1.1.1` |
| Agents | `agents list` | 0 | `claude-code` enabled, `globalSkillsDir = $TMP_HOME\.claude\skills` |
| Bootstrap import (dry run) | `skills import --from-dir <repo>\skills\skillport --dry-run` | 0 | plan `action: create`, nothing written |
| Bootstrap import | same without `--dry-run` | 0 | new `uid`, `source = local-dir` |
| Duplicate guard | same again | 3 | `skill.duplicate` |
| Sync (dry run) | `skills sync skillport --agent claude-code --dry-run` | 0 | target `$TMP_HOME\.claude\skills\skillport` |
| Sync | same without `--dry-run` | 0 | 1 succeeded |
| Register project (dry run / real) | `projects add . --dry-run`, `projects add .` | 0 / 0 | `created: true` |
| Install to project (dry run / real) | `projects install . skillport --agent claude-code [--dry-run \| --yes]` | 0 / 0 | `symlink` into `sample-project/.claude/skills/skillport` |
| Unknown tag | `tags add skillport --tag agent-guide --dry-run` | 3 | `tag.not_found` (no implicit create) |
| Create tag (dry run / real) | `tags create agent-guide [--dry-run]` | 0 / 0 | `created: true` |
| Tag (dry run / real) | `tags add skillport --tag agent-guide --reason ... --confidence 0.9 [--dry-run \| --yes]` | 0 / 0 | `linked: 1`; `skills show` reports link `source: agent` |
| Note (dry run / real) | `--lang en notes set skillport --file note.md --author claude-code [--dry-run \| --yes]` | 0 / 0 | `model: agent:claude-code` |
| Overwrite guard | `notes set ... --text ...` without `--yes` | 2 | `input.confirmation_required`, `details.plans[0].replacesExisting = true` |
| Unlink guard | `skills unlink skillport --agent claude-code` | 2 | `input.confirmation_required` with plan |
| Uninstall / untag dry runs | `projects uninstall ... --dry-run`, `tags remove ... --dry-run` | 0 / 0 | plans only |

Filesystem checks after the run: Central copy has `SKILL.md` and `references/commands.md`; Claude Code
global `skillport/SKILL.md` exists; project `.claude/skills/skillport/SKILL.md` exists.

Help consistency: every command and flag used in `skills/skillport/SKILL.md` and
`references/commands.md` appears in [`cli-help.md`](cli-help.md).

## 2. Real Claude Code session (NOT RUN, UNVERIFIED)

Not run. On 2026-11-20 the user decided to archive the task without this session. It would write to
the real Local SkillPort profile (`~/.skillsmanage`) and the real `~/.claude/skills`, and needs
`skillport-cli` on `PATH`. The runbook below is kept for a later run.

Runbook:

1. `npm run install:cli`, then `skillport-cli --version`.
2. From the repository root: `skillport-cli --json skills import --from-dir skills/skillport --dry-run`,
   then without `--dry-run`; `skillport-cli --json skills sync skillport --agent claude-code --dry-run`,
   then without `--dry-run`.
3. Create an empty sample project directory and open a new Claude Code session there.
4. Ask: "Use SkillPort to register this project, install the skillport skill into it for Claude Code,
   tag it, and write an English note for it."
5. Confirm each plan only after the agent shows the dry run. Record below: the commands the agent ran,
   each JSON output, and whether every write was preceded by a dry run and a confirmation.
6. Optional C4 check: keep the SkillPort desktop window open, switch back after step 5, and confirm the
   new project, tag, and note appear without a restart.

## 3. Not verified

- Live skill loading in Codex, Grok, Antigravity, Kimi Code, and other agent tools.
