# C2 Implement

Prerequisite: C1 is merged into `dev`; branch from the latest `dev`.

1. Confirmation contract helper and tests (rollback point 1).
2. `tags create/add/remove` (including `--review`), extend the `source` parameter, and add the AI re-tagging
   retention test (rollback point 2).
3. `notes get/set` plus the repository upsert (rollback point 3).
4. `projects add/install/uninstall` and their dry-run tests (rollback point 4).
5. `skills unlink` and its dry-run test.
6. `skills import --from-zip`, covering success, duplicate, replace, fingerprint mismatch, and path traversal.
7. Directory import audit → `skills import --from-dir`, covering success, missing SKILL.md, a directory inside
   Central, and symlinks.
8. Lock tests: hold the Central lock in the test and confirm each write command returns exit code 4.
9. Run a manual smoke pass under a temporary HOME; update the `shared-local-cli.md` and `central-skill-tags.md`
   specs.

Validation: same as C1, plus `just ci`.
