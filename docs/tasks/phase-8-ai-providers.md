# Phase 8 — More AI providers (free, paid, cloud, local)

**Status:** In progress · **Default risk tier:** P1 (see `AGENTS.md`) · **Estimate:** ≈2–3 weeks (all areas) · **Depends on:** Phase 3
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

Users can pick from many AI providers for text, voice, transcription, image and video, whether free tier, paid, cloud or local. Each provider shows what it costs, where to get a key, and whether it supports Khmer.

## Rules for this phase

- **No guessed endpoints or model IDs.** Every preset's base URL, model IDs, free tier and Khmer support come from the provider's official docs, with the source and date recorded in T8.1.
- A preset is `done` only after a **real call** succeeds: a live API call with the owner's key, or a local server actually running on this PC. A preset that only compiles is `doing`.
- Text presets must work through the creator text path, which calls `chat/completions` (`apps/daemon/src/creator/*`). The Codex agent's Responses API is out of scope.
- Keys are stored through the existing credential fields and never logged or committed.

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T8.1 | Research: for every provider below, record the official base URL, current model IDs, free tier, pricing page, key page and Khmer support, with the source URL and date, in `docs/providers/provider-research-2026-10.md` | doing | 2026-10-27: **text section done** — 12 cloud + 5 local providers with official source links ([research](../providers/provider-research-2026-10.md)). Found and excluded: GitHub Models (retired 2026-07-30), xAI (Responses API only), Alibaba Qwen (per-workspace URL), SambaNova (base URL not in docs). Transcription, voice, image and video sections still to do. |
| T8.2 | Text AI, cloud: add OpenAI-compatible presets to `packages/protocol/src/creator-provider-catalog.ts` for OpenRouter, Groq, Google Gemini, Anthropic Claude, Mistral, xAI Grok, Alibaba Qwen, Moonshot Kimi, Zhipu GLM, Together, Fireworks, Cerebras, SambaNova, NVIDIA NIM, GitHub Models, Hugging Face | done | Added 12 presets from the research: OpenRouter, Groq, Gemini, Claude, Mistral, Kimi, GLM, Together, Fireworks, Cerebras, NVIDIA NIM, Hugging Face. xAI, Qwen, SambaNova and GitHub Models were **not** added, for the reasons in T8.1. All 12 are `experimental` until T8.5 records a live call. `pnpm --filter @vishnucreator/protocol exec vitest run src/creator-provider-catalog.test.ts` → 4/4 passed. |
| T8.3 | Text AI, local: presets for Ollama, LM Studio, llama.cpp server, vLLM and Jan, with no API key required | doing | All 5 presets added with documented ports (llama.cpp default is now 9931) and a documented placeholder key, so creator executors that require a key still work. **Ollama verified live** (see T8.5) and marked `supported`. LM Studio, llama.cpp, vLLM and Jan are not installed on this PC, so they stay `experimental`. |
| T8.4 | Settings UI: free / paid / local badges, a "Get API key" link and a Khmer-support note per provider; update `inferLlmProviderId` to recognise every new preset | doing | Done: free-tier / paid / local / "not yet verified" badges, "Get API key" link, **Load models from service** button backed by new `POST /creator-services/llm/models` (lists the provider's live `/models`; reuses the saved key only for the same base URL; never returns the key), placeholder key for local presets, and exact-URL matching in `inferLlmProviderId`. Tests: `vitest run src/features/settings` → 18 files, 220/220 passed (2 more on 2026-10-28 for the Khmer note; 3 new view tests + 3 new `llm-provider-selection` tests); `vitest run test/integration/creator-services-api.test.ts` → 13/13 passed (new route test against a real local HTTP server); web and daemon `typecheck` → exit 0. **Remaining:** not yet viewed in the running app, because the shared checkout is on another agent's branch. Khmer note added 2026-10-28 (see remaining-work item 6): Ollama note from the recorded live test, generic "not verified yet" note elsewhere; Ollama now carries the `khmer` capability badge; protocol catalog 5/5. |
| T8.5 | Live verification of text presets: one real `chat/completions` call per preset with a key (or a running local server), recorded per provider | doing | **Ollama (running locally on this PC):** `GET http://localhost:11434/v1/models` → HTTP 200, 7 models; CLI-shaped `POST /chat/completions` (system + user, `response_format: json_object`, `reasoning_effort: "none"`, key `ollama`) → HTTP 200, `finish=stop`. Khmer quality differs by model: `gemma4:latest` → `{"translation": "ជំរាបសួរអ្នកទាំងអស់គ្នាសូមស្វាគមន៍មកកម្ពុជា។"}` (correct, no spaces, ends with ។, 92.7 s on CPU); `qwen3:4b` → valid JSON with **no Khmer** (19.2 s). Cloud presets need the owner's API keys; not run. |
| T8.6 | Transcription: Groq Whisper, Deepgram, AssemblyAI, ElevenLabs Scribe, Gemini; one adapter each, verified on a real Khmer clip | todo | |
| T8.7 | Voice / TTS: Azure Speech (Khmer neural voices), Google Cloud TTS, ElevenLabs, Fish Audio, and local VoxCPM2 through the dub engine (with T5.1); one adapter each, verified by real synthesis | doing | 2026-10-28 (worktree `D:\Build App\Vishnu-worktrees\task-audit`, branch `phase-8/ai-providers`; committed 2026-10-28 together with the language-file fix (remaining-work item 1 below). Built: Azure Speech (Khmer Sreymom/Piseth built in), ElevenLabs (no Khmer), Fish Audio (Khmer unknown) in `apps/daemon/src/creator/vishnu/http-tts-providers.ts`; config, credentials, redaction, settings UI, shared provider lists, video-translation preflight block. Not built: Google TTS (no `km-KH`, OAuth only), local VoxCPM2 (waits on T5.1). Research: [voice section](../providers/provider-research-2026-10.md#voice--tts-t87--checked-2026-10-27). Passing: `test/unit/http-tts-providers.test.ts` 9/9; preflight + config-store + tts-service + creator-services API 102/102; protocol 151/151; settings view 32/32; web and daemon typecheck exit 0. **Failing:** ~~web `src/i18n/client-copy-coverage.test.ts`~~ fixed 2026-10-28 (14 strings now present in all 42 locale files; test 31/31 — see remaining-work item 1). Daemon full suite (PowerShell, after worktree setup): `pnpm --filter @vishnucreator/daemon test` → 2414 passed, 8 failed, 46 skipped. All 8 are known environmental failures, also in the main-checkout baseline (api 1, creator-gateway-services 1, creator-image-generation 3, gateway-runtime-protocol 2, project-api 1) except `retro-illustration-presets.test.ts` (Windows `EPERM` temp rename), which passes 4/4 when re-run alone. No regressions from T8.7. (The first run's 212 failures were setup: missing preset catalog and packaged runtime.) No live synthesis yet (needs keys). |
| T8.8 | Image: FLUX via Together / fal / Replicate, Stability AI, and local ComfyUI; one adapter each, verified by a real generated image | todo | |
| T8.9 | Video: Runway, Luma, MiniMax Hailuo, and local ComfyUI; one adapter each, verified by a real generated clip | todo | |
| T8.10 | User guide `docs/providers/README.md`: which providers are free, paid or local, how to get each key, and which support Khmer | todo | |
| T8.11 | Video translation dubbing with Azure / ElevenLabs / Fish Audio: add them to the `vishnuai` Go CLI voice switch (`runtime/vishnuai/internal/service/init.go`) and its TOML config bridge (`apps/daemon/src/creator/vishnu/config-bridge.ts`), rebuild the CLI, then remove the preflight block | done 2026-10-28 (live dub runs pending owner keys) | Go TTS clients `pkg/azure`, `pkg/elevenlabs`, `pkg/fishaudio` (same endpoints as the daemon Phase 8 adapters), wired into `ttsprovider.New` + `init.go` and `internal/voices`; `vishnuCliTtsProviders` now lists all 8; TOML bridge writes `tts.azure` / `tts.elevenlabs` / `tts.fishaudio`; preflight block removed. CLI rebuilt with Go 1.27 (`go build` + `verifyCli` ok); `go test ./...` passes except the pre-existing environmental `TestNLPRuntimeReusesProcessAndRestartsAfterCancellation` (Microsoft Store `python3` stub); vitest preflight/protocol/CLI-runner 81 passed; web i18n 202 + settings/coverage 251. |

## Remaining work and what to fix (2026-10-28)

Fix first, before committing T8.7:

1. ~~**Language files (blocks commit).**~~ **Done 2026-10-28:** all 14 English strings from `CreatorServicesSettingsView.tsx` added to all **42** files in `apps/web/src/i18n/locales/` (the doc previously said 41; the actual catalog has 42 JSON locale files). `km-KH` written as natural spoken Khmer (Khmer words unspaced, spaces kept around Latin tokens like `API key` / `s2.1-pro-free`, proper `។`). Files keep their format: 2-space indent, no BOM, LF, trailing newline. `pnpm --filter @vishnucreator/web exec vitest run src/i18n/client-copy-coverage.test.ts` now passes 31/31; the full `src/i18n` vitest folder passes 202/202.
2. ~~**Daemon full suite.**~~ **Done 2026-10-28:** 2414 passed, 8 failed, all known environmental failures; no regressions from T8.7 (see the T8.7 row).
3. ~~**Commit T8.7** on `phase-8/ai-providers` with the evidence above, then merge.~~ **Done 2026-10-28 (commit part):** T8.7 code (`1aa3b36`) plus the language-file fix are committed on `phase-8/ai-providers`. **Merge pending owner approval.**

Then, needs the owner:

4. **Live voice tests (T8.7)** with real keys: Azure Khmer sentence (both voices), ElevenLabs any language, Fish Audio Khmer sentence with `s2.1-pro-free` to find out whether Khmer works. Mark each preset `supported` only after a recorded call. Also run one real video translation dub per new provider (T8.11) to verify the CLI end to end.
5. **Live text tests (T8.5):** 11 cloud presets need keys (Groq, Gemini, Cerebras and OpenRouter have free tiers). LM Studio, llama.cpp, vLLM and Jan are not installed on this PC.

Still to build:

6. ~~**T8.4:** per-provider Khmer-quality note for text presets~~ **Done 2026-10-28:** the Ollama llm preset now carries `capabilities: ['khmer']` (badge shows), and the text-provider section shows a per-provider Khmer-quality note: Ollama note says Gemma 4 (`gemma4:latest`) produced correct Khmer in the recorded live test and Qwen 3-type models may output none; every other text preset shows a "not verified yet — test with a short Khmer sentence" note. Both strings are localized in all 42 locale catalogs; `client-copy-coverage.test.ts` 31/31.
7. **T8.4:** view the new settings screens in the running app (not yet done; the shared checkout was on another branch).
8. ~~**T8.11:** video translation support for the new voice providers (Go CLI).~~ **Done 2026-10-28:** see the T8.11 row. A real dubbed video with each new provider still needs the owner's keys (covered by item 4). Go was installed on this machine (winget, Go 1.27.0) to rebuild the CLI.
9. **T8.6** transcription, **T8.8** image, **T8.9** video providers: research, adapters, live tests.
10. **T8.10** user guide `docs/providers/README.md`.
11. **Local VoxCPM2 voice** in the voice picker, after T5.1 has real model weights.
12. **Not built on purpose:** Google TTS (no Khmer, OAuth only), xAI (Responses API only), Alibaba Qwen preset (per-workspace URL; use Custom), SambaNova (base URL not documented), GitHub Models (retired).

## Exit gate

Every provider listed in Settings has a recorded real call (cloud) or local run, and the user guide matches what the app shows.

- [ ] Gate passed — evidence:
