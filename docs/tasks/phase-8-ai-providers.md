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
| T8.1 | Research: for every provider below, record the official base URL, current model IDs, free tier, pricing page, key page and Khmer support, with the source URL and date, in `docs/providers/provider-research-2026-10.md` | doing | |
| T8.2 | Text AI, cloud: add OpenAI-compatible presets to `packages/protocol/src/creator-provider-catalog.ts` for OpenRouter, Groq, Google Gemini, Anthropic Claude, Mistral, xAI Grok, Alibaba Qwen, Moonshot Kimi, Zhipu GLM, Together, Fireworks, Cerebras, SambaNova, NVIDIA NIM, GitHub Models, Hugging Face | todo | |
| T8.3 | Text AI, local: presets for Ollama, LM Studio, llama.cpp server, vLLM and Jan, with no API key required | todo | |
| T8.4 | Settings UI: free / paid / local badges, a "Get API key" link and a Khmer-support note per provider; update `inferLlmProviderId` to recognise every new preset | todo | |
| T8.5 | Live verification of text presets: one real `chat/completions` call per preset with a key (or a running local server), recorded per provider | todo | |
| T8.6 | Transcription: Groq Whisper, Deepgram, AssemblyAI, ElevenLabs Scribe, Gemini; one adapter each, verified on a real Khmer clip | todo | |
| T8.7 | Voice / TTS: Azure Speech (Khmer neural voices), Google Cloud TTS, ElevenLabs, Fish Audio, and local VoxCPM2 through the dub engine (with T5.1); one adapter each, verified by real synthesis | todo | |
| T8.8 | Image: FLUX via Together / fal / Replicate, Stability AI, and local ComfyUI; one adapter each, verified by a real generated image | todo | |
| T8.9 | Video: Runway, Luma, MiniMax Hailuo, and local ComfyUI; one adapter each, verified by a real generated clip | todo | |
| T8.10 | User guide `docs/providers/README.md`: which providers are free, paid or local, how to get each key, and which support Khmer | todo | |

## Exit gate

Every provider listed in Settings has a recorded real call (cloud) or local run, and the user guide matches what the app shows.

- [ ] Gate passed — evidence:
