# SSH Skill Import Performance

## Goal
Explain the actual SSH import data flow, reproduce avoidable latency and functional defects, and optimize the existing workflow without weakening snapshot integrity or target isolation.

## Scope
- GitHub preview/confirmation and marketplace skills.sh import while an SSH target is selected.
- Identify local versus remote downloads, SSH round trips, redundant transfers and source consistency.
- Preserve Local/WSL compatibility, duplicate handling, Central locks, provenance, resource budgets, and credential redaction.
- Add focused regression tests and a reproducible before/after benchmark; run just ci.

## Acceptance
- A source-backed report distinguishes confirmed issues from unmeasured real-network causes.
- Remote selected-content acquisition replaces per-file round trips with bounded batches while retaining the existing digest identity and tamper detection.
- Marketplace remote import does not download the repository twice or change commits between candidate resolution and import.
- Tests cover binary/unicode/empty files, invalid inventory, limits, snapshot mismatch, and target binding as applicable.
- No production credentials or remote user data are modified for benchmarking. Real SSH/native validation limitations are explicit.

## Exclusions
No SSH connection-pool redesign, release/push, installer changes, or unrelated refactors.

## Authorization
The user explicitly requested task creation, analysis and optimization in this message. Implement only after evidence and planning artifacts are reviewed; do not request duplicate authorization for the already requested optimization.


## User clarification
The user confirmed the slow phase is GitHub URL import AFTER clicking confirmation. Prioritize selected-file acquisition and verification; preview candidate discovery remains a documented separate bottleneck.
