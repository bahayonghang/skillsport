# skillport-cli command reference

All commands accept the global options `--json` and `--lang en|zh`. Write commands return
`data = { dryRun, plans, result }`; with `--dry-run`, `result` is `null` and nothing changes.

## Read

| Command | `data` |
| --- | --- |
| `skills list [--tag T]... [--agent A] [--source S]` | array of `{ uid, id, name, description, canonicalPath, linkedAgents }`. Filters combine with AND; repeated `--tag` means all tags. |
| `skills show <ref>` | the list keys plus `tags[] { id, name, source }`, `projects[] { projectId, name, path, agentId, installedPath, linkType }`, `explanation { lang, text, model }` or null (language from `--lang`). |
| `skills search <query> [--limit N]` | skills.sh catalog results. Remote search only; imports nothing. |
| `agents list` | array of `{ id, displayName, enabled, globalSkillsDir }`. Central is excluded. |
| `projects list` | array of `{ id, name, path, pinned }`. |
| `projects skills <project>` | array of `{ skillId, name, description, agentId, agentDisplayName, installedPath, linkType }`. |
| `tags list` | array of `{ id, name, description, color, group { id, name } or null }`. |
| `notes get <ref>` | `{ uid, id, lang, explanation }` for the `--lang` language. |

## Write

| Command | `--yes` needed when | Plan keys |
| --- | --- | --- |
| `skills import (--from-dir DIR \| --from-zip FILE) [--replace] [--sync] [--agent A]... [--method M] [--dry-run] [--yes]` | target exists and `--replace`, or `--sync` to more than one agent | `sourceType`, `skillId`, `skillName`, `targetPath`, `action` (`create`/`replace`/`duplicate`), `exists`, `fileCount`, `totalBytes`, `syncAgents`, `method` |
| `skills sync <ref>... \| --all [--agent A]... [--method M] [--dry-run]` | no `--yes` option | `uid`, `id`, `agentId`, `targetPath`, `method` |
| `skills unlink <ref>... --agent A [--dry-run] [--yes]` | always | `skillUid`, `skillId`, `agentId`, `installed`, `linkType`, `targetPath` |
| `skills install <owner/repo@skill \| github-url> [--replace] [--yes] [--sync] [--agent A]... [--method M]` | replacing several skills from one URL | no dry run |
| `projects add [path] [--dry-run]` | never (no `--yes` option) | `id`, `name`, `path`, `exists` |
| `projects install <project> <ref>... --agent A [--method M] [--dry-run] [--yes]` | more than one skill, or already installed | `projectId`, `projectPath`, `skillUid`, `skillId`, `agentId`, `targetPath`, `action`, `method`, `alreadyInstalled` |
| `projects uninstall <project> <ref>... --agent A [--dry-run] [--yes]` | always | same as install, `action: "uninstall"` |
| `tags create <name> [--group G] [--color C] [--description D] [--dry-run]` | never (no `--yes` option) | `id`, `name`, `description`, `color`, `group`, `exists` |
| `tags add <ref>... --tag T... [--reason R] [--confidence F] [--review] [--dry-run] [--yes]` | more than one skill | `skillUid`, `skillId`, `tagId`, `tagName`, `action` (`link`/`review`), `alreadyLinked`, `currentSource` |
| `tags remove <ref> --tag T... [--dry-run] [--yes]` | always | same keys, `action: "unlink"` |
| `notes set <ref> (--text T \| --file F) [--author A] [--dry-run] [--yes]` | an explanation already exists for `--lang` | `uid`, `id`, `lang`, `model`, `bytes`, `replacesExisting`, `previousModel` |

Results:

- `skills import`: `{ skillUid, skillId, replacedExisting, sync, syncError }`. Exit 5 when the import
  succeeded but `--sync` failed.
- `skills sync` / `unlink`: `{ succeeded[], skipped[], failed[] }`. Items in this result use snake_case
  keys (`skill_id`, `agent_id`, `target_path`). Exit 5 when some items failed.
- `projects add`: `{ created, project, skillCount }`.
- `projects install` / `uninstall`: `{ succeeded[] { skillId, agentId, installedPath }, skipped[], failed[] { skillId, agentId, error } }`.
  Exit 5 when some items failed.
- `tags create`: `{ created, tag }`. An existing name returns the existing tag unchanged.
- `tags add` / `remove`: `{ linked, queued, removed }`. `queued` counts `--review` suggestions.
- `notes set`: the same shape as `notes get`, after the write.

`--method` is `auto`, `symlink`, or `copy` (default `auto`).

## References

- Skill: `uid`, then exact slug/id, then unique case-sensitive name. Central skills only.
- Project: exact `id`, then path (`.`, absolute, or containing `/` or `\`), then unique name.
- Tag: id, then exact name. Unknown names fail with `tag.not_found`.
- Agent: the `id` from `agents list`.

## Error codes

| Code | Exit |
| --- | --- |
| `input.invalid`, `input.confirmation_required`, `path.invalid` | 2 |
| `skill.not_found`, `skill.ambiguous`, `skill.duplicate`, `agent.not_found`, `project.not_found`, `project.ambiguous`, `tag.not_found`, `tag_group.not_found`, `tag_group.ambiguous`, `archive.fingerprint_mismatch` | 3 |
| `mutation.busy` | 4 |
| `internal.error` | 1 |
| partial batch failure (success envelope) | 5 |

## Example: confirmation required

```json
{"schemaVersion":1,"ok":false,"error":{"code":"input.confirmation_required","message":"This operation requires confirmation; review details.plans and rerun with --yes","details":{"plans":[{"agentId":"claude-code","installed":true,"linkType":"symlink","skillId":"skillport","skillUid":"a6a66818-34d5-4f30-aac9-70335e07f659","targetPath":"~\\.claude\\skills\\skillport"}]}}}
```

Show `details.plans` to the user, then rerun the same command with `--yes`.
