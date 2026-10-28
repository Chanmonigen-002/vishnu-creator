# Scripts

Repo-level scripts. They resolve the repo root from their own location, and `package.json`, CI and generated-file headers name them by these paths, so they stay in this one folder. Desktop packaging scripts live in `apps/desktop/scripts/`, and daemon scripts in `apps/daemon/scripts/`.

| Group | Script | Run with |
|---|---|---|
| Workflow | `agent-gate.mjs` (+ test): session start report, fake-build scan, board check, finish check ([rules](../docs/AGENT_RULES.md)) | `pnpm gate:start` / `gate:scan` / `gate:board` / `gate:finish` / `gate:test` |
| Dev | `dub-engine.mjs`: start the local Python dub engine | `pnpm dub:engine` |
| Dev | `run-e2e-khmer-dub.py`: Khmer dubbing e2e runner (called by `apps/web/e2e/khmer-dubbing-e2e.spec.ts`) | Playwright |
| Build | `build-vishnuai.mjs`: build the `vishnuai` Go CLI | `pnpm vishnuai:build` / `pnpm vishnuai:test` |
| Build | `generate-creator-languages.mjs`: generate language catalogs for protocol and Go | `pnpm languages:generate` / `languages:check` |
| Build | `check-performance-baseline.mjs`: compare web bundle and perf results with the baseline | `pnpm perf:check` |
| Release | `package-vishnuai-release.mjs`: package CLI release assets | `pnpm vishnuai:package` |
| Data / assets | `optimize-creator-preview-videos.mjs`: re-encode template preview videos | `pnpm templates:preview-videos` |
| Data / assets | `prepare-creator-fallback-fonts.py`, `repair-subtitle-fonts.py`, `sync-runtime-fonts.py`: subtitle font assets | `python -I -X utf8 scripts/<name>` |
| Data / assets | `update-star-coverage.mjs`, `generate-star-coverage-map.mjs` (+ test): GitHub star coverage map | `.github/workflows/star-coverage.yml` |
| Verification | `verify-subtitle-render-parity.ts`: subtitle render parity check (T1.6) | `pnpm exec tsx scripts/verify-subtitle-render-parity.ts` |
