# C4 Implement

1. Marker experiment and Rust test (a write from a second connection changes the marker); record the choice in
   design.md.
2. Add the `get_data_change_marker` command, register it in `ipc_registry`, add the store IPC adapter, and run
   `pnpm docs:gen` (rollback point 1).
3. Add `externalChangeWatcher` with Vitest coverage: unchanged marker, changed marker, and debounce.
4. Add the Agent explanation overwrite confirmation with i18n strings and Vitest coverage (rollback point 2).
5. Manual check: with the desktop app open, change data with `skillport-cli`, switch back to the window, and confirm
   the view refreshes.

Validation:

```bash
pnpm test
pnpm docs:gen:check
just ci
```
