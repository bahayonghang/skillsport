# Execution

- [x] Trace existing data flow and write source-backed findings.
- [x] Add reproducible synthetic latency baseline for serial reads; compare identical fixture against batch transport. Report calls, transferred bytes and elapsed wall time, explicitly simulated.
- [x] Implement bounded batched snapshot reads and SHA/preview binding regression coverage.
- [x] Remove duplicate skills.sh remote acquisition using the existing preview lifecycle and test selection/conflict/cleanup semantics.
- [x] Run focused Rust tests and independent Trellis check review.
- [x] Run just ci; fix task-introduced failures; record unrelated blockers honestly.
- [x] Update applicable backend specs and task research with measured results and remaining relay limitation.

Rollback: revert only this task changes; no migration or persistent format change. Do not commit/push unless requested. Real SSH latency, native UI and installed bundle remain unverified unless a controlled environment is available.
