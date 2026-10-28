# Final builds

One line per build merged into `main`, newest first. The agent that merges adds the line in the same session (`docs/AGENT_RULES.md` §2.9). `pnpm gate:start` warns when the commit at `origin/main` is not listed here.

| Date | Commit | PR | What changed | What to check |
|---|---|---|---|---|
| 2026-10-28 | `1927380` | — (pushed before this log existed) | Baseline when the log started: Phase 4 quality gate, Voice Library UI, audio watermark fix | `pnpm gate:start` shows the app branch and open work |
