# Phase 3 — Daemon ↔ engine integration

**Status:** Not started · **Default risk tier:** P2 (see `AGENTS.md`) · **Estimate:** ≈4–5 days · **Depends on:** Phase 2
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

The app actually uses the engine (fixes F2). Detailed design lives in [archived dub-engine plan §4](../plans/archive/2026-10-25-dub-engine-integration.md#4-step-by-step-implementation-plan), with these changes:

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T3.1 | Protocol: provider `local-engine`, voice kinds `preset \| cloned \| designed`, engine capability flags | done | `creatorDubEngineProviders`, `creatorVoiceKinds` + `isCreatorVoiceKind`, `CreatorDubEngineCapabilities` in `packages/protocol/src/creator-services.ts`; `npx tsc -p tsconfig.json` exit 0 (commit ecadd30) |
| T3.2 | `apps/daemon/src/dub-engine/client.ts` — typed client, retries, timeouts, error-code mapping, progress polling | done | Commit f4b3ed9/bab19c7; snake_case wire mappers verified against live engine (`/health` → `{"status":"ok","version":"0.1.0"}`); 9 unit tests pass (`npx vitest run test/unit/dub-engine/client.test.ts` → 9 passed, commit c5359c7) |
| T3.3 | `apps/daemon/src/dub-engine/service.ts` — **two modes**: `spawn` (local) and `remote` (URL + token, for D1 option a) | done | `DubEngineService.startLocal()` spawns venv Python `-m vishnu_dub.api`; `startRemote()` connects to URL; `npx tsc -p tsconfig.json --noEmit` exit 0 |
| T3.4 | Supervision: health polling, restart with backoff, clean shutdown with daemon | done | `startHealthMonitoring()` 10s poll + `health-changed` events; crash restart with exponential backoff (max 5); `stop()` SIGTERM→SIGKILL; typecheck exit 0 |
| T3.5 | Config in `creator-services/config-store.ts`: `dubEngine.{enabled, mode, url, port, token, enginePath, pythonPath, autoStart}` | done | Commit 63cb939: zod schema + `dubEngine.token` redaction in `presentCreatorServicesConfig`; typecheck exit 0 |
| T3.6 | Route smart-dubbing + video-translation executors to the engine when selected; keep cloud TTS path untouched | done | Commit bab19c7: `runEngineDub()` used when engine enabled+healthy+`sourceUrl` present; cloud TTS `synthesize()` path unchanged; typecheck exit 0 |
| T3.7 | Map engine phases → creator progress (validate → transcribe → translate → fit → synthesize → mix → assemble) | done | Commit 667fa29: `ENGINE_STAGE_TO_CREATOR_PHASE` maps initializing/download/asr/translation/tts/separation/assembly/completed → validating/downloading_source/transcribing/translating/synthesizing_voice/mixing/assembling/completed |
| T3.8 | Artifacts: dubbed audio, dubbed video, source SRT, Khmer SRT, separated vocals/music stems | doing | `runEngineDub` downloads + writes dubbed audio; video/SRT/stem artifacts pending engine result-artifact wiring |
| T3.9 | Settings UI: "Local / Remote Dub Engine" panel with Test Connection and backend list | done | Backend: POST /creator-services/dub-engine/test (GET /health + /v1/hardware via DubEngineClient), RuntimeErrorCode gains DUB_ENGINE_ERROR/DUB_ENGINE_UNREACHABLE (commits 7891215). Frontend: CreatorServicesSection gains 'dubEngine'; DubEngineSettings panel (enabled, mode local/remote, port/python/engine paths, auto-start, URL + token, Test Connection, shows version/tier/RAM); creator-services-service.testDubEngineConnection + unit tests (commit 380cbc0); npx tsc exit 0 on web + daemon; 30/30 settings + service tests pass |
| T3.10 | Unit tests (client, service state machine) + integration test against the **real** engine in CPU mode | doing | Client mapper tests: 9/9 pass (c5359c7); service state machine: 9/9 pass; real-engine integration test pending |
| T3.11 | **API assist routing:** for ASR / translation / Khmer polish / QA review, use an already-configured provider when the mode allows it; fall back to local when there's no key or the call fails | todo | |
| T3.12 | **Cost + time estimate before start:** show the API cost estimate and the local ETA from the benchmark (2.15); the user confirms | todo | |
| T3.13 | **Settings → Compute panel:** detected tier, hardware summary, Run benchmark, mode (Auto / Local only / Local + API assist / Remote engine), model folder | todo | |
| T3.14 | **Background queue UI:** progress per stage, ETA, per-segment preview, pause/resume, queue multiple videos | todo | |

## Exit gate

on this PC (T1), from the web UI: EN→KM on a 1-minute video produces an MP4 with a VoxCPM2 voice in **Local only** mode **and** in **Local + API assist** mode. Both pass the same quality gates (T4.7), and the times are recorded.

- [ ] Gate passed — evidence:
