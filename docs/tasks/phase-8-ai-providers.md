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
| T8.4 | Settings UI: free / paid / local badges, a "Get API key" link and a Khmer-support note per provider; update `inferLlmProviderId` to recognise every new preset | doing | Done: free-tier / paid / local / "not yet verified" badges, "Get API key" link, **Load models from service** button backed by new `POST /creator-services/llm/models` (lists the provider's live `/models`; reuses the saved key only for the same base URL; never returns the key), placeholder key for local presets, and exact-URL matching in `inferLlmProviderId`. Tests: `vitest run src/features/settings` → 18 files, 218/218 passed (3 new view tests + 3 new `llm-provider-selection` tests); `vitest run test/integration/creator-services-api.test.ts` → 13/13 passed (new route test against a real local HTTP server); web and daemon `typecheck` → exit 0. **Remaining:** per-provider Khmer-support note (Khmer quality is only known for Ollama + gemma4 so far). Not yet viewed in the running app, because the shared checkout is on another agent's branch. |
| T8.5 | Live verification of text presets: one real `chat/completions` call per preset with a key (or a running local server), recorded per provider | doing | **Ollama (running locally on this PC):** `GET http://localhost:11434/v1/models` → HTTP 200, 7 models; CLI-shaped `POST /chat/completions` (system + user, `response_format: json_object`, `reasoning_effort: "none"`, key `ollama`) → HTTP 200, `finish=stop`. Khmer quality differs by model: `gemma4:latest` → `{"translation": "ជំរាបសួរអ្នកទាំងអស់គ្នាសូមស្វាគមន៍មកកម្ពុជា។"}` (correct, no spaces, ends with ។, 92.7 s on CPU); `qwen3:4b` → valid JSON with **no Khmer** (19.2 s). Cloud presets need the owner's API keys; not run. |
| T8.6 | Transcription: Groq Whisper, Deepgram, AssemblyAI, ElevenLabs Scribe, Gemini; one adapter each, verified on a real Khmer clip | todo | |
| T8.7 | Voice / TTS: Azure Speech (Khmer neural voices), Google Cloud TTS, ElevenLabs, Fish Audio, and local VoxCPM2 through the dub engine (with T5.1); one adapter each, verified by real synthesis | todo | |
| T8.8 | Image: FLUX via Together / fal / Replicate, Stability AI, and local ComfyUI; one adapter each, verified by a real generated image | todo | |
| T8.9 | Video: Runway, Luma, MiniMax Hailuo, and local ComfyUI; one adapter each, verified by a real generated clip | todo | |
| T8.10 | User guide `docs/providers/README.md`: which providers are free, paid or local, how to get each key, and which support Khmer | todo | |

## Exit gate

Every provider listed in Settings has a recorded real call (cloud) or local run, and the user guide matches what the app shows.

- [ ] Gate passed — evidence:
