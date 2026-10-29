# C4 Design

The overall design is in the parent task's `design.md` §5 (overwrite confirmation) and §8 (refresh options).

Decisions specific to this child:

- Choosing the marker: first test whether `PRAGMA data_version` changes reliably on the app's connection pool. It
  is per connection, so with a pool it must be read on the same long-lived connection. If that is not reliable, use
  `SELECT max(id) FROM operation_logs`; CLI writes always produce an operation log. Record the result and the
  reason here.
- Frontend: add an `externalChangeWatcher` (in the store or app shell layer) that receives focus events, debounces
  them for 300 ms, compares the marker, and on change calls each domain store's existing refresh method. Read
  `.trellis/spec/frontend/ipc-adapter.md` and `renderer-authority-boundary.md` first.
- Overwrite confirmation: put the confirmation dialog at the existing entry point that triggers
  `refresh_skill_explanation`. The decision is based on the `model` field already returned by the explanation query;
  if it is not returned, extend the return value (and run `pnpm docs:gen`).
