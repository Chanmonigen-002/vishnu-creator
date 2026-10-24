# ADR-0004: `File clone Resource/` is read-only reference

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** Project owner

## Context

Upstream sources are kept in `File clone Resource/` for reference: `OpenCreator-source`, `ZastTranslate` and `VoxCPM`. Running or editing code there would create a hidden second codebase and an unreviewed dependency.

## Decision

- Nothing in `File clone Resource/` is built, run, installed or edited.
- Useful code is **copied** into the main repo, adapted, rebranded, security-reviewed, attributed, and committed there.
- No script, config or path default in the repo may point into `File clone Resource/`.
- The folder is not part of builds or releases.

## Consequences

- `scripts/dub-engine.mjs`'s default must change from `../ZastTranslate` to `services/dub-engine` (T2.9).
- `File clone Resource/README.txt` must list all three sources (T0.6).
- Upstream updates are reviewed by diffing against this folder, then porting deliberately.

## Alternatives considered

- **Git submodules:** pin upstream but invite running upstream code directly. Rejected for now.
