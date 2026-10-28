# CLAUDE.md

All project rules for AI agents live in `AGENTS.md`. Follow them without exception.

@AGENTS.md

## Non-Negotiable Agent Checklist

1. **No Guessing**: Read the task file in `docs/tasks/` and inspect the real code before making changes.
2. **No Fake App, Fake Design, Fake API, or Fake Performance**:
   - Never stub or comment out production pipeline stages, generate synthetic `testsrc`/`sine` media as fake job outputs, replace real images/fonts with placeholder files, or use `sleep()` in benchmarks.
   - Never mock `window.history` or weaken tests in `setup.ts` to mask failures.
3. **Clone / Verify → Build → Test Before Finalizing**:
   - Verify binary and source integrity when copying/cloning assets.
   - Run `pnpm typecheck`, `pnpm build`, `pnpm test`, and `pytest` (for `services/dub-engine`) before marking any task `done` or reporting completion.
4. **Follow the working loop** in `docs/AGENT_RULES.md`: run `pnpm gate:start` first, finish (push + PR) your previous task before a new one, run `pnpm gate:scan` before every push, and never merge without the owner's `merge #N`.
5. **Keep Task Boards Synchronized**:
   - Always update `docs/tasks/README.md` and `docs/tasks/phase-<n>-*.md` together with real command outputs as evidence; `pnpm gate:board` must pass.

Quick links: [master plan](docs/project/master-plan.md) · [task board](docs/tasks/README.md) · [ADRs](docs/adr/README.md) · [docs index](docs/README.md)

