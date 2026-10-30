# Provider research — October 2026 (T8.1)

Sources were checked on **2026-10-27** (text, voice) and **2026-10-28** (transcription, image, video). Base URLs and model IDs below are copied from each provider's official docs, not from memory. Re-check before relying on them: model IDs change often, which is why the app also loads the live model list from each provider (T8.4).

## Text AI (LLM) — OpenAI-compatible `chat/completions`

The creator text path calls `POST {baseUrl}/chat/completions` (`apps/daemon/src/creator/*`, `runtime/vishnuai/pkg/openai/openai.go`). A provider qualifies only if it documents that endpoint.

### Cloud

| Preset | Base URL | Default model(s) from docs | Cost | Get a key | Source |
|---|---|---|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | `~openai/gpt-sol-latest`; 16 `:free` models live on 2026-10-27, e.g. `google/gemma-4-31b-it:free` | Free models: 50 req/day, 1,000 req/day after buying ≥10 credits; others paid | https://openrouter.ai/keys | [quickstart](https://openrouter.ai/docs/quickstart), [FAQ](https://openrouter.ai/docs/faq), live `GET https://openrouter.ai/api/v1/models` |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-20b` | Free plan + paid Developer plan | https://console.groq.com/keys | [OpenAI compat](https://console.groq.com/docs/openai), [models](https://console.groq.com/docs/models), [rate limits](https://console.groq.com/docs/rate-limits) |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.8-flash` (stable), `gemini-4-argon`, `gemini-3.5-flash-lite` | Free tier + paid tiers | https://aistudio.google.com/apikey | [OpenAI compat](https://ai.google.dev/gemini-api/docs/openai), [models](https://ai.google.dev/gemini-api/docs/models), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) |
| Anthropic Claude | `https://api.anthropic.com/v1/` | `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | Paid | https://platform.claude.com/settings/keys | [OpenAI SDK compat](https://platform.claude.com/docs/en/api/openai-sdk) |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest`, `mistral-small-latest` | Paid (free experimentation tier not confirmed) | https://console.mistral.ai/api-keys | [API reference](https://docs.mistral.ai/api) |
| Moonshot Kimi | `https://api.moonshot.ai/v1` | `kimi-k3.1-pro`, `kimi-k3.1-pro-highspeed` | Paid | https://platform.kimi.ai/console/api-keys | [start guide](https://platform.kimi.ai/docs/guide/start-using-kimi-api) |
| Z.ai GLM | `https://api.z.ai/api/paas/v4/` | `glm-5.3` | Paid | https://z.ai/manage-apikey/apikey-list | [OpenAI compat](https://docs.z.ai/guides/develop/openai/python) |
| Together AI | `https://api.together.ai/v1` | `MiniMaxAI/MiniMax-M3` | Paid | https://api.together.ai/settings/api-keys | [OpenAI compat](https://docs.together.ai/docs/openai-api-compatibility) |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p1-8b-instruct` | Paid | https://fireworks.ai/account/api-keys | [OpenAI compat](https://docs.fireworks.ai/tools-sdks/openai-compatibility) |
| Cerebras | `https://api.cerebras.ai/v1` | `gpt-oss-120b`, `qwen-3.8-27b` | Free trial + pay as you go | https://cloud.cerebras.ai | [OpenAI compat](https://inference-docs.cerebras.ai/resources/openai), [models](https://inference-docs.cerebras.ai/models/overview) |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `deepseek-ai/deepseek-v4-flash`, `openai/gpt-oss-120b`, `nvidia/nemotron-3-super-120b-a12b` | Not stated in docs | https://build.nvidia.com | [LLM APIs](https://docs.api.nvidia.com/nim/reference/llm-apis) |
| Hugging Face | `https://router.huggingface.co/v1` | `openai/gpt-oss-120b:fastest` (suffix `:cheapest`, `:fastest`, or `:<provider>`) | Pay as you go; monthly credits for PRO / Team | https://huggingface.co/settings/tokens | [Inference Providers](https://huggingface.co/docs/inference-providers/index) |

### Local (runs on this PC, no account)

| Preset | Base URL | Key | Source |
|---|---|---|---|
| Ollama | `http://localhost:11434/v1` | Any value; Ollama ignores it | [OpenAI compat](https://docs.ollama.com/api/openai-compatibility) |
| LM Studio | `http://localhost:1234/v1` | Not required | [OpenAI endpoints](https://lmstudio.ai/docs/app/api/endpoints/openai) |
| llama.cpp `llama-server` | `http://127.0.0.1:9931/v1` (**default port is now 9931**) | Only if started with `--api-key` | [server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) |
| vLLM | `http://localhost:8000/v1` | Placeholder `EMPTY` unless started with `--api-key` / `VLLM_API_KEY` | [quickstart](https://docs.vllm.ai/en/latest/getting_started/quickstart/) |
| Jan | `http://127.0.0.1:1337/v1` | Optional; must match the key set in Jan | [API server](https://docs.jan.ai/desktop/api-server) |

### Checked and not added

| Provider | Why |
|---|---|
| GitHub Models | **Retired on 2026-07-30** ([docs](https://docs.github.com/en/github-models/quickstart)) |
| xAI Grok | Docs and API reference document only the Responses API (`/v1/responses`), not `chat/completions` ([API reference](https://docs.x.ai/docs/api-reference)). Add once the creator text path supports Responses |
| Alibaba Qwen (Model Studio) | The OpenAI-compatible URL is now per workspace: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` ([docs](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope)); the docs list the same host for Beijing, which looks like an error. Use the Custom preset with your workspace URL until a workspace field exists |
| SambaNova | Base URL not found in the current docs (compatibility page returns 404). Models listed: `DeepSeek-V3.1`, `Meta-Llama-3.3-70B-Instruct`, `gpt-oss-120b` ([models](https://docs.sambanova.ai/cloud/docs/get-started/supported-models)) |

### Compatibility risks to confirm with a real call (T8.5)

- The `vishnuai` CLI always sends `reasoning_effort: "none"` and often `response_format` (`runtime/vishnuai/pkg/openai/openai.go`). Claude's compatibility layer **ignores** both ([docs](https://platform.claude.com/docs/en/api/openai-sdk)), so JSON output is not guaranteed. Other providers may reject `"none"`.
- Claude 4.7 and later return **400** for `temperature` below 1 or a non-default `top_p`. The creator path sends `temperature` only for DeepSeek models, so Claude presets are not affected today.
- Anthropic marks its OpenAI compatibility layer as "not … long-term or production-ready" and recommends the native API.

### Khmer support

None of these text providers documents a Khmer quality guarantee. Khmer translation quality must be checked per model with the real Khmer rules prompt (T8.5).

Live results so far (2026-10-27, CLI-shaped request with `response_format: json_object` and `reasoning_effort: "none"`):

| Provider | Model | HTTP | Khmer result | Time (CPU) |
|---|---|---|---|---|
| Ollama (local) | `gemma4:latest` | 200 | Correct: `ជំរាបសួរអ្នកទាំងអស់គ្នាសូមស្វាគមន៍មកកម្ពុជា។` | 92.7 s |
| Ollama (local) | `qwen3:4b` | 200 | Valid JSON but **no Khmer text** | 19.2 s |

## Voice / TTS (T8.7) — checked 2026-10-27

| Provider | Khmer | Endpoint and auth | Cost | Get a key | Decision | Source |
|---|---|---|---|---|---|---|
| **Azure Speech** | ✅ `km-KH-SreymomNeural` (female), `km-KH-PisethNeural` (male) | `POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`, header `Ocp-Apim-Subscription-Key`, SSML body, `X-Microsoft-OutputFormat` (e.g. `audio-24khz-96kbitrate-mono-mp3`, `audio-48khz-192kbitrate-mono-mp3`, `riff-24khz-16bit-mono-pcm`), `User-Agent` | Free F0 tier: 0.5 million characters/month (neural); paid beyond | Azure portal → Speech resource → Keys and Endpoint | **Built** | [language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts), [REST TTS](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech), [pricing](https://azure.microsoft.com/en-us/pricing/details/speech/) |
| **ElevenLabs** | ❌ not in any model's language list | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=…`, header `xi-api-key`, JSON `text`, `model_id`, `voice_settings.speed`; voices `GET /v2/voices` | Paid (some formats need paid tier) | [API keys docs](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys) | **Built** (non-Khmer languages) | [convert](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [models](https://elevenlabs.io/docs/overview/models), [voices](https://elevenlabs.io/docs/api-reference/voices/search), [auth](https://elevenlabs.io/docs/api-reference/authentication) |
| **Fish Audio** | ❓ S2.1 supports 83 languages; list not published | `POST https://api.fish.audio/v1/tts`, `Authorization: Bearer`, header `model` (`s2.1-pro-free`, `s2.1-pro`, `s2-pro`, `s1`, `drama-3`), JSON `text`, `reference_id`, `format`, `prosody.speed`; voices `GET https://api.fish.audio/model` | Free developer model `s2.1-pro-free` ($0, no TTFA/DPA guarantees); paid models | https://fish.audio/app/api-keys | **Built** — test Khmer live | [TTS](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech), [list models](https://docs.fish.audio/api-reference/endpoint/model/list-models), [models](https://docs.fish.audio/developer-guide/models-pricing/models-overview), [quickstart](https://docs.fish.audio/developer-guide/getting-started/quickstart) |
| Google Cloud TTS | ❌ no `km-KH` in the voice list | `POST https://texttospeech.googleapis.com/v1/text:synthesize`; docs show OAuth (`gcloud auth print-access-token`), API-key use for TTS not documented | — | — | **Not built**: no Khmer, and API-key auth unconfirmed | [voices](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types), [synthesize](https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize), [quickstart](https://docs.cloud.google.com/text-to-speech/docs/create-audio-text-command-line) |
| Local VoxCPM2 (dub engine) | ✅ per VoxCPM README | Engine `/v1/tts/*` | Free, local | — | **Built & verified** (`openbmb/VoxCPM2` weights downloaded in T5.1; `voxcpm2_default_speaker` and `voxcpm2_training_reader` served via `/v1/tts/voices/list`) | `services/dub-engine` |

Notes:
- Azure documents a full voice list only on per-resource endpoints (`https://{resource}.cognitiveservices.azure.com/tts/cognitiveservices/voices/list`). The preset uses the regional endpoint, so it ships the two documented Khmer voices and lets users type any other Azure voice name.
- These providers work in **Text to Speech, Smart Dubbing and stick-figure videos** (TypeScript speech service). **Video translation** dubs inside the `vishnuai` CLI, which now also supports Azure, ElevenLabs and Fish Audio (T8.11, Go clients in `runtime/vishnuai/pkg/{azure,elevenlabs,fishaudio}`); real dub runs still need the owner's keys.

## Transcription (T8.6) — researched 2026-10-28

Adapter targets; live Khmer verification still pending owner keys. Endpoints not fully quoted below are marked "confirm at implementation" — copy them from the linked docs when writing the adapter.

| Provider | Khmer | Endpoint and auth | Models | Cost | Source |
|---|---|---|---|---|---|
| **Groq Whisper** | ✅ `km` is in the documented `language` enum | `POST https://api.groq.com/openai/v1/audio/transcriptions`, multipart (`file`, `model`, optional `language`, `prompt`, `response_format` json/text/verbose_json), `Authorization: Bearer` | `whisper-large-v3`, `whisper-large-v3-turbo` | Free plan available | [speech-to-text](https://console.groq.com/docs/speech-to-text), [whisper-large-v3](https://console.groq.com/docs/model/whisper-large-v3) |
| **AssemblyAI** | ✅ `km` is "Live" but in the fair-accuracy band (>50% WER) | Async flow: upload the file, then create a transcript with `language_code`; results polled (confirm exact paths at implementation) | Universal (99 languages) | Paid with free tier | [languages](https://www.assemblyai.com/docs/pre-recorded-audio/supported-languages), [Khmer page](https://www.assemblyai.com/languages/khmer) |
| **ElevenLabs Scribe** | ✅ Khmer listed (Scribe v1: FLEURS WER 3.1% claimed; Scribe v2: moderate >25–50% WER) | Multipart speech-to-text endpoint; ISO-639-3 codes (`khm`) (confirm exact path at implementation) | `scribe_v1`, `scribe_v2` | Free tier + paid | [capabilities](https://elevenlabs.io/docs/overview/capabilities/speech-to-text), [Khmer page](https://elevenlabs.io/speech-to-text/khmer) |
| **Gemini** | ✅ auto-detects 85+ languages (language list on the model page) | `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent` with `x-goog-api-key`; audio via Files API upload (>20 MB) or inline base64 (<20 MB); fileData part | `gemini-3.5-transcribe` (unary), `gemini-3.5-transcribe-live` (WebSocket) | Free tier + paid | [transcription guide](https://ai.google.dev/gemini-api/docs/generate-content/transcribe), [model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe) |
| **Deepgram** | ❌ no Khmer in the nova-3 multi (55 languages) or nova language lists | `POST https://api.deepgram.com/v1/listen` (query params), `Authorization: Token <key>` | `nova-3` (multi), `nova-2` | Paid with free credit | [languages overview](https://developers.deepgram.com/docs/models-languages-overview), [nova-3 prompting](https://developers.deepgram.com/docs/nova-3-language-prompting) |

Notes for adapter work:
- Groq can reuse the existing OpenAI-compatible whisper client (`runtime/vishnuai/pkg/whisper` / `pkg/openai`) with base `https://api.groq.com/openai/v1` — same `/audio/transcriptions` shape as OpenAI.
- Deepgram is the only one of the five without Khmer; include it only if a non-Khmer fallback is wanted.
- Gemini needs its own client (Files API + generateContent), not the OpenAI transcription shape; word-level timestamps/diarization are limited to 30-minute audio.

## Image (T8.8) — researched 2026-10-28

| Provider | Endpoint and auth | Notes | Source |
|---|---|---|---|
| **fal.ai (FLUX)** | Queue: `POST https://queue.fal.run/{owner}/{app}` (e.g. `fal-ai/flux/schnell`, `fal-ai/flux-1/dev`); sync: `https://fal.run/...`; `Authorization: Key <FAL_KEY>`; submit → `request_id` + `status_url`/`response_url` → poll (202 in queue, 200 done) → result images URLs | Asynchronous queue API; status/cancel URLs come from the submit response, not built by hand | [FLUX dev API](https://fal.ai/models/fal-ai/flux-1/dev/api), [queue docs](https://fal.ai/docs/documentation/model-apis/inference/queue) |
| **Stability AI** | `POST https://api.stability.ai/v2beta/stable-image/generate/core` (also `/generate/sd3`), multipart `prompt` (+`aspect_ratio`, `negative_prompt`, `seed`, `style_preset`, `output_format`), `Authorization: Bearer`, `accept: image/*` returns bytes or `application/json` returns base64 | Stable Image Core: 3 credits per generation, 1.5 MP output; 10 MiB max for image-to-image | [core](https://docs.stability.ai/api-reference/generate/stable-image-core), [sd3.5](https://docs.stability.ai/api-reference/generate/stable-diffusion-35) |
| **Replicate (FLUX)** | `POST https://api.replicate.com/v1/predictions` with `version` in `{owner}/{name}` format for official models (e.g. `black-forest-labs/flux-schnell`), `Authorization: Bearer r8_…`, optional `Prefer: wait` (up to 60 s) then poll the prediction | Official and community models unified on one endpoint since 2025-08 | [HTTP reference](https://replicate.com/docs/reference/http), [changelog](https://replicate.com/changelog/2025-08-05-run-all-models-with-the-same-api-endpoint) |
| **Local ComfyUI** | Local HTTP API (default port 8188) — workflow/queue endpoints; detail at implementation | Free, local; needs a ComfyUI install and workflow JSON | — |

## Video (T8.9) — researched 2026-10-28

| Provider | Endpoint and auth | Models and limits | Source |
|---|---|---|---|
| **Runway** | Base `https://api.dev.runwayml.com`; `POST /v1/text_to_video`, `POST /v1/image_to_video`; `Authorization: Bearer` + `X-Runway-Version: 2024-11-06` header; task poll `GET /v1/tasks/{id}` (PENDING/THROTTLED/RUNNING/SUCCEEDED/FAILED/CANCELLED); output URLs temporary — download at once | `gen4.5`: ratio `1280:720`/`720:1280`, duration 2–10 s, 1,000-char prompt, both ratio+duration required; 12 credits/second of video (2 s minimum). The API also hosts third-party models (`seedance2`, …) with per-model fields | [essentials](https://docs.dev.runwayml.com/ai-context.md), [reference](https://docs.dev.runwayml.com/api/) |
| **Luma Dream Machine** | `POST https://api.lumalabs.ai/dream-machine/v1/generations` (also `GET /generations/{id}` to poll), `Authorization: Bearer luma-…`; key from https://platform.lumalabs.ai | Models `ray-2`, `ray-flash-2`; aspect `16:9` etc.; resolution 540p/720p/1080/4k; duration `5s`…; keyframes for image-to-video. Docs now point to a newer "Luma API" platform — confirm the current base at implementation | [create generation](https://docs.lumalabs.ai/reference/creategeneration), [video guide](https://docs.lumalabs.ai/docs/video-generation) |
| **MiniMax Hailuo** | Platform https://platform.minimax.io API, `Authorization: Bearer <api_key>` (Account Management → API Keys); create task + query task endpoints (v2 create documented under api-reference/video-generation-v2-create — copy the exact path at implementation) | `MiniMax-H3`, `-H3-Highspeed`, `-H3-Lite`, `-H3-Max` (and legacy `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-02`): text-to-video, first/last-frame image-to-video, reference-to-video; 768P/2K (H3), 480P/768P (Lite/Max), duration 4–15 s; ratio required for text-to-video; body ≤ 64 MB, media by URL | [create v2](https://platform.minimax.io/docs/api-reference/video-generation-v2-create), [text-to-video](https://platform.minimax.io/docs/api-reference/video-generation-t2v) |
| **Local ComfyUI** | Local HTTP API (default port 8188); detail at implementation | Free, local | — |
