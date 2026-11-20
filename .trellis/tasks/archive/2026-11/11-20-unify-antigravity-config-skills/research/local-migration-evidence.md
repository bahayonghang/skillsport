# Local Migration Evidence (Sanitized)

## Pre-Migration Backup & Inventory

- DB pre-migration copy: `~/.skillsmanage/db.sqlite.backup-pre-antigravity-unify-20261120-044946`
- `~/.gemini/antigravity/skills/` (16 entries):
  - `answer-me-with-html` (ReparsePoint -> `../../../.skillsmanage/skills/answer-me-with-html`)
  - `check` (ReparsePoint -> `../../../.skillsmanage/skills/check`)
  - `design-atlas` (ReparsePoint -> `../../../.skillsmanage/skills/design-atlas`)
  - `gh-pr-release` (ReparsePoint -> `../../../.skillsmanage/skills/gh-pr-release`)
  - `git-commit` (ReparsePoint -> `../../../.skillsmanage/skills/git-commit`)
  - `goal-meta-skill` (ReparsePoint -> `../../../.skillsmanage/skills/goal-meta-skill`)
  - `health` (ReparsePoint -> `../../../.skillsmanage/skills/health`)
  - `huashu-design` (ReparsePoint -> `../../../.skillsmanage/skills/huashu-design`)
  - `hunt` (ReparsePoint -> `../../../.skillsmanage/skills/hunt`)
  - `laoyeye` (ReparsePoint -> `../../../.skillsmanage/skills/laoyeye`)
  - `learn` (ReparsePoint -> `../../../.skillsmanage/skills/learn`)
  - `qiaomu-meta` (ReparsePoint -> `../../../.skillsmanage/skills/qiaomu-meta`)
  - `read` (ReparsePoint -> `../../../.skillsmanage/skills/read`)
  - `think` (ReparsePoint -> `../../../.skillsmanage/skills/think`)
  - `ui` (ReparsePoint -> `../../../.skillsmanage/skills/ui`)
  - `write` (ReparsePoint -> `../../../.skillsmanage/skills/write`)
- `~/.gemini/antigravity-cli/skills/` (18 entries):
  - `answer-me-with-html` (ReparsePoint -> `../../../.skillsmanage/skills/answer-me-with-html`)
  - `check` (ReparsePoint -> `../../../.skillsmanage/skills/check`)
  - `design-atlas` (ReparsePoint -> `../../../.skillsmanage/skills/design-atlas`)
  - `ego-browser` (ReparsePoint -> `~/.local/share/ego/ego-skills`)
  - `gh-pr-release` (ReparsePoint -> `../../../.skillsmanage/skills/gh-pr-release`)
  - `git-commit` (ReparsePoint -> `../../../.skillsmanage/skills/git-commit`)
  - `goal-meta-skill` (ReparsePoint -> `../../../.skillsmanage/skills/goal-meta-skill`)
  - `health` (ReparsePoint -> `../../../.skillsmanage/skills/health`)
  - `huashu-design` (ReparsePoint -> `../../../.skillsmanage/skills/huashu-design`)
  - `hunt` (ReparsePoint -> `../../../.skillsmanage/skills/hunt`)
  - `laoyeye` (ReparsePoint -> `../../../.skillsmanage/skills/laoyeye`)
  - `learn` (ReparsePoint -> `../../../.skillsmanage/skills/learn`)
  - `qiaomu-meta` (ReparsePoint -> `../../../.skillsmanage/skills/qiaomu-meta`)
  - `read` (ReparsePoint -> `../../../.skillsmanage/skills/read`)
  - `tabbit` (ReparsePoint -> `%LOCALAPPDATA%/Tabbit/LocalAgent/skills/tabbit`)
  - `think` (ReparsePoint -> `../../../.skillsmanage/skills/think`)
  - `ui` (ReparsePoint -> `../../../.skillsmanage/skills/ui`)
  - `write` (ReparsePoint -> `../../../.skillsmanage/skills/write`)
- `~/.gemini/config/skills/` (4 entries):
  - `chinese-novelist` (Dir)
  - `client-maintenance` (Dir)
  - `ego-browser` (ReparsePoint -> `~/.local/share/ego/ego-skills`)
  - `tabbit` (ReparsePoint -> `%LOCALAPPDATA%/Tabbit/LocalAgent/skills/tabbit`)

## Post-Migration Verification (Read-Back)

- `~/.gemini/antigravity/skills/`: 0 entries (parent dir intact)
- `~/.gemini/antigravity-cli/skills/`: 0 entries (parent dir intact)
- `~/.gemini/config/skills.json` exists: `False`
- `~/.gemini/skills/` (`gemini-cli` legacy): ['tabbit']
- `~/.gemini/config/skills/` (20 entries):
  - `answer-me-with-html` (`ReparsePoint` -> `../../../.skillsmanage/skills/answer-me-with-html`)
  - `check` (`ReparsePoint` -> `../../../.skillsmanage/skills/check`)
  - `chinese-novelist` (`Dir`)
  - `client-maintenance` (`Dir`)
  - `design-atlas` (`ReparsePoint` -> `../../../.skillsmanage/skills/design-atlas`)
  - `ego-browser` (`ReparsePoint` -> `~/.local/share/ego/ego-skills`)
  - `gh-pr-release` (`ReparsePoint` -> `../../../.skillsmanage/skills/gh-pr-release`)
  - `git-commit` (`ReparsePoint` -> `../../../.skillsmanage/skills/git-commit`)
  - `goal-meta-skill` (`ReparsePoint` -> `../../../.skillsmanage/skills/goal-meta-skill`)
  - `health` (`ReparsePoint` -> `../../../.skillsmanage/skills/health`)
  - `huashu-design` (`ReparsePoint` -> `../../../.skillsmanage/skills/huashu-design`)
  - `hunt` (`ReparsePoint` -> `../../../.skillsmanage/skills/hunt`)
  - `laoyeye` (`ReparsePoint` -> `../../../.skillsmanage/skills/laoyeye`)
  - `learn` (`ReparsePoint` -> `../../../.skillsmanage/skills/learn`)
  - `qiaomu-meta` (`ReparsePoint` -> `../../../.skillsmanage/skills/qiaomu-meta`)
  - `read` (`ReparsePoint` -> `../../../.skillsmanage/skills/read`)
  - `tabbit` (`ReparsePoint` -> `%LOCALAPPDATA%/Tabbit/LocalAgent/skills/tabbit`)
  - `think` (`ReparsePoint` -> `../../../.skillsmanage/skills/think`)
  - `ui` (`ReparsePoint` -> `../../../.skillsmanage/skills/ui`)
  - `write` (`ReparsePoint` -> `../../../.skillsmanage/skills/write`)

## Post-Migration Local SQLite Read-Only Check

- `schema_migrations`: `[1, 2, 3, 4, 5, 6, 7, 8, 9]`
- `agents` (`antigravity*`): `[('antigravity', 'Antigravity', 1, '~/.gemini/config/skills')]`
- `skill_installations` (`antigravity*`): `[('antigravity', 'symlink', 16)]`
- `agent_skill_observations` (`antigravity-cli`): `0`
- `skill_update_inventory_entries` (`antigravity-cli`): `0`
- `project_skill_installations` (`antigravity*`): `[('1dfd4189039cdf38', 'goal-meta-skill', 'antigravity', 'central', 'symlink')]`
- `scan_directories` (`%gemini%`): `[('Gemini CLI (legacy)', '~/.gemini/skills'), ('Antigravity', '~/.gemini/config/skills')]`
