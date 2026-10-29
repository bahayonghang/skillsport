# C3 Implement

Prerequisite: C1 and C2 are merged into `dev`. The design is in the parent task's `design.md` §7 and §9; this
child is mostly documentation, so it has no separate design.md.

1. Record the actual `skillport-cli --help` output for every subcommand into `research/cli-help.md` as the
   reference for writing the skill.
2. Write `skills/skillport/SKILL.md` following the parent task's design.md §7 outline; put long examples in
   `references/`.
3. Update the English and Chinese CLI docs (`docs/reference/skillport-cli.md`, `docs/zh/reference/skillport-cli.md`),
   and update the README if needed.
4. Bootstrap: `skills import --from-dir skills/skillport` → `skills sync <uid> --agent claude-code --dry-run` → run it.
5. End-to-end run: open a new Claude Code session in a sample project, complete the four-step flow, and record the
   evidence in `research/e2e-evidence.md`.
6. Run `pnpm docs:build` and `just ci`.
