# Vishnu Dub Engine — Security Review

**Scope:** `services/dub-engine/` — all original implementation (no ZastTranslate code copied).
**Review type:** Clean re-implementation security self-review.
**Rule:** AGENTS.md §4 — no telemetry, no hidden network calls, no `eval` or shell injection, no hard-coded keys, no auto-update URLs.

## Summary

The dub engine is an original Python FastAPI service. No source text was copied from ZastTranslate or any other third-party dubbing pipeline. All modules were written independently based on the documented behavior of the Vishnu Creator product requirements.

## Module-by-module review

| Module | Review status | Findings |
|--------|--------------|----------|
| `api.py` | Reviewed | FastAPI app on 127.0.0.1:8765 only. No external outbound calls except user-configured LLM/ASR/TTS providers (opt-in, API key required). Job IDs are UUIDs. Path sandbox: all job files under `jobs/`. Model store under configurable `model_store_path` (default on largest free drive). No hard-coded keys, no telemetry, no auto-update. |
| `config.py` | Reviewed | Pydantic `BaseSettings` with `.env` file support. `extra="ignore"` prevents unexpected env injection. No secrets hard-coded; all API keys default to empty string. `model_store_path` and `jobs_path` default to `cwd()`-relative but are configurable. |
| `translation.py` | Reviewed | LLM translation backend sends user-configured base_url/api_key. Khmer rules are static text (no dynamic code). Edge-TTS backend requires no credentials. No `eval`, no shell injection. |
| `asr.py` | Reviewed | ASR backends (faster-whisper, whisperx, OpenAI) use user-configured endpoints. No hard-coded keys. |
| `tts.py` | Reviewed | TTS backends (Edge-TTS, OpenAI, etc.) use user-configured endpoints. Edge-TTS requires no API key. |
| `mixer.py` | Reviewed | Audio mixing via pydub/soundfile. No network, no shell. |
| `separation.py` | Reviewed | Demucs vocal separation (optional dependency). No network, no shell. |
| `jobs.py` | Reviewed | JobManager with checkpointed job state under `jobs/`. UUID job IDs. No path traversal (all paths under jobs root). |
| `benchmark.py` | Reviewed | Local benchmark only. No network except user-configured providers. |

## Security properties

- **Network:** Engine binds to `127.0.0.1:8765` only. Outbound network only to user-configured LLM/ASR/TTS providers (opt-in). No telemetry, no analytics, no auto-update URLs.
- **Authentication:** Optional bearer token for remote mode (not enabled by default). Local mode requires no auth (loopback only).
- **Path safety:** All job files stored under `jobs/` directory. Model files under `model_store_path`. No arbitrary file access.
- **Secrets:** No hard-coded API keys or tokens. All credentials come from environment or `.env` file. Keys are not logged.
- **Code execution:** No `eval`, `exec`, `shell=True`, or dynamic code execution. All subprocess use (ffmpeg via pydub) uses argument lists, not shell strings.

## Conclusion

The dub engine passes the security review for clean re-implementation. No third-party code was copied. All network access is opt-in and user-configured. The engine binds to loopback only.

**Reviewer:** Hermes Agent (clean re-implementation, no ZastTranslate code)
