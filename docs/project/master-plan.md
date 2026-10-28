# Vishnu Creator — Master TODO Plan (Combined Project)

**One product, three sources:** OpenCreator (app base) + ZastTranslate (dubbing pipeline) + VoxCPM2 (voice engine).
**Focus:** Khmer-first video, voice, subtitle and AI creation.
**Created:** 2026-10-25 · **Owner:** project owner · **Status:** Active
**Supersedes:** [2026-10-25-dub-engine-integration.md](../plans/archive/2026-10-25-dub-engine-integration.md) (folded into Phase 3).

> **Where things live:** this file = the *why* and *what*. Task tracking → [`docs/tasks/`](../tasks/README.md). Decisions → [`docs/adr/`](../adr/README.md). Working rules for people and AI agents → [`AGENTS.md`](../../AGENTS.md).

---

## 0. Ground truth (checked on 2026-10-25, not assumed)

| # | Fact | How it was checked | Impact |
|---|------|--------------------|--------|
| F1 | Vishnu Creator (fork of OpenCreator) runs; `http://127.0.0.1:19861/` returns 200 and shows the "Local mode" sign-in screen | `curl`, browser | Base app is alive |
| F2 | **Nothing in `apps/` or `packages/` calls the dub engine** (no reference to `8765`, `dubEngine`, `voxcpm`) | `grep` | ZastTranslate + VoxCPM are **not combined yet** — only a launcher script exists |
| F3 | `scripts/dub-engine.mjs` looks for `../ZastTranslate` (sibling folder) — that folder does not exist. The clone lives in `File clone Resource/`, which your rule says is **reference only, never run from it** | `ls`, README.txt | The engine must be **copied into the repo** as a real service, not run from the reference folder |
| F4 | GPU is **GT 1030, 2 GB VRAM**. VoxCPM2 needs **~8 GB** (README table); WhisperX large-v3 needs similar | `nvidia-smi`, VoxCPM README | Local GPU dubbing **cannot run on this PC**. CPU mode will be very slow. A compute decision is needed (see §2) |
| F5 | System Python is **3.14**; VoxCPM requires **Python ≥3.10, <3.13**; torch not installed | `python --version`, README | Engine needs its own pinned Python 3.11/3.12 env |
| F6 | ffmpeg is not on PATH, but bundled at `.runtime/vendor/creator-runtime/win32-x64/ffmpeg.exe` | `ls` | Engine must reuse the bundled ffmpeg |
| F7 | `edge-tts` is already a smart-dubbing provider, but no Khmer voice (`km-KH-SreymomNeural`, `km-KH-PisethNeural`) is wired | `grep` | **Free Khmer TTS is available today with zero GPU** — quickest win |
| F8 | VoxCPM2 supports Khmer (CER 2.05% in its own benchmark), voice design, cloning, LoRA fine-tuning; Apache-2.0 | VoxCPM README | Best long-term Khmer voice engine |
| F9 | **ZastTranslate has no LICENSE file** | `ls` | Must confirm reuse rights before shipping its code |
| F10 | Khmer support in app: `km` is in the language catalog; one Khmer subtitle font (`NotoSansKhmer-Regular.ttf`); **no Khmer UI locale** | `ls`, `grep` | Khmer is a target language, not yet a first-class UI/typography experience |
| F11 | Working tree has **75 uncommitted changes** on `main` (mostly `.webp` previews, e2e fixtures, `preflight.ts`) | `git status` | Baseline must be cleaned and committed before new work |
| F12 | Khmer LoRA `Mariya987/VoxCPM2-khmer-DDD` named in the old plan — **existence not verified** | — | Treat as unknown until downloaded |
| F13 | CPU **Xeon E5-2676 v3, 12 cores / 24 threads (AVX2)**, **32 GB RAM**; disk C: **23 GB free**, D: **303 GB free** | `Win32_Processor`, `Win32_ComputerSystem`, `Get-PSDrive` | Enough RAM to run VoxCPM2 + Whisper on CPU (slowly). Models and caches **must live on D:**, not C: |

---

## 1. Target product

```
┌──────────────────────── Vishnu Creator (Web + Desktop, Electron) ────────────────────────┐
│ Agent chat · Templates · Projects · Video Translate · Smart Dub · Subtitles · Clips ·   │
│ Covers/Thumbnails · Articles/SEO · Voice Library (new) · Khmer Studio (new)              │
└───────────────┬──────────────────────────────────────────────────────────────────────────┘
                │ REST (existing daemon)
┌───────────────▼───────────────────── Daemon (Node/TS) ──────────────────────────────────┐
│ creator executors · smart-dubbing · subtitle · clip · cover · article · providers       │
│ NEW: DubEngineClient + DubEngineService (spawn local OR connect to remote URL)          │
└───────────────┬──────────────────────────────────────────────────────────────────────────┘
                │ HTTP, same API whether local or remote
┌───────────────▼────────── services/dub-engine (Python, copied in from ZastTranslate) ────┐
│ ASR (WhisperX / faster-whisper) · subtitle stabilization · LLM translate + Khmer rules  │
│ length fitting (CPS) · Demucs vocal split · time-sync · mixer · assembler (ffmpeg)      │
│ TTS backends: VoxCPM2 (clone / design / LoRA) · Edge-TTS · existing cloud providers     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Rule:** one app, one UI. ZastTranslate's Gradio UI is **not** shipped. Its useful logic is copied into `services/dub-engine` and surfaced through the existing Vishnu Creator screens.

### What each source contributes

| Source | Keep / merge | Merge target in Vishnu Creator | Skip |
|---|---|---|---|
| **OpenCreator** (base) | Agent runtime, templates, video translation, smart dubbing, subtitles, clips, covers, articles, desktop packaging | already the base | upstream branding (done) |
| **ZastTranslate** | WhisperX + 8-step subtitle stabilization, ASR corrections dictionary, fitted-CPS length fitting, reformulator (+Khmer rules), Demucs separation, time-sync, audio mixer, video assembler, shorts generator, blog/SEO generator | `services/dub-engine` → existing subtitle / smart-dubbing / clip / article stages | Gradio `app.py`, Pinokio scripts (`*.js` installers), tutorial images, test scripts in repo root |
| **VoxCPM2** | Zero-shot cloning, "ultimate" cloning (ref audio + transcript), voice design from text, 48 kHz output, LoRA fine-tune, streaming | TTS backend + new Voice Library + Khmer voice training workflow | its demo `app.py` / `app_old.py`, docker |
| Optional / later | Qwen-Image thumbnails (~30 GB), YouTube publisher (OAuth) | cover module / publish step | until hardware + policy decided |

---

## 2. Decisions

| ID | Decision | Status | Record |
|---|---|---|---|
| D1 | Where heavy AI runs | **Accepted** — adaptive compute tiers | [ADR-0003](../adr/0003-adaptive-compute-tiers.md) |
| D2 | ZastTranslate license / reuse rights (F9) | **Accepted** — clean re-implementation (Option 3) | [ADR-0005](../adr/0005-zasttranslate-code-reuse.md) |
| D3 | YouTube auto-publish | Open — blocks T6.3 | — |
| D4 | Qwen-Image thumbnails (needs a big GPU) | Open — blocks T6.4 | — |

Earlier architecture decisions: [ADR-0001](../adr/0001-opencreator-fork-as-base.md) (fork base), [ADR-0002](../adr/0002-dub-engine-owned-http-service.md) (engine as owned HTTP service), [ADR-0004](../adr/0004-reference-folder-read-only.md) (reference folder policy).

---

## 2A. Adaptive compute (summary of ADR-0003)

### Principle: "same final result" on every PC
- **The voice always comes from the same engine and model** (VoxCPM2, same checkpoint, same voice reference, fixed seed). Only the speed changes between a strong and a weak PC.
- **AI APIs help only with text steps** (speech-to-text, translation, Khmer polish, quality review), where any good model gives an equivalent text result. The output still passes the same quality checks.
- **Every tier must pass the same quality gates:** timing drift, segment length fit, Khmer spelling check, re-ASR CER of the dub. If a job fails a gate, it is retried or flagged, never shipped silently.
- Expect **equivalent**, not bit-identical, results: CPU and GPU math differ slightly. A fixed seed + same model keeps the voice and timing the same to the ear.

### Tiers (auto-detected; the user can override in Settings)

| Tier | Detected when | ASR | Translation | TTS (VoxCPM2) | Separation (Demucs) | Speed (to be measured) |
|---|---|---|---|---|---|---|
| **T3 High** | NVIDIA GPU ≥ 12 GB VRAM | WhisperX large-v3, GPU | local LLM or API | GPU bf16, optional Nano-vLLM | GPU | fastest |
| **T2 Mid** | NVIDIA GPU 8–12 GB | WhisperX large-v3, GPU (int8) | API (default) or small local LLM | GPU, one model loaded at a time | GPU | fast |
| **T1 Low** | GPU < 8 GB or none, RAM ≥ 16 GB | faster-whisper large-v3 **CPU int8**, or **API assist** | **API** | **CPU** fp32, all cores, sentence-by-sentence | CPU | slow |
| **T0 Minimal** | RAM < 16 GB | API ASR | API | remote engine (another PC / rented GPU), or Edge-TTS with a clear "different voice" label | skip, or API | depends on network |

**This PC (F4, F13) → T1 Low.** The 2 GB GT 1030 isn't used for AI; the 12-core Xeon + 32 GB RAM run VoxCPM2 on CPU.

### How a slow PC still finishes the job
- **Job queue with checkpoints:** every stage (transcribe → translate → fit → each TTS segment → mix → assemble) saves its output to disk. A crash, sleep or reboot resumes from the last finished segment, never from zero.
- **Chunking:** long videos are split into segments; one model is in memory at a time (load → run → unload) so peak RAM stays under ~70% of system RAM.
- **Background mode:** the job runs at low process priority; the UI shows a progress bar, an ETA based on measured speed, and per-segment preview as soon as each one finishes.
- **Overnight / batch queue:** queue several videos; they run one after another.

### Where AI APIs help (using providers already in the app)
| Step | API option | Why it doesn't change the final result |
|---|---|---|
| Speech-to-text | OpenAI / Gemini / other configured ASR | Text output; cleaned by the same subtitle-stabilization step |
| Translation + Khmer polish | Existing LLM providers (OpenRouter, OpenAI, etc.) with the same Khmer rules prompt | Text output; checked by the same length-fit and Khmer checks |
| Quality review | LLM reviews the Khmer subtitle for meaning, tone, spelling | Advisory; flags problems, doesn't replace the voice |
| Voice (TTS) | **Not by default.** Optional "fast preview" with Edge-TTS / cloud TTS, clearly labelled as a different voice | The final render always uses VoxCPM2 so the voice is the same |
| Heavy compute | Optional remote engine URL (rented GPU / another PC) | Same engine code and model, just faster hardware |

API use is **opt-in per step** with a cost estimate shown before the job starts; with no API key, every step falls back to local (slower).

### Settings the user sees
- Detected tier + hardware summary + "Run benchmark" button
- Mode: **Auto** · **Local only (private, slowest)** · **Local + API assist (recommended for low PCs)** · **Remote engine**
- Model storage folder (default on the largest free drive, i.e. `D:\` here)

---

## 3. Working rules

The rules (evidence-only completion, no fake builds, reference folder policy, branching, copied-code review) are in [`AGENTS.md` → Vishnu Creator project rules](../../AGENTS.md#vishnu-creator-project-rules). They apply to people and AI agents alike.

---

## 4. Phases

Full task lists with status and evidence are in [`docs/tasks/`](../tasks/README.md).

| Phase | Title | Tasks | Estimate | Exit gate |
|---|---|---|---|---|
| 0 | [Stabilize the baseline](../tasks/phase-0-baseline.md) | 8 | ≈1 day | typecheck/test/build green, e2e report saved, tree clean, tagged `v0-baseline`. |
| 1 | [Khmer foundation, zero GPU](../tasks/phase-1-khmer-foundation.md) | 8 | ≈2–3 days | recorded Playwright run producing a playable Khmer-dubbed MP4 with correct Khmer subtitles. |
| 2 | [Bring the dub engine into the repo](../tasks/phase-2-dub-engine-service.md) | 15 | ≈3–4 days | `pnpm dub:engine` starts on this PC; `/v1/hardware` reports **T1**; VoxCPM2 synthesizes a Khmer sentence **on CPU** (measured time recorded, not guessed); a job killed mid-TTS resumes from the last segment; `pytest` green. |
| 3 | [Daemon ↔ engine integration](../tasks/phase-3-daemon-integration.md) | 14 | ≈4–5 days | on this PC (T1), from the web UI: EN→KM on a 1-minute video produces an MP4 with a VoxCPM2 voice in **Local only** mode **and** in **Local + API assist** mode. Both pass the same quality gates (T4.7), and the times are recorded. |
| 4 | [Quality upgrades into existing stages](../tasks/phase-4-quality-pipeline.md) | 7 | ≈4 days | same test video scored before/after; measurable drop in timing drift and overlong segments. |
| 5 | [VoxCPM2 voice power](../tasks/phase-5-voxcpm-voices.md) | 9 | ≈5–7 days | Khmer dub with a cloned voice completes on this PC (T1, CPU) and passes the listening test. The same job on a T2/T3 machine (or remote engine) gives an equivalent voice and timing, only faster. VRAM ≤8 GB on T2. |
| 6 | [Extra creator studios](../tasks/phase-6-creator-studios.md) | 5 | ≈4 days | each enabled studio has an e2e test producing a real file. |
| 7 | [Release](../tasks/phase-7-release.md) | 7 | ≈3 days | installer works on a clean Windows PC; Khmer dub end-to-end without manual setup. |
| 8 | [More AI providers (free, paid, cloud, local)](../tasks/phase-8-ai-providers.md) | 10 | ≈2–3 weeks | every provider listed in Settings has a recorded real call (cloud) or local run, and the user guide matches the app. |

---

## 5. Timeline (estimate, one developer + assistant)

| Week | Phases |
|---|---|
| 1 | Phase 0 + Phase 1 (Khmer works with Edge-TTS) |
| 2 | Phase 2 + start Phase 3 |
| 3 | Phase 3 finish + Phase 4 |
| 4 | Phase 5 (cloning/design on CPU; LoRA training needs a GPU machine) |
| 5 | Phase 6 + Phase 7 |

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| No suitable GPU (F4) | **Certain today** | Medium | Adaptive tiers (§2A): T1 runs on CPU with checkpoints; API assist for text steps; remote engine optional |
| CPU TTS too slow to be usable on T1 | Medium | Medium | Measure first (Gate 2); segment previews while it runs; overnight queue; remote engine as speed-up |
| API assist changes the result | Low | Medium | APIs only for text steps; final voice always VoxCPM2; same quality gates on every tier |
| API cost surprise | Medium | Low | Estimate shown + confirmation before each job (3.12) |
| C: drive full (23 GB free, F13) | High | Medium | Model store + job files default to the largest free drive (2.14) |
| Python 3.14 incompatibility (F5) | Certain | Medium | Pinned 3.11 venv via `uv` (2.2) |
| ZastTranslate license unclear (F9) | Medium | High | D2 before copying; re-implement if needed |
| Khmer TTS quality / timing | Medium | Medium | CPS calibration (4.3), segment re-synthesis (4.6), LoRA (5.5) |
| Khmer text rendering bugs in burn-in | Medium | Medium | Parity test (1.6), multiple fonts (1.5) |
| Upstream OpenCreator drift | Medium | Low | Keep `reference/OpenCreator-source` as reference; periodic diff review |
| Voice-clone misuse | Low | High | Consent flag + guard (5.9) |

---

## 7. Definition of Done (whole project)

1. Paste a YouTube URL → pick **Khmer** → get a dubbed MP4 with Khmer subtitles, background music kept — no API key required.
2. Choose voice: Edge-TTS Khmer, cloned original speaker, a saved Voice Library voice, or a designed voice.
3. The app detects the PC's tier and runs on any of them: fast on a strong GPU, slow on CPU, resumable, with the same voice and the same quality gates. API assist and a remote engine are optional speed-ups set in one Settings panel.
4. Khmer UI locale available; Khmer text renders correctly in preview and burn-in.
5. All checks green: `pnpm typecheck`, `pnpm test`, `pytest`, `pnpm e2e`, desktop installer smoke test.
6. All reused code reviewed, rebranded, attributed, and owned in this repo — nothing runs from `reference/`.

---

## 8. Immediate next actions

1. Owner: decide **D2** ([ADR-0005](../adr/0005-zasttranslate-code-reuse.md)).
2. Start [Phase 0](../tasks/phase-0-baseline.md) — it depends on no open decision.
