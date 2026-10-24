# Phase 0 — Stabilize the baseline

**Status:** Not started · **Default risk tier:** P1 (see `AGENTS.md`) · **Estimate:** ≈1 day · **Depends on:** —
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

A clean, reproducible `main` you can always return to.

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T0.1 | Review the 75 uncommitted changes (F11); commit legit ones, revert accidental ones (rename-script fallout in `.webp`/fixtures) | todo | |
| T0.2 | `pnpm install && pnpm typecheck && pnpm test && pnpm build` — record results in `docs/development/baseline-2026-10.md` | todo | |
| T0.3 | Fix every failure found in 0.2 (no skipping tests) | todo | |
| T0.4 | `pnpm e2e` (Playwright) against the running app; save report | todo | |
| T0.5 | Finish the "Local mode" first-run screen so the dashboard opens without sign-in friction | todo | |
| T0.6 | Fix stale `File clone Resource/README.txt` (still says only "OpenCreator-source") | todo | |
| T0.7 | Remove leftovers at repo root (`findimg.mjs`, `apps/daemon/放假.md`, stray `.runtime-test-*` dirs) if unused | todo | |
| T0.8 | Security sweep of the fork: grep for upstream endpoints, telemetry, analytics, auto-update URLs; list and decide each | todo | |

## Exit gate

typecheck/test/build green, e2e report saved, tree clean, tagged `v0-baseline`.

- [ ] Gate passed — evidence:
