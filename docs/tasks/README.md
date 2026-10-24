# Task board

One file per phase. Each task has an ID (`T<phase>.<n>`), a status and an evidence column.
The master plan explains *why*; these files track *what is done*.

| Phase | Title | Tasks | Depends on | Status |
|---|---|---|---|---|
| 0 | [Stabilize the baseline](phase-0-baseline.md) | 8 | — | Not started |
| 1 | [Khmer foundation, zero GPU](phase-1-khmer-foundation.md) | 8 | Phase 0 | Not started |
| 2 | [Bring the dub engine into the repo](phase-2-dub-engine-service.md) | 15 | Phase 0 · ADR-0005 (license) | Not started |
| 3 | [Daemon ↔ engine integration](phase-3-daemon-integration.md) | 14 | Phase 2 | Not started |
| 4 | [Quality upgrades into existing stages](phase-4-quality-pipeline.md) | 7 | Phase 3 | Not started |
| 5 | [VoxCPM2 voice power](phase-5-voxcpm-voices.md) | 9 | Phase 3 | Not started |
| 6 | [Extra creator studios](phase-6-creator-studios.md) | 5 | Phase 3 | Not started |
| 7 | [Release](phase-7-release.md) | 7 | Phases 1–6 | Not started |

## How to work a task

1. Set the task to `doing` and create a branch `phase-<n>/<short-name>`.
2. Make the smallest change that meets the task; validate at the task's risk tier (`AGENTS.md`).
3. Paste the exact command and its result into **Evidence**, then set `done`.
4. When every task is `done`, run the exit gate and record its evidence; then mark the phase done here.

Blocked tasks: set `blocked` and write the reason (and the decision or ADR it waits on) in **Evidence**.
