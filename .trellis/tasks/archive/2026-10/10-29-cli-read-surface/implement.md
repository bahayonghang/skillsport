# C1 Implement

1. Split `cli_api` into modules without changing behavior; `cargo test --bin skillport-cli` passes (rollback point 1).
2. Add entity-level errors and update the error envelope tests (rollback point 2).
3. Add `agents list`, `tags list`, and `projects list` together with their Clap and `cli_api` tests.
4. Add `projects skills <project>` and the project reference resolution (not found, ambiguous, `.`).
5. Add the `skills list` filters and the new `skills show` fields; add regression tests for the existing output.
6. Run an empty-DB smoke test under a temporary HOME (`npm run cli -- --json ...`).
7. Update the `.trellis/spec/backend/shared-local-cli.md` command table and error matrix.

Validation:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --bin skillport-cli
cargo test --manifest-path src-tauri/Cargo.toml --lib cli_api
pnpm entrypointcheck
just ci
```
