# C4 Design

The overall design is in the parent task's `design.md` §5 (overwrite confirmation) and §8 (refresh options).

Decisions specific to this child:

- Marker choice (2026-10-29), closed before implementation: `SELECT COALESCE(MAX(rowid), 0) FROM operation_logs`.

  `create_pool` uses WAL and `max_connections(5)`. A five-connection WAL probe showed `PRAGMA data_version` is
  not comparable across that pool:

  - One committed state produced different values at the same time (writer stayed at 2, readers moved from 3 to 4).
  - The connection that executed the `INSERT` did not change its own `data_version`. SQLite bumps the pragma when
    a connection observes another connection's commit, not when it writes itself.
  - A connection opened afterwards reported 2 while an existing reader reported 4. Pool checkouts would both miss
    writes and report a change when the database had not changed again.
  - A process-long non-writing connection could compare its own successive reads, but `get_data_change_marker`
    uses the shared pool and does not keep that connection.

  `SELECT max(id) FROM operation_logs` is not a substitute. `operation_logs.id` is `TEXT PRIMARY KEY`, and
  `insert_operation_log_row` stores `Uuid::new_v4()`. Lexicographic `max(id)` can stay the same when a new row
  is inserted. `created_at` is UTC RFC3339 and does sort, but two rows with the same timestamp do not move
  `max(created_at)`.

  Candidate that still matches the refresh goal (skill writes insert an operation log; reads do not): 
  `SELECT COALESCE(MAX(rowid), 0) FROM operation_logs`. The table is not `WITHOUT ROWID`, so `rowid` increases
  on each insert and an empty table is 0. Deleting a row that is not the highest `rowid` does not change it.
  That is acceptable for this watcher, because the signal is a new log row, not log retention.
- Frontend: add an `externalChangeWatcher` (in the store or app shell layer) that receives focus events, debounces
  them for 300 ms, compares the marker, and on change calls each domain store's existing refresh method. Read
  `.trellis/spec/frontend/ipc-adapter.md` and `renderer-authority-boundary.md` first.
- Overwrite confirmation: put the confirmation dialog at the existing entry point that triggers
  `refresh_skill_explanation`. The decision is based on the `model` field already returned by the explanation query;
  if it is not returned, extend the return value (and run `pnpm docs:gen`).
