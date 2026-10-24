> **Status: Superseded (2026-10-25)** by [docs/project/master-plan.md](../../project/master-plan.md). Kept for its detailed Phase 1–4 design, which Phase 3 of the master plan reuses. Do not track work here.

# Master Plan: ZastTranslate + VoxCPM Integration into Vishnu Creator

**Project**: Wire the Khmer-first local dubbing engine (ZastTranslate + VoxCPM2) into the Vishnu Creator monorepo as a first-class managed service.

**Date**: 2026-10-25
**Status**: Planning — no code written yet
**Owner**: You (decision), Assistant (execution)

---

## 1. Executive Summary

### Current State
- **Main project** (`D:\Build App\Vishnu Creator`): Full rebrand of OpenCreator, running at `http://127.0.0.1:19861/`. Smart dubbing exists but only supports cloud TTS (OpenAI, Aliyun, MiniMax, Volcengine).
- **Reference clones** (`File clone Resource/`): ZastTranslate (Gradio studio) + VoxCPM2 (voice cloning, 30 langs incl. Khmer, Apache-2.0). Both security-audited, clean.
- **Bridge exists but unused**: `scripts/dub-engine.mjs` launches `vishnu_api.py` (FastAPI on 127.0.0.1:8765) exposing `/transcribe`, `/translate`, `/synthesize`, `/assemble`. **Nothing in the daemon or web app calls it.**

### Goal
Make **local Khmer-first dubbing** a production feature in Vishnu Creator:
- Zero-API-key video translation + dubbing (WhisperX → LLM translation → VoxCPM2 voice cloning → ffmpeg assembly)
- Integrated into the existing creator workflow (`video-translation` template, `smart-dubbing` workspace)
- Managed by the daemon (auto-start, health, restart)
- Usable from the web UI with the same UX as cloud TTS

---

## 2. Architecture Decision

### Option A: Daemon HTTP Client → FastAPI Bridge (Chosen)
```
Web UI → Daemon REST (/smart-dubbing/*) → DubEngineClient (HTTP) → FastAPI :8765 → ZastTranslate modules
```
**Pros**: Clear separation, language-agnostic, daemon manages process lifecycle, matches existing service pattern.
**Cons**: Extra hop, need process management.

### Option B: Embed Python in Daemon (via child_process/spawn)
**Pros**: No network hop.
**Cons**: Complex dependency management, harder to isolate crashes, deviates from current architecture.

### Option C: Rewrite ZastTranslate pipeline in TypeScript
**Pros**: Native integration.
**Cons**: Months of work, VoxCPM2 is PyTorch — not portable to JS.

**Decision**: **Option A**. The FastAPI bridge is already written, tested, and matches the module boundaries of ZastTranslate. The daemon already manages `yt-dlp`, `ffmpeg`, `codex` as external processes — this fits the pattern.

---

## 3. Integration Scope

### In Scope
1. **DubEngineClient** (TypeScript) — typed HTTP client for the FastAPI bridge
2. **DubEngineService** (daemon) — lifecycle (start/stop/health), config, process supervision
3. **SmartDubbingExecutor enhancement** — route to dub engine when `provider === 'local'` or `voiceCode === 'voxcpm2'`
4. **Protocol types** — add `local` provider, `voxcpm2` voice, Khmer language codes
5. **Web service** — no change needed (already calls `/smart-dubbing/*`)
6. **Config/schema** — `VISHNU_DUB_ENGINE_PATH`, `VISHNU_DUB_ENGINE_PORT`, auto-start toggle
7. **Tests** — unit (client), integration (daemon), e2e (web → daemon → engine)

### Out of Scope
- Rewriting Gradio UI → not needed (bridge is headless)
- VoxCPM2 model hosting — bridge downloads from HF (`openbmb/VoxCPM2`, `Mariya987/VoxCPM2-khmer-DDD`)
- Multi-speaker diarization — ZastTranslate supports it; expose later if needed
- GPU memory management — bridge handles VRAM; daemon only monitors health

---

## 4. Step-by-Step Implementation Plan

### Phase 0: Prerequisites & Verification (Day 0)
| Task | Description | Verification |
|------|-------------|--------------|
| 0.1 | Verify ZastTranslate clone runs: `cd File clone Resource/ZastTranslate && python -m pip install -e . && python vishnu_api.py` | `GET /health` returns 200, backends listed |
| 0.2 | Verify VoxCPM2 loads: `python -c "from voxcpm import VoxCPM; VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=True)"` | No OOM, model loads |
| 0.3 | Verify Khmer LoRA: check `Mariya987/VoxCPM2-khmer-DDD` exists on HF | `huggingface-cli download Mariya987/VoxCPM2-khmer-DDD` |
| 0.4 | Confirm `dub:engine` script works from repo root | `pnpm dub:engine` starts, logs port 8765 |

**Gate**: All 4 pass → proceed. Any fail → fix reference clone first.

---

### Phase 1: Dub Engine Client & Types (Day 1)

#### 1.1 Protocol Extensions (`packages/protocol/src/`)
- Add to `CreatorTtsProvider`: `'local'`
- Add to `CreatorTtsVoice` kind: `'cloned'`
- Add language codes: `km` (Khmer), `khm_Khmr` (NLLB)
- Add `SmartDubbingRequest.localEngine?: boolean`

#### 1.2 DubEngineClient (`apps/daemon/src/dub-engine/client.ts`)
```typescript
// Typed client for http://127.0.0.1:8765
class DubEngineClient {
  async health(): Promise<HealthResponse>
  async transcribe(req: TranscribeRequest): Promise<TranscribeResponse>
  async translate(req: TranslateRequest): Promise<TranslateResponse>
  async synthesize(req: SynthesizeRequest): Promise<SynthesizeResponse>
  async assemble(req: AssembleRequest): Promise<AssembleResponse>
}
```
- Retry with backoff (3×, 1s base)
- Timeout: 10 min for transcribe, 5 min for synthesize
- Structured errors → map to `VishnuTtsServiceError` codes

#### 1.3 Unit Tests (`apps/daemon/test/unit/dub-engine-client.test.ts`)
- Mock fetch, verify request/response shapes
- Error mapping coverage

---

### Phase 2: Dub Engine Service (Daemon Lifecycle) (Day 1–2)

#### 2.1 Service Interface (`apps/daemon/src/dub-engine/service.ts`)
```typescript
interface DubEngineService {
  start(): Promise<void>      // spawn dub-engine.mjs, wait for /health
  stop(): Promise<void>       // SIGTERM, wait, SIGKILL fallback
  health(): Promise<boolean>  // GET /health
  getClient(): DubEngineClient
  isRunning(): boolean
}
```

#### 2.2 Implementation Details
- **Spawn**: `node scripts/dub-engine.mjs` with env vars from config store
- **Working dir**: repo root (so `../ZastTranslate` resolves to reference clone)
- **Health polling**: 2s interval, 30s timeout on start
- **Auto-restart**: on crash (max 3×/min), exponential backoff
- **Config**: read from `creatorServicesConfigStore` → `dubEngine.path`, `dubEngine.port`, `dubEngine.autoStart`

#### 2.3 Integration in `server.ts`
- Create service early (before `creatorExecutors`)
- Register `onClose` → `stop()`
- If `autoStart`, call `start()` in `onListen` hook
- Expose via `creatorServicesRoutes` for config UI

#### 2.4 Tests
- Unit: lifecycle state machine
- Integration: spawn real `dub-engine.mjs` (mock Python), verify health endpoint

---

### Phase 3: Smart Dubbing Executor Enhancement (Day 2–3)

#### 3.1 Routing Logic (`apps/daemon/src/creator/smart-dubbing/executor.ts`)
```typescript
async run(stage) {
  const request = readRequest(stage.job.state);
  const useLocal = request.provider === 'local' || request.voiceCode?.startsWith('voxcpm2');

  if (useLocal) {
    return await runLocalDubbing(stage, request, dubEngineService);
  }
  // existing cloud TTS path
}
```

#### 3.2 Local Dubbing Flow (`runLocalDubbing`)
1. **Validate**: text length, voice sample path (optional), Khmer-first defaults
2. **Transcribe** (if source is video/audio): call `/transcribe` with `media_path`
3. **Translate**: call `/translate` with segments, `target_lang: 'Khmer'`, `target_code: 'km'`
4. **Synthesize**: call `/synthesize` with translated segments, `voice_sample` for cloning
5. **Assemble**: call `/assemble` with video + dubbed audio → final MP4
6. **Progress reporting**: map engine phases to creator progress (validating 5%, transcribing 20%, translating 40%, synthesizing 70%, assembling 90%)

#### 3.3 Artifact Outputs
- `dubbed_audio` (WAV/MP3)
- `dubbed_video` (MP4)
- `target_subtitle` (SRT, fitted)
- Metadata: provider=`local`, model=`voxcpm2`, voice=`cloned`|`default`

#### 3.4 Fallback
- If engine unavailable → `SMART_DUBBING_PROVIDER_UNSUPPORTED` with hint: "Enable local dub engine in Settings → Creator Services"

---

### Phase 4: Config & Settings UI (Day 3)

#### 4.1 Config Schema (`packages/protocol/src/creator-services-config.ts`)
```typescript
dubEngine: {
  enabled: boolean;           // default false
  enginePath: string;         // default "../ZastTranslate" (relative to repo root)
  port: number;               // default 8765
  pythonPath: string;         // default "C:\\Python314\\python.exe" (win) / "python3"
  autoStart: boolean;         // default true
  khmerLoraPath?: string;     // optional override for VISHNU_KHMER_LORA_PATH
}
```

#### 4.2 Daemon Config Store
- Persist in `creator-services.json` (same as other services)
- Validate paths on save (must exist or be creatable)

#### 4.3 Web Settings Page
- Add "Local Dub Engine" section under Creator Services
- Fields: Enable, Engine Path (file picker), Port, Python Path, Khmer LoRA Path, Auto-start
- "Test Connection" button → calls `/health` via daemon proxy

#### 4.4 Env Var Precedence
1. Config store (UI)
2. `VISHNU_DUB_ENGINE_PATH` / `VISHNU_DUB_ENGINE_PORT` / `VISHNU_DUB_PYTHON`
3. Defaults

---

### Phase 5: End-to-End Verification (Day 4)

#### 5.1 Test Matrix
| Scenario | Input | Expected |
|----------|-------|----------|
| Basic Khmer dub | Video (EN) → Khmer, no voice sample | Dubbed video, Khmer audio, cloned default voice |
| Voice cloning | Video (EN) → Khmer, user WAV | Dubbed video, user voice cloned |
| Same-language | Video (KM) → Khmer, clean up | Clean Khmer audio, timing preserved |
| Long video | 10 min video | Completes without OOM (30s ref trim) |
| Engine restart | Kill engine mid-job | Daemon restarts, job fails cleanly with retry hint |

#### 5.2 Automated Tests
- **Integration test** (`apps/daemon/test/integration/smart-dubbing-local.test.ts`):
  - Start daemon with test config pointing to real ZastTranslate clone
  - Create `video-translation` job with `provider: 'local'`
  - Verify job completes, artifacts present
- **E2E test** (`apps/web/e2e/smart-dubbing-local.spec.ts`):
  - Playwright: open web UI, create smart-dubbing job, select "Local (VoxCPM2)" voice
  - Verify result plays in browser

#### 5.3 Performance Baselines
| Metric | Target |
|--------|--------|
| Cold start (engine boot) | < 45s (model load) |
| 1 min video dub | < 3 min |
| VRAM peak | < 8 GB (RTX 3070/4070) |
| CPU fallback | Works (slower) |

---

### Phase 6: Polish & Documentation (Day 5)

#### 6.1 Documentation
- `docs/LOCAL_DUB_ENGINE.md`: setup, config, troubleshooting
- Update `README.md` with "Local Khmer Dubbing" feature
- Add to onboarding: "No API keys needed for Khmer dubbing"

#### 6.2 Error UX
- Friendly errors: "Local engine not running — click Start in Settings"
- Log correlation: daemon request ID ↔ engine request ID

#### 6.3 Cleanup
- Remove `scripts/dub-engine.mjs` TODOs
- Ensure `File clone Resource/README.txt` still says "reference only"
- No test files left in reference clone

---

## 5. Task Breakdown (Todo List)

### Phase 0: Prerequisites
- [ ] 0.1 Verify ZastTranslate clone runs
- [ ] 0.2 Verify VoxCPM2 loads
- [ ] 0.3 Verify Khmer LoRA availability
- [ ] 0.4 Confirm `pnpm dub:engine` works

### Phase 1: Client & Types
- [ ] 1.1 Extend protocol types (provider `local`, voice `voxcpm2`, lang `km`)
- [ ] 1.2 Create `DubEngineClient` with typed methods
- [ ] 1.3 Add unit tests for client
- [ ] 1.4 Run `pnpm typecheck` — zero errors

### Phase 2: Daemon Service
- [ ] 2.1 Create `DubEngineService` interface + implementation
- [ ] 2.2 Wire into `server.ts` (create, start/stop, health)
- [ ] 2.3 Add config keys to `creatorServicesConfigStore`
- [ ] 2.4 Register config routes in `creatorServicesRoutes`
- [ ] 2.5 Unit + integration tests for service lifecycle

### Phase 3: Executor Integration
- [ ] 3.1 Add routing logic in `createSmartDubbingExecutor`
- [ ] 3.2 Implement `runLocalDubbing` with 5-step pipeline
- [ ] 3.3 Map progress phases correctly
- [ ] 3.4 Handle errors → user-friendly codes
- [ ] 3.5 Test with existing `video-translation` template

### Phase 4: Config & UI
- [ ] 4.1 Extend protocol config schema
- [ ] 4.2 Persist in config store with validation
- [ ] 4.3 Build Settings UI section (web)
- [ ] 4.4 Add "Test Connection" action

### Phase 5: Verification
- [ ] 5.1 Run integration test suite
- [ ] 5.2 Run e2e Playwright test
- [ ] 5.3 Performance baseline measurements
- [ ] 5.4 Test failure modes (engine down, OOM, bad input)

### Phase 6: Polish
- [ ] 6.1 Write documentation
- [ ] 6.2 Update onboarding copy
- [ ] 6.3 Final `pnpm typecheck`, `pnpm build`, `pnpm test`
- [ ] 6.4 Commit + push

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| VoxCPM2 OOM on 8 GB GPU | High | High | Bridge already trims ref to 30s; test on 8 GB; document `--low-vram` flag |
| Python env broken on user machine | Medium | High | Bundle Python 3.11+ in runtime (like yt-dlp); validate on start |
| Khmer LoRA download fails (HF rate limit) | Medium | Medium | Cache in `.vishnucreator/models/`; fallback to base VoxCPM2 |
| Engine startup > 60s (slow disk) | Low | Medium | Increase health timeout; show progress in UI |
| Path resolution breaks on Windows | Medium | Medium | Use `path.resolve` everywhere; test on Windows |
| Daemon doesn't restart engine on crash | Low | High | Supervision loop with max-restart-rate; log to daemon console |

---

## 7. Acceptance Criteria (Definition of Done)

1. **Functional**: User can select "Local (VoxCPM2)" in Smart Dubbing, input a YouTube URL, target Khmer, get a dubbed MP4 — no API keys entered.
2. **Reliable**: Engine auto-starts with daemon, restarts on crash, health endpoint monitored.
3. **Typed**: `pnpm typecheck` passes with zero errors across workspace.
4. **Tested**: Integration test passes in CI; e2e test passes locally.
5. **Documented**: Settings page explains the feature; troubleshooting guide exists.
6. **No regressions**: Existing cloud TTS providers still work; all existing tests pass.

---

## 8. Next Action for You

**Review this plan.** Decide:
1. **Approve as-is** → I'll start Phase 0 verification immediately.
2. **Adjust scope** — e.g., skip Settings UI for now, hardcode defaults.
3. **Change architecture** — if you prefer Option B or C.

Once approved, I'll claim the work and begin Phase 0 in a worktree per Vishnu rules.