# Provider research — October 2026 (T8.1)

Sources were checked on **2026-10-27**. Base URLs and model IDs below are copied from each provider's official docs, not from memory. Re-check before relying on them: model IDs change often, which is why the app also loads the live model list from each provider (T8.4).

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
| Local VoxCPM2 (dub engine) | ✅ per VoxCPM README | Engine `/v1/tts/*` | Free, local | — | **Waits on T5.1** (no model weights downloaded) | `services/dub-engine` |

Notes:
- Azure documents a full voice list only on per-resource endpoints (`https://{resource}.cognitiveservices.azure.com/tts/cognitiveservices/voices/list`). The preset uses the regional endpoint, so it ships the two documented Khmer voices and lets users type any other Azure voice name.
- These providers work in **Text to Speech, Smart Dubbing and stick-figure videos** (TypeScript speech service). **Video translation** dubs inside the `vishnuai` CLI, which only supports OpenAI, Alibaba, Edge TTS, MiniMax and Volcengine; preflight blocks the new providers there with a clear message (follow-up task T8.11).

## Transcription, image, video

To be researched under T8.6, T8.8 and T8.9.
