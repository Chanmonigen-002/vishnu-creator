# Phase 6 — Extra creator studios

**Status:** Not started · **Default risk tier:** P1 (see `AGENTS.md`) · **Estimate:** ≈4 days · **Depends on:** Phase 3
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal



## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T6.1 | Shorts generator → merge into existing `clip` module (viral moment pick, 9:16, karaoke Khmer captions) | done | Branch `phase-6/shorts-generator`. Clean re-implementation of `File clone Resource/ZastTranslate/modules/shorts_generator.py` behaviour (ADR-0005 option 2, read-only reference). Implementation: new `apps/daemon/src/creator/clip/captions.ts` (independent karaoke captions: Khmer cluster chunking incl. coeng stacks + ZWSP, `selectCuesInRange`, ASS `Karaoke` style with Noto Sans Khmer); `auto-clip` template v3 (defaults `targetLanguage: km`, `focus: viral`, `aspectRatio: 9:16`, `captionStyle: karaoke`, render stage consumes `target_subtitle`; v1/v2 preserved verbatim, all registered); clip executor renders 9:16 as stacked blur (blurred bg fills 1080×1920, source frame centered) instead of crop and burns captions via ffmpeg `ass=fontsdir` (packaged runtime fonts). `pnpm --filter @vishnucreator/daemon exec vitest run test/unit test/integration` → only failures are 8 pre-existing Windows/env flakes in unrelated suites (api EEXIST mkdir race, gateway EBUSY sqlite, codex-native image readiness, gateway-runtime-protocol PowerShell-vs-sh, project-api cwd regex) — verified identical with the T6.1 diff stashed; all 36 clip/caption/registry unit tests + real-render integration (`creator-clip-shorts-render`: real packaged ffmpeg renders 1080×1920 h264/aac ≈6s MP4 with burned `\k` Khmer karaoke) pass. `pnpm typecheck` exit 0 (all workspaces); `pnpm build` exit 0. Web UI intentionally unchanged: karaoke captions are on by default (`captionStyle: none` available through job state). |
| T6.2 | Blog/SEO generator → merge into existing `article` module (Khmer SEO, keyframe extraction) | doing | Branch `phase-6/blog-seo`. Clean re-implementation of `File clone Resource/ZastTranslate/modules/blog_generator.py` + `seo_assistant.py` behaviour (ADR-0005 option 2, read-only reference). |
| T6.3 | (D3) YouTube publish step with OAuth, title/description/tags in Khmer + English | todo | |
| T6.4 | (D4) Thumbnails: extend existing `cover` module; Qwen-Image only on GPU worker | todo | |
| T6.5 | Khmer Studio dashboard card: one-click "Translate & dub to Khmer" flow | todo | |

## Exit gate

each enabled studio has an e2e test producing a real file.

- [ ] Gate passed — evidence:
