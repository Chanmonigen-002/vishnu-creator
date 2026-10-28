# ADR-0006: Reference sources live in `reference/`

- **Status:** Accepted
- **Date:** 2026-10-28
- **Deciders:** Project owner, Claude Code

## Context

ADR-0004 keeps the upstream sources (OpenCreator, ZastTranslate, VoxCPM) as a read-only reference in `File clone Resource/`. The folder name has spaces and mixed case, so every shell command must quote it, and it doesn't match the lowercase layout of the rest of the repo (`apps/`, `docs/`, `services/`). The owner asked for a professional project layout (2026-10-28).

## Decision

Rename the folder to `reference/` at the repo root. Every rule in ADR-0004 stays the same (read-only, git-ignored, never built, run, installed or edited, and nothing in the repo points into it). Only the path changes. ADR-0004 is superseded in its folder name only.

## Consequences

- `.gitignore` ignores `/reference/` (the old name stays ignored too, for checkouts that haven't been renamed yet).
- AGENTS.md, the PR template and the master plan name `reference/`. Older ADRs, task evidence and archived plans keep the old name as history.
- Each checkout renames its own folder once. It isn't tracked, so git doesn't do it.

## Alternatives considered

- **Keep `File clone Resource/`:** works, but needs quoting everywhere and looks out of place.
- **`third_party/` or `vendor/`:** these usually mean code that is built into the product, which is the opposite of what this folder is.
