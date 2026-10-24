# ADR-0001: Use the OpenCreator fork as the product base

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** Project owner

## Context

Vishnu Creator needs an agent-driven creator app with templates, video translation, smart dubbing, subtitles, clips, covers, articles, and Web + Desktop delivery. [krillinai/OpenCreator](https://github.com/krillinai/OpenCreator) already provides all of these in a pnpm monorepo (`apps/daemon`, `apps/web`, `apps/desktop`, `packages/*`).

## Decision

Fork OpenCreator as Vishnu Creator, rebrand it fully (commits `0b5323e`…`5e3a2d2`), and add new capabilities into its existing modules rather than building a second app. ZastTranslate and VoxCPM2 are merged *into* this base (see ADR-0002).

## Consequences

- One UI, one daemon, one release pipeline. New features must fit the existing creator-stage architecture and the shared `CreatorCollaborationPanel` rule in `AGENTS.md`.
- Upstream fixes can be reviewed against `File clone Resource/OpenCreator-source` (ADR-0004).
- The fork carries upstream code we didn't write; Phase 0 (T0.8) audits it for upstream endpoints and telemetry.
- Upstream's license (see `LICENSE`) and attribution must be kept (T7.5).

## Alternatives considered

- **Build from scratch:** months of work to reach feature parity.
- **Use ZastTranslate's Gradio app as the base:** Gradio is a single-user demo UI with no agent, project or desktop model.
