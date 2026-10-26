# Phase 2 — Bring the dub engine into the repo

**Status:** doing · **Default risk tier:** P2 (see `AGENTS.md`) · **Estimate:** ≈3–4 days · **Depends on:** Phase 0 (ADR-0005 resolved via clean re-implementation — no ZastTranslate code copied)
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

`services/dub-engine` is a real, owned, tested Python service (fixes F3, F5).

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T2.1 | Resolve D2 (license). If no permission: re-implement from understanding, do not copy verbatim | done | Clean re-implementation decision: no ZastTranslate code copied. All `services/dub-engine` modules are original implementations (`SECURITY_REVIEW.md`). |
| T2.2 | Create `services/dub-engine/` with `pyproject.toml`, **pinned Python 3.11** via `uv`, lockfile | doing | `services/dub-engine/` has `pyproject.toml` (`requires-python = ">=3.11,<3.13"`), `uv.lock`, and `.venv` (currently Python 3.12 with core + dev dependencies installed; optional heavy ML groups `asr`, `tts-voxcpm`, `separation` are not yet installed in `.venv`). |
| T2.3 | Split dependencies: `core` (fastapi, uvicorn, pydub, soundfile, srt tools) · `asr` (faster-whisper / whisperX) · `tts-voxcpm` (torch, torchaudio) · `separation` (demucs) · `optional` (qwen-image, youtube) | done | `services/dub-engine/pyproject.toml` defines `core` dependencies plus optional groups `asr`, `tts-voxcpm`, `separation`, `optional`, and `dev`. |
| T2.4 | Copy + adapt modules: `transcriber`, `srt_cleaner`, `srt_parser`, `translator`, `reformulator`, `fitted_cps_config`, `time_sync`, `audio_mixer`, `video_assembler`, `separator`, `tts_backends/*`, `llm_backends/*`, `config/asr_corrections.json` | done | Original clean-room modules in `services/dub-engine/vishnu_dub/`: `asr.py`, `translation.py`, `tts.py`, `mixer.py`, `separation.py`, `jobs.py`, `config.py`, `benchmark.py`, `api.py`. Removed all fake `testsrc`/`sine` placeholders in `jobs.py` and fake `[km]` translation markers in `translation.py`; wired and verified the real ASR → Translation → TTS → Separation → AudioMixer → VideoAssembler pipeline. |
| T2.5 | Rewrite `vishnu_api.py` → `services/dub-engine/vishnu_dub/api.py`: versioned routes (`/v1/...`), job IDs, progress endpoint, request size limits, path sandbox (workspace dir only), optional bearer token for remote mode | done | `api.py` implements `/v1/hardware`, `/v1/dub`, `/v1/dub/{job_id}`, `/v1/dub/{job_id}/progress` (SSE `StreamingResponse`), `/v1/dub/{job_id}/download`, `/v1/benchmark`, and `/health`. Verified by `test_jobs_and_api.py`. |
| T2.6 | Use bundled ffmpeg (F6) via env `VISHNU_FFMPEG` | done | `config.py` auto-detects `.runtime/vendor/creator-runtime/win32-x64/{ffmpeg,ffprobe,yt-dlp}.exe` when `VISHNU_DUB_FFMPEG_PATH` is unset; `mixer.py`, `jobs.py`, `tts.py`, `separation.py`, and `benchmark.py` use the resolved binaries. |
| T2.7 | Add Edge-TTS as an engine TTS backend too (so the engine works with no GPU) | done | `tts.py` provides `EdgeTTSBackend` (with `km-KH-SreymomNeural` and `km-KH-PisethNeural`, automatic `.venv` binary discovery, and `resolve_ffprobe_path()`). Verified with real Khmer audio synthesis in `test_jobs_and_api.py`. |
| T2.8 | Port ZastTranslate's useful tests (`test_srt_cleaner`, `test_srt_pipeline_fixes`) to `pytest`; add Khmer cases | done | `services\dub-engine\.venv\Scripts\pytest.exe services\dub-engine\vishnu_dub\tests -v` → **33 passed in 13.04s** (`test_asr.py`, `test_config.py`, `test_translation.py`, `test_jobs_and_api.py`). |
| T2.9 | Update `scripts/dub-engine.mjs`: default path `services/dub-engine`, use the pinned venv, health-wait, clear errors | done | `scripts/dub-engine.mjs` spawns `services/dub-engine/.venv/Scripts/python.exe -m vishnu_dub.api`, binds `127.0.0.1`, and polls `/health` until ready. |
| T2.10 | Security review of every copied file (rule 4); write `services/dub-engine/SECURITY_REVIEW.md` | done | `services/dub-engine/SECURITY_REVIEW.md` documents the clean-room implementation, localhost binding, and absence of telemetry/hardcoded keys. |
| T2.11 | **Hardware profiler** (`/v1/hardware`): CPU cores, AVX2/AVX-512, RAM, GPU name + VRAM, CUDA, free disk per drive → returns tier T0–T3 (§2A) | done | `api.py` `detect_hardware()` returns CPU cores/threads, AVX2/AVX-512, RAM, GPU/VRAM/CUDA (via `torch.cuda` and `nvidia-smi` fallback), per-drive free space, `tier` (`T1` when GPU < 8 GB and RAM ≥ 16 GB), `recommended_tts`, and `recommended_whisper`. Verified on this PC (`T1` Low) and in `test_jobs_and_api.py`. |
| T2.12 | **Per-tier device selection:** CUDA when VRAM fits, otherwise CPU with `torch.set_num_threads(cores)`; one model loaded at a time on T1/T0 | doing | Tier classification (`T0`–`T3`) and CPU fallback selection are implemented; `torch.set_num_threads(cores)` runtime enforcement and single-model eviction require `torch` installation in `.venv`. |
| T2.13 | **Checkpointed job runner:** every stage + every TTS segment written to `jobs/<id>/`; resume after crash/reboot; fixed seed per job | done | `jobs.py` persists `checkpoint.json`, `segments.json`, `source.srt`, `km_segments.json`, `km.srt`, `translated.srt`, and per-segment TTS files (`tts_segments/seg_XXXX.mp3`) under `jobs/<id>/` and resumes from completed stages/segments on restart. Verified end-to-end in `test_jobs_and_api.py::test_job_manager_end_to_end_pipeline_and_checkpoint_resume`. |
| T2.14 | **Model store on the largest free drive** (D: here, F13); download with resume + checksum | doing | `detect_hardware()` reports free disk per partition and `config.py` / `asr.py` configure `model_store_path` (`download_root` for `faster-whisper`); model download manager with HTTP resume + SHA-256 checksum verification is not yet implemented. |
| T2.15 | **Benchmark command** (`/v1/benchmark`): 10 s ASR + 3 TTS sentences → real speed numbers saved and used for ETAs | done | Removed fake `asyncio.sleep(0.1)` in `jobs.py` `run_benchmark()`; `/v1/benchmark` now runs `benchmark.py` (`run_benchmark`) measuring real ffmpeg audio generation, ASR, translation, and multi-sentence Khmer TTS synthesis, saving `benchmark_results.json`. Verified in `test_jobs_and_api.py::test_edge_tts_synthesizes_real_khmer_audio_and_benchmark_persists_report`. |

## Exit gate

`pnpm dub:engine` starts on this PC; `/v1/hardware` reports **T1**; VoxCPM2 synthesizes a Khmer sentence **on CPU** (measured time recorded, not guessed); a job killed mid-TTS resumes from the last segment; `pytest` green.

- [ ] Gate passed — evidence: `pytest` green (33/33 in 13.04s) with end-to-end pipeline, checkpoint resume, real Edge-TTS Khmer synthesis, and benchmark persistence verified; VoxCPM2 CPU synthesis pending installation of `tts-voxcpm` (`torch`/`voxcpm`) in `services/dub-engine/.venv`.
