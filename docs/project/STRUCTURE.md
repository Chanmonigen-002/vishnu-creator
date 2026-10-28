# Repository structure

This is a pnpm monorepo (workspaces: `apps/*` and `packages/*`) plus one Python service and one Go CLI. Every top-level folder has a single purpose. Code folders are kept where build, packaging and runtime path defaults expect them. Moving one is a P2 change (see `AGENTS.md`).

## Top level

| Folder | What it holds | Language | Tracked |
|---|---|---|---|
| `apps/daemon/` | **Backend API**: local Fastify daemon (projects, sessions, creator templates and executors, dub-engine client) | TypeScript | yes |
| `apps/web/` | **Frontend**: the only UI implementation (React + Vite); Desktop embeds its build | TypeScript | yes |
| `apps/desktop/` | Electron shell, packaging and release scripts (`apps/desktop/scripts/`) | TypeScript / JS | yes |
| `apps/harness/` | Test harness for host/notification behavior | TypeScript | yes |
| `packages/` | Shared libraries: `protocol` (API types), `config`, `skill-market`, `writing-templates`, `stickman-remotion` | TypeScript | yes |
| `services/dub-engine/` | **Dub engine backend**: Python FastAPI service on 127.0.0.1:8765 (ASR, translation cleanup, TTS, time-sync, voices) | Python | yes (venv, jobs and models ignored) |
| `runtime/vishnuai/` | `vishnuai` Go CLI used by creator pipelines (render, subtitles, TTS) | Go | yes (bin/models ignored) |
| `template/` | Creator template definitions (image, video, cover generation) | JSON / Markdown | yes |
| `assets/` | Product assets: subtitle fonts, language catalog, preset preview videos, icons | binary / JSON | yes |
| `resources/` | Runtime resources bundled into Desktop (codex runtime, stickman) | mixed | yes |
| `skills/` | Agent skills shipped with the app (`vishnuai-*`) | Markdown | yes |
| `scripts/` | Repo-level dev, build, data and release scripts ([index](../../scripts/README.md)) | JS / Python | yes |
| `docs/` | All documentation ([index](../README.md)) | Markdown | yes |
| `.github/` | CI workflows (including the `agent-gate` job), PR template | YAML | yes |
| `.claude/` | Claude Code project settings: hooks that run the agent gate at session start and stop | JSON | yes (`settings.local.json` is personal) |
| `reference/` | Read-only upstream sources (OpenCreator, ZastTranslate, VoxCPM). Never built or run (ADR-0004, ADR-0006) | — | **no** |
| `models/` | Downloaded model weights (default model folder, see master plan) | binary | **no** |
| `logs/` | Dev logs written by `start-dev.bat` | text | **no** |
| `.runtime/` | Generated build and runtime state (compiled presets, vendor runtime, e2e outputs) | — | **no** |
| `test-results/` | Playwright and performance output | — | **no** |

Root files: `package.json` (workspace scripts), `pnpm-workspace.yaml`, `tsconfig.base.json`, `playwright.config.ts`, `start-dev.bat` (owner's dev launcher: web on 19861, daemon on 19862), `.env.example`, `AGENTS.md` / `CLAUDE.md` (rules), `README.md`, `CONTRIBUTING.md`, `LICENSE`.

## Where data lives

| Data | Location |
|---|---|
| User projects, sessions, settings | Daemon data folder (`VISHNUCREATOR_HOME`, default under the user profile) |
| Dub jobs | `services/dub-engine/jobs/` (ignored) or the configured model folder |
| Model weights and caches | Configured model folder (default: the drive with the most free space; never the system drive) |
| Test fixtures | Next to their tests (`apps/*/test/`, `apps/web/e2e/fixtures/`, `services/dub-engine/vishnu_dub/tests/`) |

## Docs layout

See [docs/README.md](../README.md#folder-layout).

## Rules

- Don't add new top-level folders or loose root files without updating this page.
- Logs, outputs and downloads go to ignored folders (`logs/`, `.runtime/`, `test-results/`, `models/`), never the repo root.
