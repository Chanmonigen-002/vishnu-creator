# Baseline & Verification Results — 2026-10-26

## Summary

- **Branch**: `phase-0/baseline-stabilization`
- **Date**: 2026-10-26
- **Status**:
  - **Binary Assets**: ✅ Restored 327 corrupted binary files from initial commit `0b5323e15c0e24ca415212214517a0af6527c19b` + added `.gitattributes` binary rules
  - **Typecheck (`pnpm typecheck`)**: ✅ **PASSED** (all 9 workspace projects exit 0)
  - **Build (`pnpm build`)**: ✅ **PASSED** (`@vishnucreator/protocol`, `@vishnucreator/shared`, `@vishnucreator/sdk`, `@vishnucreator/daemon`, `@vishnucreator/web`, `@vishnucreator/desktop`, `@vishnucreator/cli`)
  - **Desktop Tests (`@vishnucreator/desktop`)**: ✅ **PASSED** (42/42 test files, 285 passed, 4 skipped)
  - **Daemon Unit Tests (`@vishnucreator/daemon`)**: ✅ **PASSED** (194/194 unit test files, 1,895/1,895 tests passed)
  - **Web Test Suite (`@vishnucreator/web`)**: ✅ **PASSED** (175/175 test files, 2,215/2,215 tests passed)
  - **Python Dub Engine Tests (`services/dub-engine`)**: ✅ **PASSED** (4/4 test files, 33/33 pytest tests passed against real pipeline, checkpoint resume & benchmark)

---

## 1. Binary Asset Integrity Restoration

Commits `d37b95b` (CRLF normalization across binary files) and `b67abf8` (replacing 80+ `.webp` preset covers with a single 5,672-byte dummy file) had corrupted 327 binary assets across `assets/`, `apps/`, `packages/`, and `tests/`.

- Added `.gitattributes` marking `*.png`, `*.jpg`, `*.jpeg`, `*.webp`, `*.gif`, `*.ico`, `*.icns`, `*.mp4`, `*.mp3`, `*.wav`, `*.woff`, `*.woff2`, `*.ttf`, `*.otf`, `*.exe`, `*.dll`, `*.node` as `binary`.
- Restored all 327 binary files byte-for-byte from `0b5323e15c0e24ca415212214517a0af6527c19b` while preserving the rebuilt subtitle fonts under `assets/creator-subtitle-fonts/`.

---

## 2. Typecheck (`pnpm typecheck`)

**Command**: `pnpm typecheck`
**Result**: ✅ **PASSED** — All 9 workspace projects (`@vishnucreator/protocol`, `@vishnucreator/shared`, `@vishnucreator/sdk`, `@vishnucreator/cli`, `@vishnucreator/daemon`, `@vishnucreator/desktop`, `@vishnucreator/web`, `@vishnucreator/website`, `@vishnucreator/e2e`) typecheck with exit code 0.

---

## 3. Package & Service Test Suites

### `@vishnucreator/desktop`
- **Command**: `pnpm --filter @vishnucreator/desktop test`
- **Result**: ✅ **42 passed (42 test files), 285 passed, 4 skipped (289 total)**
- **Fixes applied**:
  - Removed hardcoded upstream `https://admin.clawee.work/api/v1/public/desktop-usage` telemetry URL in `apps/desktop/src/main/telemetry.ts` (`DEFAULT_TELEMETRY_URL = ''`) and updated `apps/desktop/test/telemetry.test.ts` (9/9 passed).
  - Replaced Chinese description in `apps/desktop/package.json` with English `"Vishnu Creator Local Codex Dashboard"`.
  - Fixed Windows URL-to-path resolution in `apps/desktop/test/mac-app-icon.test.mjs` (`fileURLToPath`) and `apps/desktop/test/runtime-profile.test.ts` (`join`).

### `@vishnucreator/daemon` (Unit Test Suite)
- **Command**: `pnpm --filter @vishnucreator/daemon exec vitest run test/unit`
- **Result**: ✅ **194 passed (194 test files), 1,895 passed (1,895 total)**
- **Fixes applied**:
  - `apps/daemon/src/codex/app-server-host-2026-07-28.ts`: attached `.catch(() => undefined)` to `settled` promise to prevent unhandled rejections when `turn/start` fails early.
  - `apps/daemon/src/dub-engine/service.ts`: resolved Windows `.venv\Scripts\python.exe` alongside POSIX `.venv/bin/python`.
  - `apps/daemon/src/creator/vishnu/adapter.ts`: canonicalized `jobRoot` with `realpath()` in `writeArtifactIndex` so Windows 8.3 short paths (`CHDESK~1`) match `realpath(destination)`.
  - `apps/daemon/src/config/private-json-file.ts`: added `renameWithRetry` on Windows to handle transient `EPERM`/`EACCES` when concurrent readers poll the target JSON file.
  - `apps/daemon/src/creator/process-tree.ts` & `apps/daemon/src/creator/validators/media.ts`: resolved `#!` shebang scripts on Windows via `process.execPath` or Git `sh.exe`.
  - Fixed Windows path assertions and unprivileged symlink fallbacks (`junction`) in `creator-remotion-component.test.ts`, `creator-translation-resume.test.ts`, `project-manager.test.ts`, `startup.test.ts`, `codex-native-image.test.ts`, `fake-codex-image.mjs`, and `creator-preset-compiler.test.ts`.

### `@vishnucreator/web` (Full Test Suite)
- **Command**: `pnpm --filter @vishnucreator/web test`
- **Result**: ✅ **175 passed (175 test files), 2,215 passed (2,215 total)**
- **Fixes applied**:
  - Restored `apps/web/src/test/setup.ts` (removed broken `history.pushState`/`replaceState` overrides that broke `window.location.hash` navigation, and set `configure({ asyncUtilTimeout: 5000 })`).
  - Fixed `navigateToRoute` transition race in `apps/web/src/app/AppController.tsx` by comparing `routeKey` against `pendingRouteKeyRef.current ?? formatRoute(props.route)` so React Router `v7_startTransition` in-flight transitions do not skip returning to `#/chat`.
  - Preserved empty `data-value=""` on `TtsVoicePicker` when `provider === 'edge-tts'` and no voice override is set (`apps/web/src/components/tts/TtsVoicePicker.tsx`), and aligned `DashboardPage.test.tsx` with the resolved `voiceName` (`星语`).
  - Fixed brand name spacing (`'允许 Vishnu Creator 执行这条命令？'`) in `App.test.tsx` and `Timeline.test.tsx`.
  - Implemented `segmentKhmerWords` and `wrapKhmerSubtitleText` using `Intl.Segmenter('km', { granularity: 'word' })` in `apps/web/src/features/dashboard/subtitle-editing.ts` + 7 unit tests in `subtitle-editing.test.ts`.
  - Populated `apps/web/src/i18n/locales/km-KH.json` with natural Khmer translations and added all 16 Dub Engine settings keys across all 12 locale catalogs.

### `services/dub-engine` (Python Dub Engine)
- **Command**: `services\dub-engine\.venv\Scripts\pytest.exe services\dub-engine\vishnu_dub\tests -v`
- **Result**: ✅ **33 passed in 13.04s**
- **Fixes applied**:
  - Removed fake `ffmpeg -f lavfi -i sine=... -i testsrc=...` output generator, hardcoded SRT strings, fake `anullsrc` stems, fake `[km]` translation markers, and fake `asyncio.sleep(0.1)` benchmark from `services/dub-engine/vishnu_dub/`.
  - Fixed `jobs.py` dict vs attribute handling on translated segments, `voice_id=` keyword argument on `tts_backend.synthesize`, `sep_result.instrumental_path` attribute access, and `checkpoint.json` / `translated.srt` persistence.
  - Auto-detected bundled `ffmpeg.exe`, `ffprobe.exe`, and `yt-dlp.exe` from `.runtime/vendor/creator-runtime/win32-x64/` in `config.py`, `tts.py`, and `separation.py`, plus `.venv` `edge-tts.exe` resolution and `nvidia-smi` GPU/VRAM fallback in `api.py`.
  - Added `normalize_khmer_translation()` in `translation.py` (strips `U+200B` zero-width spaces and converts Khmer digits `០-៩` to ASCII `0-9`).