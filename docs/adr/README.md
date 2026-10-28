# Architecture Decision Records

Short records of decisions that shape Vishnu Creator: what was decided, why, and what it costs.
Format: [Michael Nygard's ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Copy [`template.md`](template.md) for a new one.

Rules:
- Number in order (`NNNN-short-title.md`); never reuse a number.
- Status is one of `Proposed`, `Accepted`, `Superseded by ADR-NNNN`, `Rejected`.
- Don't edit an accepted ADR's decision. Write a new ADR that supersedes it.

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](0001-opencreator-fork-as-base.md) | Use the OpenCreator fork as the product base | Accepted | 2026-10-24 |
| [0002](0002-dub-engine-owned-http-service.md) | Dub engine is an owned Python service behind HTTP | Accepted | 2026-10-25 |
| [0003](0003-adaptive-compute-tiers.md) | Adaptive compute tiers; same final result on every PC | Accepted | 2026-10-25 |
| [0004](0004-reference-folder-read-only.md) | `File clone Resource/` is read-only reference | Accepted (folder renamed by ADR-0006) | 2026-10-24 |
| [0005](0005-zasttranslate-code-reuse.md) | How ZastTranslate code may be reused | **Proposed** | 2026-10-25 |
| [0006](0006-reference-folder-renamed.md) | Reference sources live in `reference/` | Accepted | 2026-10-28 |
