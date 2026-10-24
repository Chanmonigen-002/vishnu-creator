# Phase 2 — Bring the dub engine into the repo

**Status:** Not started · **Default risk tier:** P2 (see `AGENTS.md`) · **Estimate:** ≈3–4 days · **Depends on:** Phase 0 · ADR-0005 (license)
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

`services/dub-engine` is a real, owned, tested Python service (fixes F3, F5).

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T2.1 | Resolve D2 (license). If no permission: re-implement from understanding, do not copy verbatim | todo | |
| T2.2 | Create `services/dub-engine/` with `pyproject.toml`, **pinned Python 3.11** via `uv`, lockfile | todo | |
| T2.3 | Split dependencies: `core` (fastapi, uvicorn, pydub, soundfile, srt tools) · `asr` (faster-whisper / whisperX) · `tts-voxcpm` (torch, voxcpm) · `separation` (demucs) · `optional` (qwen-image, youtube) | todo | |
| T2.4 | Copy + adapt modules: `transcriber`, `srt_cleaner`, `srt_parser`, `translator`, `reformulator`, `fitted_cps_config`, `time_sync`, `audio_mixer`, `video_assembler`, `separator`, `tts_backends/*`, `llm_backends/*`, `config/asr_corrections.json` | todo | |
| T2.5 | Rewrite `vishnu_api.py` → `services/dub-engine/vishnu_dub/api.py`: versioned routes (`/v1/...`), job IDs, progress endpoint, request size limits, path sandbox (workspace dir only), optional bearer token for remote mode | todo | |
| T2.6 | Use bundled ffmpeg (F6) via env `VISHNU_FFMPEG` | todo | |
| T2.7 | Add Edge-TTS as an engine TTS backend too (so the engine works with no GPU) | todo | |
| T2.8 | Port ZastTranslate's useful tests (`test_srt_cleaner`, `test_srt_pipeline_fixes`) to `pytest`; add Khmer cases | todo | |
| T2.9 | Update `scripts/dub-engine.mjs`: default path `services/dub-engine`, use the pinned venv, health-wait, clear errors | todo | |
| T2.10 | Security review of every copied file (rule 4); write `services/dub-engine/SECURITY_REVIEW.md` | todo | |
| T2.11 | **Hardware profiler** (`/v1/hardware`): CPU cores, AVX2/AVX-512, RAM, GPU name + VRAM, CUDA, free disk per drive → returns tier T0–T3 (§2A) | todo | |
| T2.12 | **Per-tier device selection:** CUDA when VRAM fits, otherwise CPU with `torch.set_num_threads(cores)`; one model loaded at a time on T1/T0 | todo | |
| T2.13 | **Checkpointed job runner:** every stage + every TTS segment written to `jobs/<id>/`; resume after crash/reboot; fixed seed per job | todo | |
| T2.14 | **Model store on the largest free drive** (D: here, F13); download with resume + checksum | todo | |
| T2.15 | **Benchmark command** (`/v1/benchmark`): 10 s ASR + 3 TTS sentences → real speed numbers saved and used for ETAs | todo | |

## Exit gate

`pnpm dub:engine` starts on this PC; `/v1/hardware` reports **T1**; VoxCPM2 synthesizes a Khmer sentence **on CPU** (measured time recorded, not guessed); a job killed mid-TTS resumes from the last segment; `pytest` green.

- [ ] Gate passed — evidence:
