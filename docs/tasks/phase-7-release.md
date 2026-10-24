# Phase 7 — Release

**Status:** Not started · **Default risk tier:** P2 (see `AGENTS.md`) · **Estimate:** ≈3 days · **Depends on:** Phases 1–6
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal



## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T7.1 | Package Python engine runtime for desktop (like existing `python-runtime.tar.gz`), CPU build by default, GPU pack optional download | todo | |
| T7.2 | Model download manager with progress, cache in `.vishnucreator/models`, checksum verify | todo | |
| T7.3 | Full matrix: `pnpm typecheck`, `pnpm test`, `pytest`, `pnpm e2e`, `pnpm desktop:dist` | todo | |
| T7.4 | Performance baselines (`pnpm perf:check`) incl. dub timing | todo | |
| T7.5 | Docs: `docs/dub-studio.md` update, `docs/LOCAL_DUB_ENGINE.md`, Khmer user guide, attribution/NOTICE for OpenCreator, ZastTranslate, VoxCPM | todo | |
| T7.6 | Windows installer smoke test on a clean machine | todo | |
| T7.7 | Tag `v1.0.0-khmer` | todo | |

## Exit gate

installer works on a clean Windows PC; Khmer dub end-to-end without manual setup.

- [ ] Gate passed — evidence:
