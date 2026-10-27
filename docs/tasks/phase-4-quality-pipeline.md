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
| T4.2 | ASR correction dictionary, plus a **Khmer** correction list (common mis-recognitions, names, places) | todo | |
| T4.3 | Fitted-CPS length fitting per language, with a measured Khmer CPS value (calibrate with real dubs) | todo | |
| T4.4 | Demucs vocal/music separation → dub keeps original background music | todo | |
| T4.5 | Time-sync: stretch/compress TTS per segment within limits; flag segments that cannot fit | todo | |
| T4.6 | Subtitle/dub review editor: edit Khmer line → re-synthesize only that segment | todo | |
| T4.7 | A/B quality report per job (timing drift, overlong segments, CER via re-ASR of the dub) | todo | |

## Exit gate

same test video scored before/after; measurable drop in timing drift and overlong segments.

- [ ] Gate passed — evidence:
