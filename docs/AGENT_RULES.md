# Agent working rules (the build loop)

**Read this first, every session.** It applies to every agent (Claude Code, Codex, Hermes, Gemini, any other) and to people who work the same way. `AGENTS.md` holds the project rules (no fake builds, Khmer-first, risk tiers, Web/Desktop parity). This file holds the **working loop**: when to scan, build, commit, push, open a PR, wait for merge and hand off.

Precedence when instructions disagree: the owner in chat → `AGENTS.md` (safety, honesty, no-fake rules) → this file → task files in `docs/tasks/` → everything in `docs/archive/` (history, not instructions).

The loop is enforced by `scripts/agent-gate.mjs`:

| Command | When | What it does |
|---|---|---|
| `pnpm gate:start` | Start of every session (the SessionStart hook runs it) | Fetches `origin`, then lists unpushed branches, pushed-but-unmerged branches, open PRs, dirty worktrees, an unrecorded build on `main`, and the task board check |
| `pnpm gate:scan` | Before every commit you push, and in CI | Scans the diff for fake builds, weakened tests, broken binary assets, secrets, reference-folder paths, Chinese commit messages and board drift. **Exit 1 = do not push** |
| `pnpm gate:board` | After editing any task file | Recounts every phase file and compares with `docs/tasks/README.md` |
| `pnpm gate:finish` | Before you say "done" (the Stop hook runs a quick version) | Uncommitted files, unpushed commits, missing PR, scan result |

## 1. Start of every session (in order)

1. `pnpm gate:start`. Read what it reports **before** anything else.
2. **Previous work first.** If it lists a branch of yours that is unpushed, or pushed with no PR, or a PR waiting for the owner, finish that (push, PR, report) before starting anything new. Never start a second task while your first one is unpushed (rule 6).
3. **Main must be green.** If `main` or the app branch has failing checks (CI red, `gate:board` mismatch, a known broken test), report it. Fix it only when that is your task. Don't build new work on a red base.
4. Read `docs/project/master-plan.md`, then the phase file in `docs/tasks/`, and pick **one** task ID. Work that has no task: add it to the phase file first, or ask the owner.
5. Create a worktree in `D:\Build App\Vishnu-worktrees\<name>` on a branch `phase-<n>/<short-name>` (or `docs/<name>`, `fix/<name>`) from the latest `origin/main`. **Never edit the owner's live checkout** (`D:\Build App\Vishnu Creator`, which serves http://127.0.0.1:19861) and never edit another agent's worktree or uncommitted files.

## 2. The loop: scan → fix → build → test → commit → push → PR → merge → sync

1. **Scan and fix before you build.** Reproduce the problem or read the real code first (`AGENTS.md`: no guessing). If the base already fails a check you need, fix that or record it as `blocked` with the output. Don't stack new code on a failure.
2. **Build in small steps.** Each step is a working change plus its test. A new behaviour has a test that fails without it.
3. **Test at the risk tier** (`AGENTS.md` P0/P1/P2). Paste the real command and the real result. "Not run" is allowed; hiding it is not.
4. **Commit** after each working step: `type(scope): what and why`, English only, with the agent trailer (`Co-Authored-By: ...`).
5. **Push** your branch after a meaningful step, every ~30 minutes, and always before you stop. Run `pnpm gate:scan` first. Unpushed work is lost work.
6. **Open a draft PR on the first push** (`gh pr create --draft`), fill in the template (What / Tested / Not tested / Rollback), and give the owner the link in full and short form, for example `Pull Request #12: https://github.com/Chanmonigen-002/vishnu-creator/pull/12` / [#12](https://github.com/Chanmonigen-002/vishnu-creator/pull/12).
7. **Update the task board** in the same branch: the phase file row (status + evidence) and `docs/tasks/README.md` counts together. `pnpm gate:board` must pass.
8. **Stop and wait for the owner to say `merge #N`.** Never create and merge a PR in the same turn, and never merge your own PR without that message, docs-only PRs included.
9. **On `merge #N`:** check that `gh pr checks <N>` is all green (wait while checks are still running; if one fails, stop and report). Merge with a merge commit (`gh pr merge <N> --merge`), not squash. Then:
   - add one line to `docs/FINAL_BUILDS.md` (newest first);
   - sync the owner's checkout (rule 5);
   - remove your worktree (rule 7).

## 3. One final build before the next task

A build is final only when **all** of these are true:

- committed and **pushed**;
- PR open with the template filled in, and CI green;
- the task file says `done` with evidence (or `doing` / `blocked` with the reason);
- the handoff note is written (section 8).

Only then start the next task. `pnpm gate:start` lists anything that breaks this rule.

## 4. No bad builds, no fake builds

These are blocking. `pnpm gate:scan` and CI check the mechanical ones.

| Never | Instead |
|---|---|
| Synthetic media as real output (`testsrc`, `anullsrc`, `sine=` in production code), canned transcripts or subtitles | Fail honestly with a clear error when a model, file or dependency is missing |
| `sleep()` / timers or hard-coded numbers in benchmarks or performance checks | Measure the real backend |
| `.skip`, `.only`, `xit`, `@pytest.mark.skip`, deleting or loosening an assertion to get green | Fix the cause, or mark the task `blocked` with the failing output |
| Mocking `window.history` or weakening `apps/web/src/test/setup.ts` | Fix the app code |
| Placeholder or text-mangled images, fonts, videos (tiny files, binaries diffed as text after a CRLF conversion) | Restore the real asset; check `.gitattributes` |
| API keys, tokens, private keys or `.env` files in git | Keys live in the user's settings store only |
| Paths into `reference/` (or the old `File clone Resource/`) from code or config | Copy, adapt, attribute and security-review the code (ADR-0004) |
| Chinese or mixed text in commit messages, release notes or tags | English only (`AGENTS.md`) |
| A task marked `done` without the command and its real result | Keep it `doing` and say what is missing |
| Claiming a check passed that was not run | Report exactly what ran |

A line that genuinely needs a flagged pattern (for example a test that asserts `anullsrc` is rejected) carries the marker comment `agent-gate: allow` and a reason. Reviewers check every one.

## 5. Keeping the owner's checkout in sync

The owner runs the app from `D:\Build App\Vishnu Creator`. After a merge, give the owner (or run, if asked) these commands:

```text
cd "D:\Build App\Vishnu Creator"
git fetch origin --prune
git switch main
git pull --ff-only origin main
```

If the checkout has uncommitted work from an agent, don't switch branches over it: report it and ask.

## 6. When to wait or stop and ask

| Situation | Do |
|---|---|
| You still hold unpushed or unmerged work | Finish it first (section 3) |
| `main` is red or the board check fails | Report it; fix only if that is your task |
| Another agent's branch or PR touches the same files and isn't merged | Wait for it, then rebase. Don't race or duplicate it |
| The change is P2 (daemon/runtime, protocol, packaging, release) and has no approved plan | Write the plan, wait for the owner's OK |
| You'd spend money, call a paid model, enter a key, or touch accounts | Stop and ask |
| The request is unclear or contradicts the master plan | Ask one clear question, with a recommendation |

## 7. Worktrees

- All worktrees live in `D:\Build App\Vishnu-worktrees\`, never inside the repo.
- Junctions (`node_modules`, `apps/desktop/.pack`, `apps/daemon/.runtime`, `services/dub-engine/.venv`, `.runtime/vendor`) point into the main checkout. **Before** `git worktree remove`, delete only those links (`cmd /c rmdir <path>`). `git worktree remove` on Windows follows a junction and deletes the target's files.
- Then run `git worktree remove <path>` and `git worktree prune`. Delete the local branch only after it has been merged.

## 8. Handoff (end of every session or when near a limit)

Write `docs/handoffs/YYYY-MM-DD-<topic>.md` from [`docs/templates/HANDOFF.md`](templates/HANDOFF.md): what is done (commits, PR links), what isn't, the exact next step, known problems, and commands to resume. Commit and push it with the work.

## 9. End-of-reply summary (always last)

Report in plain words what changed, the PR links, what failed (with output) and what wasn't tested. End with a **Next action for you** block holding the exact words the owner can reply, in a `text` code block, for example:

```text
merge #12
```
