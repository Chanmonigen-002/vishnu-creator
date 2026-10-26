# Phase 1 — Khmer foundation, zero GPU

**Status:** done · **Default risk tier:** P1 (see `AGENTS.md`) · **Estimate:** ≈2–3 days · **Depends on:** Phase 0
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

A Khmer video can be translated, subtitled and dubbed **today** on this PC.

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T1.1 | Wire Edge-TTS Khmer voices `km-KH-SreymomNeural` (female) and `km-KH-PisethNeural` (male) into smart-dubbing voice list (F7) | done | `stickmanEdgeTtsVoiceForLanguage()` returns `km-KH-SreymomNeural` for Khmer; `smart-dubbing` template `ttsProvider` enum includes `'edge-tts'`; `services/dub-engine/vishnu_dub/tts.py` maps `km_female` → `km-KH-SreymomNeural` and `km_male` → `km-KH-PisethNeural`. |
| T1.2 | Make `km` the default target in video-translation and smart-dubbing presets | done | `video-translation` template `targetLanguage` default set to `'km'`; `services/dub-engine/vishnu_dub/config.py` `default_target_lang` set to `'km'`. |
| T1.3 | Port ZastTranslate's Khmer translation rules (natural spoken Khmer, no inter-word spaces, `។` punctuation, numerals policy) into the daemon's translation prompts | done | Clean re-implementation in `apps/daemon/src/creator/vishnu/khmer-translation-rules.ts` and `services/dub-engine/vishnu_dub/translation.py` (`normalize_khmer_translation()` strips U+200B and converts Khmer digits `០-៩` to ASCII `0-9`). Verified by `pnpm --filter @vishnucreator/daemon exec vitest run test/unit/khmer-translation-rules.test.ts` (8/8 passed) and `services\dub-engine\.venv\Scripts\pytest.exe services\dub-engine\vishnu_dub\tests -v` (33/33 passed). |
| T1.4 | Khmer subtitle line-breaking: use `Intl.Segmenter('km', {granularity:'word'})` for wrap points (Khmer has no spaces); unit tests with real Khmer sentences | done | Implemented `segmentKhmerWords()` and `wrapKhmerSubtitleText()` using `Intl.Segmenter('km', { granularity: 'word' })` in `apps/web/src/features/dashboard/subtitle-editing.ts` and wired into `fitCueLine()`. Verified by `pnpm --filter @vishnucreator/web exec vitest run src/features/dashboard/subtitle-editing.test.ts` (7/7 passed). |
| T1.5 | Add Khmer fonts: Noto Sans Khmer Bold, Kantumruy Pro, Battambang, Moul (OFL) to subtitle font manifest + licenses | done | Added OFL Khmer subtitle fallback fonts: `Noto Sans Khmer Bold`, `Kantumruy Pro`, `Battambang`, and `Moul` to `assets/creator-subtitle-fonts/desktop/` (.ttf), `assets/creator-subtitle-fonts/web/` (.woff2), and `assets/creator-subtitle-fonts/licenses/` (OFL-1.1 licenses). Updated `manifest.json` (27 fallback fonts, 30 licenses) and `fallback-fonts.css`. Verified via `pnpm --filter @vishnucreator/desktop exec vitest run test/creator-subtitle-fonts.test.mjs` (2/2 passed). |
| T1.6 | Verify subtitle burn-in renders Khmer correctly (coeng/subscripts, vowel stacking) — compare preview vs ffmpeg burn-in (`scripts/verify-subtitle-render-parity.ts`) | done | Rebuilt 5 desktop TTFs with valid OpenType GPOS 1.0 tables resolving `sfnt: unsupported GPOS table` error. Fixed Windows ffmpeg filtergraph path escaping in `scripts/verify-subtitle-render-parity.ts`. Verified visual parity across all 11 test cases including Khmer (`meanChannelError: 0.88`, zero bounding box drift `[320, 397, 639, 479]`) via `npx tsx scripts/verify-subtitle-render-parity.ts`. |
| T1.7 | Add `km-KH` UI locale (start with dashboard, creator, settings) + copy-coverage test | done | `apps/web/src/i18n/locales/km-KH.json` populated with natural spoken Khmer translations (no U+200B, no inter-word spaces, `។` punctuation) and all 16 Dub Engine settings keys added across all locales. Verified by `pnpm --filter @vishnucreator/web exec vitest run src/i18n` (8/8 test files, 209/209 tests passed). |
| T1.8 | E2E: EN YouTube clip → Khmer subtitles + Edge-TTS Khmer dub → MP4 | done | Created Playwright E2E test `apps/web/e2e/khmer-dubbing-e2e.spec.ts` taking an English video clip, running the real ffmpeg/Edge-TTS (`km-KH-SreymomNeural`) pipeline, and producing playable `output.mp4` with verified `h264` video and `aac` audio. Screenshot report saved to `docs/test-reports/khmer-dubbing-e2e.png`. Verified via `pnpm exec playwright test apps/web/e2e/khmer-dubbing-e2e.spec.ts --project=chromium-desktop` (1/1 passed in 31.0s). |

## Exit gate

recorded Playwright run producing a playable Khmer-dubbed MP4 with correct Khmer subtitles.

- [x] Gate passed — evidence: `pnpm exec playwright test apps/web/e2e/khmer-dubbing-e2e.spec.ts --project=chromium-desktop` passed (1/1 passed in 31.0s). Real English video clip dubbed to Khmer with Edge-TTS (`km-KH-SreymomNeural`) and rendered with Khmer subtitles (`សួស្តី នេះជាការសាកល្បងបញ្ចូលសំឡេងជាភាសាខ្មែរ។`); output MP4 verified with ffprobe (`h264` 640x360 video, `aac` 24000Hz audio, duration 5.54s); report screenshot saved to `docs/test-reports/khmer-dubbing-e2e.png`.
