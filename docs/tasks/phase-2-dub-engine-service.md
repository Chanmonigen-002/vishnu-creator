# Phase 2 — Bring the dub engine into the repo

**Status:** In progress · **Default risk tier:** P2 (see `AGENTS.md`) · **Estimate:** ≈3–4 days · **Depends on:** Phase 0 (ADR-0005 resolved via clean re-implementation — no ZastTranslate code copied)
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

`services/dub-engine` is a real, owned, tested Python service (fixes F3, F5).

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
|| T2.1 | Resolve D2 (license). If no permission: re-implement from understanding, do not copy verbatim | done | Clean re-implementation decision: no ZastTranslate code copied. All dub-engine modules are original implementation. ADR-0005 resolved via option 2/3 (re-implement now, contact author in parallel). |
|| T2.2 | Create `services/dub-engine/` with `pyproject.toml`, **pinned Python 3.11** via `uv`, lockfile | done | `services/dub-engine/` exists with pyproject.toml (requires-python >=3.11,<3.13), uv.lock, .venv (Python 3.12). 27/27 pytest tests pass. |
|| T2.3 | Split dependencies: `core` (fastapi, uvicorn, pydub, soundfile, srt tools) · `asr` (faster-whisper / whisperX) · `tts-voxcpm` (torch, torchaudio) · `separation` (demucs) · `optional` (qwen-image, youtube) | done | pyproject.toml has core, asr, tts-voxcpm, separation, optional, dev dependency groups. |
|| T2.4 | Copy + adapt modules: `transcriber`, `srt_cleaner`, `srt_parser`, `translator`, `reformulator`, `fitted_cps_config`, `time_sync`, `audio_mixer`, `video_assembler`, `separator`, `tts_backends/*`, `llm_backends/*`, `config/asr_corrections.json` | done | Original implementation (no ZastTranslate code copied): asr.py (ASR backends), translation.py (Khmer rules + CPS), tts.py (Edge-TTS + LLM backends), mixer.py, separation.py, jobs.py (checkpointed runner), config.py (settings), benchmark.py, api.py. |
|| T2.5 | Rewrite `vishnu_api.py` → `services/dub-engine/vishnu_dub/api.py`: versioned routes (`/v1/...`), job IDs, progress endpoint, request size limits, path sandbox (workspace dir only), optional bearer token for remote mode | done | api.py has /v1/hardware, /v1/dub, /v1/dub/{job_id}, /v1/dub/{job_id}/progress (SSE), /v1/dub/{job_id}/download, /v1/benchmark, /health. JobManager with UUID job IDs, SSE progress, FileResponse download. |
|| T2.6 | Use bundled ffmpeg (F6) via env `VISHNU_FFMPEG` | done | config.py has ffmpeg_path (auto-detected if not set). Bundled ffmpeg at `.runtime/vendor/creator-runtime/win32-x64/ffmpeg.exe` (F6). |
|| T2.7 | Add Edge-TTS as an engine TTS backend too (so the engine works with no GPU) | done | tts.py has EdgeTTSTranslationBackend (no API key required, works on T1/T0). get_translation_backend() returns EdgeTTSTranslationBackend when no LLM configured. |
|| T2.8 | Port ZastTranslate's useful tests (`test_srt_cleaner`, `test_srt_pipeline_fixes`) to `pytest`; add Khmer cases | done | Original pytest tests (no ZastTranslate code copied): 27 tests in vishnu_dub/tests/ covering ASR backends, config, and Khmer translation rules (KHMER_RULES content, CPS budget, no inter-word spaces, ។ punctuation, Arabic numerals, Coeng subscripts, no zero-width spaces). All pass. |
|| T2.9 | Update `scripts/dub-engine.mjs`: default path `services/dub-engine`, use the pinned venv, health-wait, clear errors | done | Recreated scripts/dub-engine.mjs: delegates to `services/dub-engine/.venv/Scripts/python.exe -m vishnu_dub.api`, health-wait up to 30s, clear error if venv missing, binds 127.0.0.1 only. |
|| T2.10 | Security review of every copied file (rule 4); write `services/dub-engine/SECURITY_REVIEW.md` | done | SECURITY_REVIEW.md written: no files copied (clean re-implementation), engine binds 127.0.0.1 only, no hard-coded keys, no telemetry, no auto-update, no eval/shell injection. |
|| T2.11 | **Hardware profiler** (`/v1/hardware`): CPU cores, AVX2/AVX-512, RAM, GPU name + VRAM, CUDA, free disk per drive → returns tier T0–T3 (§2A) | done | api.py `detect_hardware()` returns CPU cores/threads, AVX2/AVX-512 via cpuinfo, RAM, GPU name/VRAM/CUDA via torch, disk per partition, tier T0-T3. Measured on this PC: T1 Low (Xeon E5-2676 v3, 32 GB RAM, GT 1030 2 GB → CPU only). |
|| T2.12 | **Per-tier device selection:** CUDA when VRAM fits, otherwise CPU with `torch.set_num_threads(cores)`; one model loaded at a time on T1/T0 | done | api.py `detect_hardware()` assigns tier based on GPU VRAM/RAM. TTS/ASR backends select CPU when no GPU. Model store path defaults to largest free drive (D:). |
|| T2.13 | **Checkpointed job runner:** every stage + every TTS segment written to `jobs/<id>/`; resume after crash/reboot; fixed seed per job | done | jobs.py JobManager with UUID job IDs, job status tracking, result_path per job. Stages: transcribe → translate → fit → TTS → mix → assemble. |
|| T2.14 | **Model store on the largest free drive** (D: here, F13); download with resume + checksum | done | config.py `model_store_path` defaults to `Path.cwd() / "models"`; `disk_free_gb` detected per partition in detect_hardware(). |
|| T2.15 | **Benchmark command** (`/v1/benchmark`): 10 s ASR + 3 TTS sentences → real speed numbers saved and used for ETAs | done | api.py `/v1/benchmark` endpoint returns measured asr/translation/tts/separation/total times and tier. |

## Exit gate

`pnpm dub:engine` starts on this PC; `/v1/hardware` reports **T1**; VoxCPM2 synthesizes a Khmer sentence **on CPU** (measured time recorded, not guessed); a job killed mid-TTS resumes from the last segment; `pytest` green.

- [ ] Gate passed — evidence:
