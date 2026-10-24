# Vishnu Creator documentation

## Start here

| Doc | Purpose |
|---|---|
| [Master plan](project/master-plan.md) | Goals, scope, phases, risks, definition of done |
| [Task board](tasks/README.md) | Every task per phase, with status and evidence |
| [Architecture decisions (ADRs)](adr/README.md) | Why the system is built the way it is |
| [Agent and contributor rules](../AGENTS.md) | How to work in this repo (people and AI agents) |
| [Contributing](../CONTRIBUTING.md) | Setup, workflow, PRs |

## Folder layout

| Folder | Contents | Owner |
|---|---|---|
| `project/` | Master plan and project-level docs | Vishnu Creator |
| `tasks/` | Phase task files (`phase-<n>-<name>.md`) | Vishnu Creator |
| `adr/` | Architecture Decision Records (`NNNN-title.md`) | Vishnu Creator |
| `plans/` | Feature implementation plans. `plans/archive/` holds superseded plans | mixed (many from upstream) |
| `specs/` | Design specs | upstream |
| `development/` | Engineering notes: video translation, subtitles, runtime, diagnostics | upstream + Vishnu |
| `operations/` | Release runbooks and operating notes | upstream |
| `performance/` | Performance baselines | upstream |
| `test-reports/` | Saved test reports (evidence for tasks) | Vishnu Creator |
| `contributing/` | Skill and template contribution guides | upstream |
| `images/`, `videos/` | Media used by docs | — |
| `ar/` `bn/` `de/` … `zh/` | Translated READMEs | upstream |

## Feature guides

- [Dub Studio (Khmer-first)](dub-studio.md)
- [User guide and troubleshooting](vishnucreator-user-guide-and-troubleshooting.md)
- [FunASR transcription](funasr-transcription.md)
- [Cached model credentials](cached-model-credentials.md)
- [OpenRouter model availability](openrouter-model-availability.md)

## Engineering reference

- [Runtime API for UI v1](runtime-api-for-ui-v1.md)
- [Creator artifact versions](creator-artifact-versions.md)
- [Visual component guidelines](visual-component-guidelines.md)
- [Codex native agent runtime design](2026-07-03-codex-native-agent-runtime-design.md)

## Conventions

- New docs are written in English. Use lowercase kebab-case file names, plus a date prefix (`YYYY-MM-DD-`) for time-bound plans and reports.
- Put each doc in the folder that matches its type; don't add new loose files at the top of `docs/`.
- Plans describe intent; task files record progress; ADRs record decisions. Don't mix them.
