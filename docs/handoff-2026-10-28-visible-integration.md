# Handoff 2026-10-28: visible ZastTranslate/VoxCPM integration (T6.5–T6.7)

## Done (committed, not merged)

- Branch `phase-6/visible-integration`, commit `767bf33`, worktree `D:\Build App\Vishnu-worktrees\visible` (based on `e9fbdb3`).
- **Khmer Dub Studio** is the first section on the dashboard (`apps/web/src/features/dashboard/KhmerStudioHero.tsx`). It has:
  - "Translate & dub to Khmer" and "Khmer voices" buttons;
  - an honest feature list (VoxCPM2 cloning shown as not set up);
  - live dub engine status with a **Start engine** button.
- Upstream featured photos are replaced with drawn Khmer cards.
- Dub engine runtime control (`apps/daemon/src/dub-engine/runtime.ts`, `routes.dub-engine-runtime.ts`):
  - `GET /creator-services/dub-engine/status`, `POST .../start`, `POST .../stop`.
  - On by default; autostart only in production startup.
  - Fixed the dev path lookup.
- All 42 locale files have the new strings.
- Evidence is in `docs/tasks/phase-6-creator-studios.md` (T6.5–T6.7 `done`), and the board row is updated.

## Next steps (in order)

1. **Merge into the branch serving http://127.0.0.1:19861** (main checkout, `phase-6/blog-seo`). The main checkout has another agent's uncommitted blog work, including 8 lines in `apps/daemon/src/api/server.ts`. Keep it:
   ```
   cd "D:\Build App\Vishnu Creator"
   git stash push -- apps/daemon/src/api/server.ts
   git merge --ff-only refs/heads/phase-6/visible-integration
   git stash pop
   ```
   The hunks don't overlap. If `stash pop` conflicts, keep both: the blog executor import and push, plus the `dubEngineRuntime` block.
2. **Restart the daemon** (Vite on 19861 restarts it on daemon source changes; otherwise use `start-dev.bat`). Open `http://127.0.0.1:19861/#/dashboard` and confirm Khmer Dub Studio shows, with engine status `off` or `ready`. Click Start engine and confirm it reaches `ready`.
3. **Single URL cleanup:** delete `D:\Build App\Vishnu Creator\.claude\launch.json` (an untracked preview config for 19871) and `C:\Users\CHDESK~1\AppData\Local\Temp\claude\vishnu-visible.cmd`. Only 19861 should be used.
4. Then: T6.8 (Voices in the sidebar), T6.9 (timesync report on the result screen), Khmer entries for the remaining upstream dashboard labels in `km-KH.json` (any new key must go into all 42 locales).

## Known baseline failures (not caused by this work)

Daemon: api 1, creator-gateway-services 1, creator-image-generation 3, gateway-runtime-protocol 2, project-api 1 (environmental). `creator-video-download` is flaky only under full-suite load (passes 4/4 alone).

## Environment tips

- Run `pnpm test` from PowerShell.
- Print Khmer from Python with `python -I -X utf8`.
- Write Python scripts to files, not Bash heredocs (backslashes get mangled).
