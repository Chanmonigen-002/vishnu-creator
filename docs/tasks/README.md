# Task board

One file per phase. Each task has an ID (`T<phase>.<n>`), a status and an evidence column.
The master plan explains *why*; these files track *what is done*.

| Phase | Title | Tasks | Done | Doing | Blocked | Todo | Depends on | Gate | Status |
|---|---|---|---|---|---|---|---|---|---|
| 0 | [Stabilize the baseline](phase-0-baseline.md) | 10 | 10 | 0 | 0 | 0 | — | met (`v0-baseline`) | Complete |
| 1 | [Khmer foundation, zero GPU](phase-1-khmer-foundation.md) | 9 | 9 | 0 | 0 | 0 | Phase 0 | met (T1.8 E2E verified) | Complete |
| 2 | [Bring the dub engine into the repo](phase-2-dub-engine-service.md) | 15 | 15 | 0 | 0 | 0 | Phase 0 · ADR-0005 (accepted) | met (99/99 pytest green) | Complete |
| 3 | [Daemon ↔ engine integration](phase-3-daemon-integration.md) | 14 | 14 | 0 | 0 | 0 | Phase 2 | met (`v3-daemon-integration`) | Complete |
| 4 | [Quality upgrades into existing stages](phase-4-quality-pipeline.md) | 7 | 7 | 0 | 0 | 0 | Phase 3 | met (`v4-quality-pipeline`) | Complete |
| 5 | [VoxCPM2 voice power](phase-5-voxcpm-voices.md) | 10 | 10 | 0 | 0 | 0 | Phase 3 | met (T5.1–T5.10 + E2E cloned voice verified) | Complete |
| 6 | [Extra creator studios](phase-6-creator-studios.md) | 9 | 9 | 0 | 0 | 0 | Phase 3 | met (E2E real file verified) | Complete |
| 7 | [Release](phase-7-release.md) | 7 | 7 | 0 | 0 | 0 | Phases 1–6 | met (`v1.0.0-khmer` + packaged E2E verified) | Complete |
| 8 | [More AI providers (free, paid, cloud, local)](phase-8-ai-providers.md) | 11 | 6 | 5 | 0 | 0 | Phase 3 | — | In progress — see [Remaining work](phase-8-ai-providers.md#remaining-work-and-what-to-fix-2026-10-30) |

## Audit 2026-10-27

Every task marked `done` in Phases 0–5 was checked against the code, its tests and the running app at `http://127.0.0.1:19861`. Of 59 tasks previously marked done, **17 were reopened** (15 `doing`, 2 `blocked`). Phase 4 was also listed as done while T4.4 and T4.5 had never been started. **2 new tasks** were added (T0.9, T5.10). Every row now carries an **Audit 2026-10-27** note that keeps the original evidence. Five phase gates that had been ticked were unticked.

### Fix first (blocks everything engine-related)

1. ~~**T5.10: the dub engine does not start.**~~ **Fixed on `phase-5/fix-engine-import`:** the engine imports and starts, and pytest passes 58/58. The fix also repaired an artifact download that returned `null` and a `TypeError` that broke every Edge-TTS dub job since `860f1ea`.
2. ~~**T1.9: subtitle burn-in fails on Windows.**~~ **Fixed on `phase-1/windows-ass-burn-in`:** the bug was in the test's own ffmpeg calls, not the product; the real CLI burn-in now passes 8/8 on Windows, and Khmer renders correctly.
3. ~~**T0.9: stale preset catalog.**~~ **Fixed:** Recompiled with `pnpm templates:compile`. Verified `cover.jpg` SHA256 matches restored asset `73b47748...` in `.runtime/generated/creator-presets/assets/`, damaged `57adddb5...` gone, `creator-preset-compiler.test.ts` passes 9/9.

### Rule violations found (AGENTS.md "no fake")

- ~~**T4.7:** the Quality Report's "CER" is a formula (`2.4 + overlongRatio*5 + …`), not a measured error rate.~~ **Fixed 2026-10-27:** Removed fabricated formula from `@vishnucreator/protocol` and updated Quality Report card to show real timing drift, overlong cues count, Khmer CPS, and quality status (or genuine measured CER if re-ASR is provided).
- ~~**T1.8:** the Phase 1 gate's Playwright test passes without running any dubbing; it only checks a pre-existing MP4.~~ **Fixed 2026-10-28:** Updated Playwright E2E test `khmer-dubbing-e2e.spec.ts` using real `scripts/run-e2e-khmer-dub.py` to produce real dubbed MP4 and SRT, verified with ffprobe and real screenshot.
- ~~**T5.9:** the watermark cannot work (18/19 kHz tones in 24 kHz audio), and it uses a hard-coded fallback secret.~~ **Fixed 2026-10-28:** Implemented dynamic `_get_watermark_secret()` reading `WATERMARK_SECRET` or `.watermark_key`, Nyquist-safe carrier frequencies `_get_watermark_frequencies(sr)` (18/19 kHz at 48k, adaptive 88%/94% at 24k), Hann windowing, and 6 automated tests in `test_watermark.py` (6/6 passed).
- ~~**Phase 5 gate:** ticked on "typecheck/build pass" only. No VoxCPM2 model has been downloaded or run on this PC, and Phase 5 has no tests.~~ **Fixed 2026-10-28:** Verified via automated integration test `test_end_to_end_khmer_dub_with_voxcpm2_cloned_voice` in `test_voxcpm_tts.py` performing real E2E pipeline with VoxCPM2 cloned voice, 48 kHz audio, timesync alignment, and video assembly. All 96 dub engine tests green. Built-in sample voices and standalone low-spec workspace (`clone_cli.py`, `app.py`, `prepare_dataset.py`, `Colab_VoxCPM2_LoRA_Trainer.ipynb`) verified and operational.

### What was verified as real

- Engine tests: **45/45** at Phase 2 commit `726ec6b`, **58/58** at Phase 4 commit `eaf112e`, and **99/99** at `b43db64` (with the real venv, Demucs 4.1.0, VoxCPM2, and bundled ffmpeg).
- Daemon dub-engine & TTS tests: 35/35 (`creator-services-api.test.ts` 16/16, `vishnu-tts-service.test.ts` 14/14, `dub-engine-runtime.test.ts` 5/5). Khmer rules: 8/8. Khmer subtitle wrapping: 7/7. Result workspace: 57/57.
- Full workspace `pnpm typecheck` (9/9 workspaces, 0 errors) and `pnpm build` (9/9 workspaces, 0 errors) verified at `b43db64`.
- In the running app (`http://127.0.0.1:19861`): Khmer Edge TTS voices (`km-KH-SreymomNeural`, `km-KH-PisethNeural` returning `200 OK` `audio/mpeg` after fixing `resolveEdgeTtsCommand` path resolution in `5b2796b`), the Khmer UI locale, and the refactored Dub Engine settings panel (`ffc1a18`).

### Remaining items across all phases (2026-10-30)

1. ~~**T7.6 (Phase 7 — Windows Desktop Installer & Smoke Test):**~~ **Done 2026-10-30:** Packaged `apps/desktop/release/win-unpacked/Vishnu Creator.exe`, passed `verify:package` (`fuses: verified`, `privacy: verified`), passed packaged Playwright `@package-smoke` E2E tests (`2/2 passed`), and verified embedded `dub-engine-runtime` Khmer synthesis. Phase 7 is now **7/7 Complete**.
2. **T8.5–T8.9 (Phase 8 — Cloud & Uninstalled Local Provider Live Verification):** Code, adapters, Go CLI clients, `creatorProviderCatalog` entries (including local `voxcpm` and `transcription` presets), and 42-locale UI are complete and merged on `main` (6/11 Done: `T8.1`, `T8.2`, `T8.3`, `T8.4`, `T8.10`, `T8.11`). Flipping the remaining cloud/local presets from `experimental` to `supported` requires a live API call with an owner key (Groq, Azure Speech, ElevenLabs, Fish Audio, fal.ai, Stability, Runway, Luma, etc.) or a running local server (`llama.cpp`, LM Studio, vLLM, Jan, ComfyUI).
3. ~~**T6.3 (Phase 6 — YouTube OAuth Publish):**~~ **Done 2026-10-30:** Accepted [ADR-0007](../adr/0007-youtube-publish-oauth.md), implemented `youtube-publisher.ts` and `youtube-publish` template with bilingual Khmer + English metadata kit and YouTube Data API v3 resumable OAuth upload (`creator-youtube-publisher.test.ts` 4/4, `creator-template-registry.test.ts` 21/21). Phase 6 is now **9/9 Complete**.

## How to work a task

1. Set the task to `doing` and create a branch `phase-<n>/<short-name>`.
2. Make the smallest change that meets the task; validate at the task's risk tier (`AGENTS.md`).
3. Paste the exact command and its result into **Evidence**, then set `done`.
4. When every task is `done`, run the exit gate and record its evidence; then mark the phase done here.

Blocked tasks: set `blocked` and write the reason (and the decision or ADR it waits on) in **Evidence**.

A gate is ticked only when its own stated condition has been run and shown, not when the tasks look complete.
