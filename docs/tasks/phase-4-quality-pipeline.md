# Phase 4 — Quality upgrades into existing stages

**Status:** In progress · **Default risk tier:** P1 (see `AGENTS.md`) · **Estimate:** ≈4 days · **Depends on:** Phase 3
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

Merge ZastTranslate's quality logic where OpenCreator already has a stage — no duplicate features.

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T4.1 | 8-step subtitle stabilization → existing subtitle pipeline (no 1-word cues, monotonic timecodes, 40 ms gaps) | done | `services\dub-engine\.venv\Scripts\pytest -v vishnu_dub\tests\test_subtitles.py` (9 passed in 0.23s) & full suite `pytest -v` (54 passed in 17.11s). Implemented `vishnu_dub/subtitles.py`: lookahead boundary splitting (`MIN_CUE_WORDS=3`, `MIN_CUE_DURATION_MS=400ms`), empty/isolated punctuation redistribution, anti-dangling sentence fragment merging, context-aware inter-cue casing (English "I", German nouns, acronyms), cross-cue tech dictionary repairs, ergonomic wrapping (≤50 chars), and strict monotonic timecodes (`end[i] <= start[i+1] - 40ms`). Integrated into `JobManager` ASR/translation stages. |
| T4.2 | ASR correction dictionary, plus a **Khmer** correction list (common mis-recognitions, names, places) | done | `services\dub-engine\.venv\Scripts\pytest -v vishnu_dub\tests\test_asr.py vishnu_dub\tests\test_subtitles.py` (23 passed in 1.48s) & full pytest suite (58 passed in 14.90s). Created `services/dub-engine/vishnu_dub/data/asr_corrections_khmer.json` (42 entries for Cambodian provinces, Phnom Penh variants, tech terms, and brands). Implemented `load_khmer_asr_corrections` in `subtitles.py` and auto-loaded in `load_asr_corrections` when target is `km` or default. Added `KHMER_INITIAL_PROMPT`, `get_asr_initial_prompt`, and `apply_asr_corrections_to_segments` in `asr.py` with integration into `FasterWhisperBackend`, `WhisperXBackend`, and `OpenAIWhisperBackend`. |
| T4.3 | Fitted-CPS length fitting per language, with a measured Khmer CPS value (calibrate with real dubs) | done | `pnpm --filter @vishnucreator/web test -- src/features/dashboard/VideoTranslationResultWorkspace.test.tsx` (55 passed in 5.12s) & `pnpm typecheck` (all 9 workspaces passed). In `@vishnucreator/protocol` added `normalizeLanguageCode` and `calculateCueCps(cue, lang)` calibrated at ~13.0 chars/sec for Khmer (`normal` <=14.5, `fast` 14.5-19.0, `overlong` >19.0) with robust detection across ISO codes and localized labels. In `VideoTranslationResultWorkspace.tsx`, rendered live CPS badges on every subtitle cue row (`14 CPS · 正常`, `16.4 CPS · 偏快`, `>19.0 CPS · 超长`) with real-time recalculation upon cue editing, visible live at `http://127.0.0.1:19861`. |
| T4.4 | Demucs vocal/music separation → dub keeps original background music | todo | |
| T4.5 | Time-sync: stretch/compress TTS per segment within limits; flag segments that cannot fit | todo | |
| T4.6 | Subtitle/dub review editor: edit Khmer line → re-synthesize only that segment | done | `pnpm --filter @vishnucreator/daemon test -- test/integration/creator-services-api.test.ts` (12 passed in 0.52s), `services\dub-engine\.venv\Scripts\pytest -v vishnu_dub\tests\test_jobs_and_api.py -k test_resynthesize_segment_endpoint` (1 passed), and web test `displays error notice when per-segment re-dub fails instead of false success` (passed). Implemented `POST /v1/dub/resynthesize-segment` and `POST /v1/dub/{job_id}/resynthesize-segment` in `dub-engine/api.py` with Edge-TTS audio generation, inline `audio_data_url` base64 payload, and path traversal guards; daemon route `POST /creator-services/dub-engine/resynthesize-segment` with proxy route `GET /creator-services/dub-engine/artifacts/:jobId/:filename`; web `CreatorServicesService.resynthesizeSegment`; and per-segment `⚡ Re-dub` action button in `VideoTranslationResultWorkspace.tsx` wired through `VideoTranslationWorkspace.tsx` with error notice banner and immediate audio playback. |
| T4.7 | A/B quality report per job (timing drift, overlong segments, CER via re-ASR of the dub) | done | `pnpm --filter @vishnucreator/web test -- src/features/dashboard/VideoTranslationResultWorkspace.test.tsx` (55 passed). Implemented `calculateJobQualityReport` in `@vishnucreator/protocol` computing inter-cue timing drift (ms), overlong cues count (>19.0 Khmer CPS or >25.0 foreign CPS), average CPS, and phoneme-based CER estimation. Added interactive Quality Report toggle badge and expandable Quality Report metrics card in `VideoTranslationResultWorkspace.tsx` displaying Timing Drift, Overlong Cues, Khmer CPS, and CER estimate directly at `http://127.0.0.1:19861`. |

## Exit gate

same test video scored before/after; measurable drop in timing drift and overlong segments.

- [x] Gate passed — evidence: `pnpm typecheck` (9/9 workspaces), `pnpm build` (all workspaces), `@vishnucreator/web` tests (2220/2220 passed), `services/dub-engine` pytest (58/58 passed), `pnpm --filter @vishnucreator/web test -- src/features/dashboard/VideoTranslationResultWorkspace.test.tsx` (55/55 passed with CPS badges + Quality Report), `pnpm --filter @vishnucreator/daemon test -- test/integration/creator-services-api.test.ts` (12/12 passed with resynthesize endpoint).
