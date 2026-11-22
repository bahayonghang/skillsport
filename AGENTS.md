<!-- TRELLIS:START -->
# mini-trellis

This project uses mini-trellis as a memory layer. Working knowledge lives under `.trellis/`:

- `.trellis/spec/` — durable contracts (short markdown; read `index.md` first)
- `.trellis/research/` — topic inbox (`<topic>.md`; `README.md` is not a topic)
- `.trellis/workspace/` — per-developer journals

Record a session with `/mini-trellis:remember` (Claude/OpenCode), `/mini-trellis-remember` (Pi/OMP/Kiro/Antigravity/Droid), `$mini-trellis-remember` (Codex/ZCode), or the `mini-trellis-remember` skill (Cursor and DeepSeek Harness). When earlier decisions or relevant project rules are needed, use `mini-trellis mem recall "<topic or path>"`; expand evidence with `mini-trellis mem read "<ref>"`. No search is required for unrelated work. Promote lasting boundaries into spec with `mini-trellis-update-spec`.

When the user confirms or corrects a project rule, save it through remember even without an explicit “remember” request, unless they ask not to save. An agreed future policy is recorded as agreed, not implemented. Also record reusable findings or a useful session/compact handoff. Questions, reviews, ordinary edits and unconfirmed proposals need no new record. New installs write notes without an automatic git commit; use `mini-trellis doctor` to check host wiring and `mini-trellis refresh --dry-run` before refreshing assets.

Keep one current rule in the document that already owns it. Preserve conditions with their rules: “when X, do not Y” must not become “never Y.” Unconfirmed scope, exceptions, and implementation choices stay open or are labeled as inference, not added to the contract.

For a confirmed update, use remember to edit the existing topic, verify the saved section once, record the journal link, and check the new entry/index row. Complete these authorized steps in the same turn without asking again between writes. Reuse returned file contents while unchanged instead of repeating reads. Journal-only success is not topic success; report partial writes accurately. New notes follow the requested or discussion language; updates preserve the document language.

For a memory-only update, reply with one short sentence using actual topic and journal Markdown links; expand for conflicts or partial writes. In a development task, include the links briefly with the requested result. Update affected README/docs/spec/research descriptions, including stale implementation status, in the same turn as the code. This maintenance needs no separate remember request or new journal entry.

When recall excerpts already answer the question with source and qualifiers, cite them and stop. Expand only missing context; do not repeat a lookup or fall back to dialogue-only `search` merely to reconfirm sufficient evidence.

Use project knowledge or supply Markdown/text exports when working with earlier ZCode, Kiro, OMP, or Antigravity conversations. To organize selected past sessions or supplied exports into project knowledge, use `mini-trellis-session-insight`, update existing documents, and preserve sources.

mini-trellis does not create or drive tasks.

Managed by mini-trellis. Edits outside this block are preserved.
<!-- TRELLIS:END -->

# AGENTS.md

SkillPort is a React + TypeScript + Tauri desktop application fork whose primary local delivery
target is a stable Windows installer. Use `pnpm` and `just` from the repository root.

The local toolchain pins Node 26 and Rust 1.98.0. Prefer the latest stable pnpm; the repository
does not pin a pnpm version. The standard local entry points are `just doctor`, `just check`, `just ci`, and `just audit`.

## Start Here

- Use [`code_map.md`](code_map.md) for repository navigation and search anchors.
- Read the relevant `.trellis/spec/<layer>/index.md` before editing backend, frontend, or quality
  code; follow the project Trellis workflow for multi-step work.
- Read [`docs/agents/build-and-test.md`](docs/agents/build-and-test.md) for commands and gates.
- Read [`docs/agents/git-and-release.md`](docs/agents/git-and-release.md) for branch, PR, and
  release operations.
- Read [`docs/agents/harness-guide.md`](docs/agents/harness-guide.md) for five-tool rule discovery,
  evidence layers, and task handoff.
- Read [`docs/agents/security-and-shared-state.md`](docs/agents/security-and-shared-state.md)
  before changing Central, persistence, credentials, or updater behavior.

## Durable Project Rules

- Treat the Windows x64 Tauri bundle as a first-class acceptance surface. A frontend-only build
  does not establish a packaging or release result.
- Route all user-visible text through `src/i18n/` and keep `README.md` / `README_CN.md` aligned
  when public wording changes.
- Keep component state in the domain Zustand stores; components do not call Tauri `invoke()`
  directly. Reuse `UnifiedSkillCard` for skill-card scenarios.
- Put shared Central behavior in the Rust service/repository boundary. Preserve persisted `uid`
  semantics, use the existing Central mutation lock and `ensure_centralized` path, and retain
  target-only skills during Central migration.
- Keep credentials behind `SecretStore`; do not place PATs, API keys, passwords, or private keys
  in SQLite, logs, errors, telemetry, or portable exports.
- Treat generated architecture documents as build outputs: after changing Tauri commands or
  `src-tauri/src/db/schema/`, run `pnpm docs:gen` and include the generated files; keep
  `docs:gen:check` and `docs:build` read-only.
- For Windows updater delivery, preserve the Authenticode -> updater signature -> metadata order
  and keep NSIS, `.sig`, `latest.json`, MSI, and ZIP artifacts consistent. See the release guide.

## Completion Gate

Run the smallest relevant checks while iterating and run `just ci` before declaring repository
work complete. Report skipped checks and unverified external, provider, hardware, or production
evidence explicitly.

Only `main` requires a pull request. `dev` accepts direct pushes once `just ci` passes locally;
a task PR into `dev` is optional and uses squash merge. Promotion to `main` uses a merge commit,
after which `dev` is fast-forwarded to the promotion merge SHA; see the Git and release guide for
the full remote-write and read-back rules.
