# Renderer Authority Boundary

## 1. Scope / Trigger

Apply this contract when a frontend feature adds a Tauri plugin import, changes
`src-tauri/capabilities/default.json`, handles a user-selected local file, installs
a Marketplace preview, or reads/writes a saved credential.

## 2. Signatures

```rust
#[tauri::command]
pub async fn preview_portable_bundle_import(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    path: String,
) -> Result<PortableBundleImportPreview, IpcError>;

#[tauri::command]
pub async fn export_portable_bundle(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
    path: String,
) -> Result<PortableBundleExportResult, IpcError>;
```

```ts
installGitHubPreviewSkill(repoUrl: string, sourcePath: string): Promise<GitHubRepoImportResult>;

interface SecretValueInputProps {
  value: string;
  configured: boolean;
  onChange(value: string): void;
}
```

## 3. Contracts

- The main WebView has no filesystem permission or `@tauri-apps/plugin-fs`
  dependency. File dialogs return paths only; backend services own all reads and
  writes.
- Portable-bundle reads require a regular `.skillport` / `.zip` file and run the
  shared archive inventory checks within `ResourceBudget::portable_bundle()`
  before parsing the manifest. Exports write a same-directory temporary file and
  atomically persist it. Apply re-fingerprints the file, so a file changed after
  preview is rejected (`portable_bundle.preview_stale`).
- Direct GitHub preview installation submits only `repoUrl` and `sourcePath` to
  a store action. That action performs a fresh backend preview and imports the
  matching candidate through the existing GitHub staging, target snapshot,
  Central mutation lock, and database persistence path. The renderer never
  downloads or writes the skill.
- Saved PATs and AI API keys are write-only from the renderer. Production code
  has no `reveal_github_pat` or `reveal_ai_api_key` command, store action, or UI
  control. Configured/fingerprint status, overwrite, clear, and connection tests
  remain supported.
- `docs/reference/ipc-capability-inventory.md` contains the exact marker JSON
  contract. `pnpm capabilitycheck` compares it with capability permissions,
  frontend imports/dependencies, Rust dependencies/initializers, and the
  deterministically rendered human table. It is a required `just ci` step.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Selected import is not `.skillport` / `.zip` or not a regular file | Backend returns `portable_bundle.invalid_path`; renderer performs no read |
| Declared or streamed bytes exceed the shared budget | Reject before parsing; do not allocate past cap plus one |
| File grows after metadata snapshot | Reject as changed or over-budget; do not preview partial content |
| Bundle write fails or is cancelled | Preserve the existing destination and clean the temporary file |
| GitHub candidate disappeared before install | Discard the fresh preview workspace and perform no import |
| Saved secret is configured | Render a fixed mask with an empty password input; never return plaintext |
| Capability/import/dependency/inventory set drifts | `pnpm capabilitycheck` and therefore `just ci` fail |

## 5. Good / Base / Bad Cases

- Good: renderer selects `backup.skillport` and passes only the path; the backend
  reads it within the bundle budget and returns a preview token plus per-skill
  classification.
- Base: an HTTP(S) external link still uses `shell:allow-open` after
  `externalUrl.ts` rejects every other scheme.
- Bad: a component imports `plugin-fs`, a page fetches `downloadUrl` and writes
  Central directly, or an IPC command returns stored secret plaintext.

## 6. Tests Required

- Rust portable-bundle tests (`portable_bundle/tests.rs`, `import_tests.rs`):
  extension, unsafe entries, budget, manifest errors, legacy v1 detection,
  atomic persist and temporary cleanup, stale/expired previews.
- Frontend tests: path-only portability IPC, direct GitHub and registry install
  routing, disappeared candidate cleanup, fixed-mask secret UI, and absence of
  reveal commands in production entrypoints.
- Drift tests: valid repository plus missing permission, stale JSON, stale
  rendered table, unexpected import, and stale dependency/initializer fixtures.
- Full gate: `just ci`; on Windows capability/plugin changes also run
  `pnpm tauri build` and verify a newly generated NSIS installer.

## 7. Wrong vs Correct

```ts
// Wrong: renderer chooses network authority and writes Central directly.
const content = await fetch(skill.downloadUrl).then((response) => response.text());
await writeTextFile(`.skillsmanage/skills/${skill.name}/SKILL.md`, content);

// Correct: renderer submits structured identity to the existing backend flow.
await installGitHubPreviewSkill(skill.repoUrl, skill.sourcePath);
```
