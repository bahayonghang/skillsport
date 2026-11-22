You are in the SkillPort repository (`D:\Documents\Code\Agents\skills-manage-windows`). Following the project Trellis workflow, carry out every child task under the parent task `.trellis/tasks/10-29-agent-operable-skillport/` to completion. Planning is done and all open questions are settled; do not reopen requirements or decisions.

## Read first

1. `AGENTS.md`, `docs/agents/build-and-test.md`, `docs/agents/git-and-release.md`, `.trellis/workflow.md`
2. The parent task: `prd.md` (requirements and acceptance), `design.md` (design; §12 is the child-task split), `implement.md` (order and integration acceptance), `research/current-surface.md`
3. Before each child task starts: that child's `prd.md`, `design.md` (C3 has none), `implement.md`, plus the spec files listed in its `implement.jsonl` / `check.jsonl`

## Settled decisions (do not change)

- Approach: extend the existing `skillport-cli` (`src-tauri/src/bin/skillport-cli.rs` + `src-tauri/src/cli_api/`) and add a `skillport` guide skill. No MCP, no HTTP API inside the desktop app, no direct SQLite writes.
- Q1 notes: write to the existing `skill_explanations` table with `model = "agent:<author|cli>"`; no new schema.
- Q2 distribution: the MVP keeps `npm run install:cli`; the installer is unchanged (C5 and C6 are not in the MVP).
- Q3 tags: they apply directly by default with `source = "agent"`, recording reason / confidence; `--review` sends them to the AI tag review queue.

## Child tasks and order

| Order | Child task | Prerequisite |
| --- | --- | --- |
| 1 | `.trellis/tasks/10-29-cli-read-surface` (C1) | none |
| 1 (can run alongside C1) | `.trellis/tasks/10-29-desktop-external-change-refresh` (C4) | none |
| 2 | `.trellis/tasks/10-29-cli-mutations` (C2) | C1 merged into `dev` |
| 3 | `.trellis/tasks/10-29-skillport-guide-skill` (C3) | C1 and C2 merged into `dev` |

Running serially is fine: C1 → C4 → C2 → C3.

## Per-child flow

1. Create a task branch from the latest `dev` (name it per `docs/agents/git-and-release.md`).
2. `python ./.trellis/scripts/task.py start <child-dir>` (status becomes in_progress). Do not start the parent task.
3. Run `trellis-before-dev` to load the specs. Dispatch implementation to the `trellis-implement` sub-agent; the first line of the dispatch prompt must be `Active task: <child-dir>`. Then use `trellis-check` for the quality check. Follow the child `implement.md` step by step, with one commit per rollback point.
4. The "decide before implementing" items in C2's `design.md` (does directory import reuse the centralize path) and C4's `design.md` (marker choice) must be written back into that child's `design.md` before any code is written.
5. Before declaring done: tick every Acceptance Criteria item in the child `prd.md`, run `just ci`, and if Tauri commands or `src-tauri/src/db/schema/` changed, run `pnpm docs:gen` and commit the generated files.
6. Spec update (Trellis 3.3): update the specs the child `prd.md` names, such as `shared-local-cli.md` and `central-skill-tags.md`.
7. Commit (Conventional Commits, matching the repo's existing commit style), open a PR to `dev` (squash merge), wait for CI to go green, and archive the child task once it is merged.

## Constraints

- `cli_api` may only call `services::*` / `db::*`, never `commands::*`. The existing 5 commands must keep their JSON fields and exit codes; `schemaVersion` stays 1.
- Central and install writes take the shared Central mutation lock and write redacted operation logs. Credentials never appear in output, errors, or logs.
- User-visible desktop text goes through `src/i18n/` (Chinese and English); components do not call `invoke()` directly.
- The working tree may still contain uncommitted changes that do not belong to this task (`CHANGELOG*`, `package.json`, `Cargo.*`, `tauri.conf.json`, `src/i18n/index.ts`, `src/main.tsx`, `vite.config.ts`, `.trellis/tasks/10-29-vite-chunk-size-warning/`). Do not stage, modify, or discard them. If they block a branch switch, stop and ask me.
- The planning files for this task (the parent task directory and the four child directories) are not committed yet. Commit them in the first commit of C1's PR.

## When to stop and ask me

- Before each push / PR creation / merge, unless I have already approved that specific step in this conversation.
- When an acceptance item cannot be met, the existing code contradicts the design, or a requirement or decision needs to change.
- C3's end-to-end run needs a real Claude Code session: if you cannot open one yourself, prepare the sample project, the commands, and the steps to verify, hand them to me to run, and record the evidence I send back in `research/e2e-evidence.md`.

## Wrap-up

After all four children are merged, run the "Integration acceptance (parent task)" section of the parent `implement.md` item by item, then archive the parent task. In the final report, list for each child the PR link, `just ci` result, skipped checks, and unverified items (for example, live skill loading in Codex, Grok, and other agent tools).
