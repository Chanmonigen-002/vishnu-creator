# Task board

One file per phase. Each task has an ID (`T<phase>.<n>`), a status and an evidence column.
The master plan explains *why*; these files track *what is done*.

| Phase | Title | Tasks | Done | Doing | Blocked | Todo | Depends on | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| 0 | [Stabilize the baseline](phase-0-baseline.md) | 9 | 9 | 0 | 0 | 0 | — | met (`v0-baseline`) | Complete |
| 1 | [Khmer foundation, zero GPU](phase-1-khmer-foundation.md) | 9 | 7 | 2 | 0 | 0 | Phase 0 | **not met** | In progress |
| 2 | [Bring the dub engine into the repo](phase-2-dub-engine-service.md) | 15 | 15 | 0 | 0 | 0 | Phase 0 · ADR-0005 (accepted) | **not met** | Tasks done · gate not met |
| 3 | [Daemon ↔ engine integration](phase-3-daemon-integration.md) | 14 | 9 | 5 | 0 | 0 | Phase 2 | **not met** | In progress |
| 4 | [Quality upgrades into existing stages](phase-4-quality-pipeline.md) | 7 | 3 | 2 | 0 | 2 | Phase 3 | **not met** | In progress |
| 5 | [VoxCPM2 voice power](phase-5-voxcpm-voices.md) | 10 | 2 | 6 | 2 | 0 | Phase 3 | **not met** | In progress |
| 6 | [Extra creator studios](phase-6-creator-studios.md) | 5 | 0 | 0 | 0 | 5 | Phase 3 | — | Not started |
| 7 | [Release](phase-7-release.md) | 7 | 0 | 0 | 0 | 7 | Phases 1–6 | — | Not started |
| 8 | [More AI providers (free, paid, cloud, local)](phase-8-ai-providers.md) | 10 | 0 | 1 | 0 | 9 | Phase 3 | — | In progress |

## Audit 2026-10-27

Every task marked `done` in Phases 0–5 was checked against the code, its tests and the running app at `http://127.0.0.1:19861`. Of 59 tasks previously marked done, **17 were reopened** (15 `doing`, 2 `blocked`). Phase 4 was also listed as done while T4.4 and T4.5 had never been started. **2 new tasks** were added (T0.9, T5.10). Every row now carries an **Audit 2026-10-27** note that keeps the original evidence. Five phase gates that had been ticked were unticked.

### Fix first (blocks everything engine-related)

1. ~~**T5.10: the dub engine does not start.**~~ **Fixed on `phase-5/fix-engine-import`:** the engine imports and starts, and pytest passes 58/58. The fix also repaired an artifact download that returned `null` and a `TypeError` that broke every Edge-TTS dub job since `860f1ea`.
2. ~~**T1.9: subtitle burn-in fails on Windows.**~~ **Fixed on `phase-1/windows-ass-burn-in`:** the bug was in the test's own ffmpeg calls, not the product; the real CLI burn-in now passes 8/8 on Windows, and Khmer renders correctly.
3. ~~**T0.9: stale preset catalog.**~~ **Fixed:** Recompiled with `pnpm templates:compile`. Verified `cover.jpg` SHA256 matches restored asset `73b47748...` in `.runtime/generated/creator-presets/assets/`, damaged `57adddb5...` gone, `creator-preset-compiler.test.ts` passes 9/9.

### Rule violations found (AGENTS.md "no fake")

- **T4.7:** the Quality Report's "CER" is a formula (`2.4 + overlongRatio*5 + …`), not a measured error rate.
- **T1.8:** the Phase 1 gate's Playwright test passes without running any dubbing; it only checks a pre-existing MP4.
- **T5.9:** the watermark cannot work (18/19 kHz tones in 24 kHz audio), and it uses a hard-coded fallback secret.
- **Phase 5 gate:** ticked on "typecheck/build pass" only. No VoxCPM2 model has been downloaded or run on this PC, and Phase 5 has no tests.

### What was verified as real

- Engine tests: **45/45** at Phase 2 commit `726ec6b` and **58/58** at Phase 4 commit `eaf112e` (with the real venv and bundled ffmpeg).
- Daemon dub-engine tests: 19/19. Khmer rules: 8/8. Khmer subtitle wrapping: 7/7. Result workspace: 55/55.
- In the running app: Khmer Edge TTS voices (Sreymom, Piseth), the Khmer UI locale (partial), and the Dub Engine settings panel.

### Not re-checked in this audit

- T1.6 subtitle render parity (script not re-run).
- Full `pnpm typecheck` / `pnpm build` / `pnpm test` across all workspaces.

## How to work a task

1. Set the task to `doing` and create a branch `phase-<n>/<short-name>`.
2. Make the smallest change that meets the task; validate at the task's risk tier (`AGENTS.md`).
3. Paste the exact command and its result into **Evidence**, then set `done`.
4. When every task is `done`, run the exit gate and record its evidence; then mark the phase done here.

Blocked tasks: set `blocked` and write the reason (and the decision or ADR it waits on) in **Evidence**.

A gate is ticked only when its own stated condition has been run and shown, not when the tasks look complete.
