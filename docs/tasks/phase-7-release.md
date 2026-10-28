# Phase 7 — Release

**Status:** Not started · **Default risk tier:** P2 (see `AGENTS.md`) · **Estimate:** ≈3 days · **Depends on:** Phases 1–6
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal



## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T7.1 | Package Python engine runtime for desktop (like existing `python-runtime.tar.gz`), CPU build by default, GPU pack optional download | done | Packaged CPU Dub Engine runtime bundle in `apps/desktop/.pack/dub-engine-runtime` via `apps/desktop/scripts/prepare-dub-engine-runtime.mjs`. Verified manifest contract (`apps/desktop/scripts/dub-engine-runtime-contract.mjs`) with CPU build by default, 41,771 resources, `python/Scripts/python.exe`, `vishnu_dub/api.py`, no mutable bytecode caches; smoke test passed `import vishnu_dub`. Defined optional GPU pack specification in `dub-engine-gpu-pack.json` for on-demand T2/T3 acceleration download. Created distribution archive `apps/desktop/release/dub-engine-runtime-win32-x64-cpu.tar.gz` (492,396,067 bytes, SHA-256 `cd8b057e72477e6c16a63d72895550266dcfae7af3867fd6347a229623cc5b78`). Verified tests: `pnpm --filter @vishnucreator/desktop test dub-engine-runtime-package` (10/10 passed), `pnpm --filter @vishnucreator/daemon test test/unit/dub-engine` (31/31 passed), typechecks green. |
| T7.2 | Model download manager with progress, cache in `.vishnucreator/models`, checksum verify | todo | |
| T7.3 | Full matrix: `pnpm typecheck`, `pnpm test`, `pytest`, `pnpm e2e`, `pnpm desktop:dist` | todo | |
| T7.4 | Performance baselines (`pnpm perf:check`) incl. dub timing | todo | |
| T7.5 | Docs: `docs/guides/dub-studio.md` update, `docs/guides/local-dub-engine.md`, Khmer user guide, attribution/NOTICE for OpenCreator, ZastTranslate, VoxCPM | todo | |
| T7.6 | Windows installer smoke test on a clean machine | todo | |
| T7.7 | Tag `v1.0.0-khmer` | todo | |

## Exit gate

installer works on a clean Windows PC; Khmer dub end-to-end without manual setup.

- [ ] Gate passed — evidence:
