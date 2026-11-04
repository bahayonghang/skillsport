# Implementation plan

Do not start until the planning summary in the session is explicitly approved. Then `python ./.trellis/scripts/task.py start 11-04-select-glass-system-fonts`.

Read before editing:

- `.trellis/spec/frontend/glass-surfaces.md`
- `.trellis/spec/frontend/font-preferences.md`
- `.trellis/spec/frontend/ipc-adapter.md`
- `.trellis/spec/frontend/typography-tokens.md`
- `DESIGN.md` Components → input, and 「其余 primitives」
- `research/native-select-inventory.md`

## Checklist

1. Extract `GLASS_OVERLAY_POPUP_CLASS` and `GLASS_OVERLAY_ITEM_CLASS` from `src/components/ui/menu.tsx` into `src/components/ui/overlay-popup.ts`. Point Menu at them. Popup appearance stays the same.
2. Add `src/components/ui/select.tsx` per `design.md`. Add a gallery case on `/__primitives` next to the menu overlay.
3. Add the Rust command, Windows GDI filter, non-Windows empty success, registry entry, specta type. Run `pnpm ipc:codegen` and `pnpm docs:gen`.
4. Add `src/lib/systemFonts.ts` cache and the browser fixture. Register the fixture on the existing settings (or fonts) install path.
5. Add `FontFamilyPicker` and switch the four fields in `AppearanceSettingsSection.tsx`. Remove the conditional custom `Input`s. Keep specimen markup.
6. Replace the other 13 `<select>` sites in the inventory. Preserve test ids, disabled options, empty values, and local className overrides.
7. Add i18n keys in `en.json` and `zh.json`.
8. Update `glass-surfaces.md` and `font-preferences.md`, then extend `glassSurfaceContract.test.ts` so production files outside `src/components/ui/` cannot import `@base-ui/react/select` or `@base-ui/react/combobox`, and so `<select` is absent from production TSX.
9. Update tests that drive native selects (`toHaveValue`, `fireEvent.change`, class assertions on the old element).

## Validation

While iterating:

```text
pnpm exec vitest run src/test/lib/displayFont.test.ts src/test/pages/SettingsView.test.tsx src/test/components/ui/GlassPrimitives.test.tsx src/test/contracts/glassSurfaceContract.test.ts src/test/contracts/fontContract.test.ts
```

Also run the view tests that cover each replaced select once those files change. Rust filter tests:

```text
cargo test -p skillport -- fonts
```

Use the package name from `src-tauri/Cargo.toml` if it differs. Run the test from `src-tauri`.

Before calling the task done: `just ci`. `pnpm docs:gen` output is part of the diff. `docs:gen:check` stays read-only.

## Risky files

- `src/lib/displayFont.ts`: do not change setting keys, migration, or the stack sanitizer. Call the sanitizer; do not reimplement it in the picker.
- `src-tauri/src/ipc_registry.rs`: one new `runtime_only(ReadOnly)` line. Do not reclassify neighboring commands.
- `src-tauri/Cargo.toml`: only add the GDI feature flags required to compile the enumerator.
- Generated IPC and docs files: regenerate, do not hand-edit.

## Rollback point

The select primitive and the call-site swap can land before the font command. If enumeration misbehaves, ship the styled selects and the pinned presets, and leave the installed group empty with the typed-family action still working. Do not ship a half-migrated `<select>` on one page and the glass popup on another.

## Follow-up before `task.py start`

- Curated `implement.jsonl` and `check.jsonl` entries already point at the spec and this research note. Confirm they are real rows, not the seed `_example` line.
- No product decision is still open. Approval of the session planning summary is the start gate.
