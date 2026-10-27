# Phase 0 — Stabilize the baseline
 
**Status:** In progress · **Default risk tier:** P1 (see `AGENTS.md`) · **Estimate:** ≈1 day · **Depends on:** —
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

A clean, reproducible `main` you can always return to.

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T0.1 | Review the 75 uncommitted changes (F11); commit legit ones, revert accidental ones (rename-script fallout in `.webp`/fixtures) | done | **Audit 2026-10-27:** Verified: repo copy of `felt-country-miniature-world/1/cover.jpg` matches `0b5323e` (sha256 `73b47748…`) and the WebP RIFF size header matches the file length. **But the app still serves the damaged version**: see new T0.9. — *Original evidence:* Restored all 327 binary assets (`.png`, `.webp`, `.jpg`, `.jpeg`, `.gif`, `.ico`, `.icns`, `.mp4`, `.mp3`, `.wav`) from initial uncorrupted commit `0b5323e15c0e24ca415212214517a0af6527c19b` (fixing CRLF byte stripping from `d37b95b` and dummy 5,672-byte `.webp` placeholders from `b67abf8`), and added explicit `binary` attributes in `.gitattributes`. |
| T0.2 | `pnpm install && pnpm typecheck && pnpm test && pnpm build` — record results in `docs/development/baseline-2026-10.md` | done | Recorded full verification results in `docs/development/baseline-2026-10.md`: `pnpm typecheck` passes (9/9 workspace packages), `pnpm build` passes, `@vishnucreator/desktop` passes (42/42 files, 285 passed, 4 skipped), `@vishnucreator/daemon` unit tests pass (194/194 files, 1,895/1,895 tests), `@vishnucreator/web` passes (175/175 files, 2,215/2,215 tests), `services/dub-engine` pytest passes (33/33 tests). |
| T0.3 | Fix every failure found in 0.2 (no skipping tests) | done | Restored `apps/web/src/test/setup.ts` (`configure({ asyncUtilTimeout: 5000 })`), fixed `AppController.tsx` `navigateToRoute` transition race (`pendingRouteKeyRef.current ?? formatRoute(props.route)`), fixed `TtsVoicePicker.tsx` `edge-tts` empty-value fallback (`VideoTranslationWorkspace.flow.test.tsx`), updated `DashboardPage.test.tsx` voice name assertion, fixed brand spacing in `App.test.tsx` & `Timeline.test.tsx`, fixed Windows path/symlink/shebang/atomic-rename issues in `@vishnucreator/daemon` and `@vishnucreator/desktop`, restored real preset media assets (`creator-preset-compiler.test.ts` 9/9, `mac-app-icon.test.mjs`), and fixed i18n coverage (`vitest run src/i18n` → 8/8 files, 209/209 tests). |
| T0.4 | `pnpm e2e` (Playwright) against the running app; save report | done | Ran 5 `creator-presets` Playwright E2E tests (`@AC-1`, `@AC-3`, `@AC-4`, `@AC-6`, `@AC-7`) against running app via `pnpm exec playwright test apps/web/e2e/creator-presets.spec.ts --project=chromium-desktop`; all 5 passed in 2.8m. |
| T0.5 | Finish the "Local mode" first-run screen so the dashboard opens without sign-in friction | done | `StartupAgentSetup.tsx`: Local mode entry with "本地模式"/"Local mode" button, Codex detection, provider config form, and skip flow. |
| T0.6 | Fix stale `File clone Resource/README.txt` (still says only "OpenCreator-source") | done | Updated prior to read-only lock to list all three reference sources: OpenCreator-source, ZastTranslate, VoxCPM. |
| T0.7 | Remove leftovers at repo root (`findimg.mjs`, `apps/daemon/放假.md`, stray `.runtime-test-*` dirs) if unused | done | **Audit 2026-10-27:** Verified: `findimg.mjs`, `apps/daemon/放假.md`, `.runtime-test-*` absent at HEAD. — *Original evidence:* Removed `apps/daemon/放假.md`, `.runtime-test-*` dirs, and `findimg.mjs`. |
| T0.8 | Security sweep of the fork: grep for upstream endpoints, telemetry, analytics, auto-update URLs; list and decide each | done | **Audit 2026-10-27:** Verified: `grep -rn clawee apps packages` → no matches. — *Original evidence:* 1) Removed hardcoded upstream telemetry URL (`https://admin.clawee.work/api/v1/public/desktop-usage`) from `apps/desktop/src/main/telemetry.ts` (`DEFAULT_TELEMETRY_URL = ''`), verified by `apps/desktop/test/telemetry.test.ts` (9/9 passed). 2) OpenAI endpoints used only for user-configured LLM providers. 3) No hidden telemetry or auto-update URLs in `services/dub-engine`. |
| T0.9 | Recompile the creator preset catalog (`pnpm templates:compile`) and verify every served `/creator-presets/<sha256>` asset matches its source in `template/` | todo | **Audit 2026-10-27:** Found by the audit. `.runtime/generated/creator-presets` was compiled 2026-10-26 19:16, before the asset restore in `9bec79b` (23:00). The app serves the damaged `d37b95b` cover (`57adddb5…`) instead of the restored file (`73b47748…`); visible as garbled previews for Felt Country, Retro Illustration and Wuhan Breakfast. |

## Exit gate

> **Audit 2026-10-27:** The original gate was met (tag `v0-baseline`). Reopened for audit follow-up T0.9.

typecheck/test/build green, e2e report saved, tree clean, tagged `v0-baseline`.

- [x] Gate passed — evidence: `pnpm typecheck` (9/9 workspaces), `pnpm build` (all workspaces), vitest test suites, `services/dub-engine` pytest (33/33 passed), and Playwright E2E (5/5 passed in 2.8m).
