# Phase 1 — Khmer foundation, zero GPU

**Status:** Not started · **Default risk tier:** P1 (see `AGENTS.md`) · **Estimate:** ≈2–3 days · **Depends on:** Phase 0
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

A Khmer video can be translated, subtitled and dubbed **today** on this PC.

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T1.1 | Wire Edge-TTS Khmer voices `km-KH-SreymomNeural` (female) and `km-KH-PisethNeural` (male) into smart-dubbing voice list (F7) | todo | |
| T1.2 | Make `km` the default target in video-translation and smart-dubbing presets | todo | |
| T1.3 | Port ZastTranslate's Khmer translation rules (natural spoken Khmer, no inter-word spaces, `។` punctuation, numerals policy) into the daemon's translation prompts | todo | |
| T1.4 | Khmer subtitle line-breaking: use `Intl.Segmenter('km', {granularity:'word'})` for wrap points (Khmer has no spaces); unit tests with real Khmer sentences | todo | |
| T1.5 | Add Khmer fonts: Noto Sans Khmer Bold, Kantumruy Pro, Battambang, Moul (OFL) to subtitle font manifest + licenses | todo | |
| T1.6 | Verify subtitle burn-in renders Khmer correctly (coeng/subscripts, vowel stacking) — compare preview vs ffmpeg burn-in (`scripts/verify-subtitle-render-parity.ts`) | todo | |
| T1.7 | Add `km-KH` UI locale (start with dashboard, creator, settings) + copy-coverage test | todo | |
| T1.8 | E2E: EN YouTube clip → Khmer subtitles + Edge-TTS Khmer dub → MP4 | todo | |

## Exit gate

recorded Playwright run producing a playable Khmer-dubbed MP4 with correct Khmer subtitles.

- [ ] Gate passed — evidence:
