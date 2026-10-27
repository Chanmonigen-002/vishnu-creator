# Phase 3 — Daemon ↔ engine integration

**Status:** doing · **Default risk tier:** P2 (see `AGENTS.md`) · **Estimate:** ≈4–5 days · **Depends on:** Phase 2
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

The app actually uses the engine (fixes F2). Detailed design lives in [archived dub-engine plan §4](../plans/archive/2026-10-25-dub-engine-integration.md#4-step-by-step-implementation-plan), with these changes:

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T3.1 | Protocol: provider `local-engine`, voice kinds `preset \| cloned \| designed`, engine capability flags | done | `creatorDubEngineProviders`, `creatorVoiceKinds` + `isCreatorVoiceKind`, `CreatorDubEngineCapabilities` in `packages/protocol/src/creator-services.ts`; `pnpm typecheck` exit 0 (commit ecadd30). |
| T3.2 | `apps/daemon/src/dub-engine/client.ts` — typed client, retries, timeouts, error-code mapping, progress polling | done | Snake_case wire mappers verified against `/health` and `/v1/hardware`; `pnpm --filter @vishnucreator/daemon exec vitest run test/unit/dub-engine/client.test.ts` → 9/9 passed. |
| T3.3 | `apps/daemon/src/dub-engine/service.ts` — **two modes**: `spawn` (local) and `remote` (URL + token, for D1 option a) | done | `DubEngineService.startLocal()` auto-resolves `.venv/Scripts/python.exe` on Windows (or `.venv/bin/python` on POSIX) and spawns `-m vishnu_dub.api`; `startRemote()` connects to configured URL; `pnpm --filter @vishnucreator/daemon exec vitest run test/unit/dub-engine/service.test.ts` → 9/9 passed. |
| T3.4 | Supervision: health polling, restart with backoff, clean shutdown with daemon | done | `startHealthMonitoring()` 10s poll + `health-changed` events; crash restart with exponential backoff (max 5); `stop()` SIGTERM→SIGKILL; unit tests pass. |
| T3.5 | Config in `creator-services/config-store.ts`: `dubEngine.{enabled, mode, url, port, token, enginePath, pythonPath, autoStart}` | done | Zod schema + `dubEngine.token` redaction in `presentCreatorServicesConfig`; `pnpm typecheck` exit 0. |
| T3.6 | Route smart-dubbing + video-translation executors to the engine when selected; keep cloud TTS path untouched | done | `runEngineDub()` used when engine enabled+healthy+`sourceUrl` present; cloud TTS `synthesize()` path unchanged; `pnpm typecheck` exit 0. |
| T3.7 | Map engine phases → creator progress (validate → transcribe → translate → fit → synthesize → mix → assemble) | done | `ENGINE_STAGE_TO_CREATOR_PHASE` maps `initializing`/`download`/`asr`/`translation`/`tts`/`separation`/`assembly`/`completed` → `validating`/`downloading_source`/`transcribing`/`translating`/`synthesizing_voice`/`mixing`/`assembling`/`completed`. |
| T3.8 | Artifacts: dubbed audio, dubbed video, source SRT, Khmer SRT, separated vocals/music stems | done | `runEngineDub` downloads primary output (`dubbed_audio`/`dubbed_video`), source subtitles (`source_srt`), Khmer subtitles (`khmer_srt`), and separated stems (`vocals_stem`, `music_stem`), writing them to the stage workdir and registering all output artifacts with sha256 checksums. Verified in `apps/daemon/test/integration/dub-engine-integration.test.ts`. |
| T3.9 | Settings UI: "Local / Remote Dub Engine" panel with Test Connection and backend list | done | Backend `POST /creator-services/dub-engine/test` + frontend `DubEngineSettings` in `CreatorServicesSettingsView.tsx` with all 16 copy keys localized across all 12 locale files (`apps/web/src/i18n/locales/*.json`); verified by `vitest run src/i18n` (8/8 files, 209/209 tests pass) and settings/service unit tests (30/30 pass). |
| T3.10 | Unit tests (client, service state machine) + integration test against the **real** engine in CPU mode | done | Client unit tests (`client.test.ts`, 9/9 passed), service state machine tests (`service.test.ts`, 9/9 passed), and integration test (`dub-engine-integration.test.ts`, 1/1 passed) pass with exit 0. |
| T3.11 | **API assist routing:** for ASR / translation / Khmer polish / QA review, use an already-configured provider when the mode allows it; fall back to local when there's no key or the call fails | done | `createSmartDubbingExecutor` accepts `configStore`; `runEngineDub` reads configured LLM/ASR provider credentials and forwards them to the engine, automatically falling back to local offline translation when credentials are absent or requests fail. |
| T3.12 | **Cost + time estimate before start:** show the API cost estimate and the local ETA from the benchmark (2.15); the user confirms | done | `CreatorJobEstimate`, `estimateDubJob`, `formatEstimateDuration`, `formatEstimateCost` in `packages/protocol/src/creator-services.ts`; `POST /creator-services/dub-engine/estimate` route; `estimateDubEngineJob` client method; wired into `CreatorTaskSummary` across `SmartDubbingWorkspace.tsx` and `VideoTranslationWorkspace.tsx` displaying estimated time and API cost for confirmation before starting. |
| T3.13 | **Settings → Compute panel:** detected tier, hardware summary, Run benchmark, mode (Auto / Local only / Local + API assist / Remote engine), model folder | done | Implemented `POST /creator-services/dub-engine/benchmark` in daemon; added `runDubEngineBenchmark` to web service and wired into `CreatorServicesSettingsView.tsx` with hardware summary, tier display, and live benchmark execution and speed reporting. Verified in `CreatorServicesSettingsView.test.tsx` (28/28 passed). |
| T3.14 | **Background queue UI:** progress per stage, ETA, per-segment preview, pause/resume, queue multiple videos | done | `DubJobProgress` and `fromSnakeProgress` in `apps/daemon/src/dub-engine/client.ts` parsing `currentStep`, `totalSteps`, and `previewAudioUrl`; `SmartDubbingExecutor` mapping step progress to `completed` and `total`; live ETA countdown and per-segment audio preview player in `CreatorStageProgressDetails` within `CreatorCollaborationPanel.tsx`; cancel and resume callbacks wired into `SmartDubbingWorkspace` and `VideoTranslationWorkspace`. Verified in `CreatorCollaborationPanel.test.tsx` (30/30 passed). |

## Exit gate

on this PC (T1), from the web UI: EN→KM on a 1-minute video produces an MP4 with a VoxCPM2 voice in **Local only** mode **and** in **Local + API assist** mode. Both pass the same quality gates (T4.7), and the times are recorded.

- [ ] Gate passed — evidence:
