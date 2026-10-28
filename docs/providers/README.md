# AI service providers - user guide

This guide matches what **Settings → AI Services** shows in the app, tab by tab. The technical record behind it (endpoints, model IDs, pricing quotes, source links) lives in [provider-research-2026-10.md](provider-research-2026-10.md), checked 2026-10-27.

Statuses the app shows:

- **supported** - a real call or local run was recorded for this provider.
- **experimental** - researched against official docs; still waiting for a recorded live call.

Khmer notes: the app shows a small note under each text provider. Ollama is the only provider with a recorded Khmer result so far (`gemma4` produced correct Khmer; `qwen3` produced none), so its note names the model; every other provider shows a "not verified yet" note. No cloud provider documents a Khmer quality guarantee.

## Configuring a provider

1. Settings → AI Services → **Usage mode: Custom configuration**.
2. Pick the tab (Models, Transcription, Voice, Dub Engine, Images, Video).
3. Choose the provider, paste its API key, and use **Load models from service** when offered.
4. **Save settings**. Credentials are stored locally in the app's configuration file.

## Models (text AI)

The default text path runs through the **local Codex runtime** (uses the app's own sign-in, no separate key). The providers below are for the **Custom model service** mode.

### Local - free, no account, runs on this PC

| Provider | Key | Notes |
|---|---|---|
| Ollama | Any value (ignored) | Install [Ollama](https://ollama.com), pull a model (e.g. `gemma4`), start the app. Default `http://localhost:11434/v1`. |
| LM Studio | Not required | Start the local server in LM Studio. Default `http://localhost:1234/v1`. |
| llama.cpp server | Only if started with `--api-key` | Run `llama-server`. Default `http://127.0.0.1:9931/v1`. |
| vLLM | `EMPTY` unless started with a key | Default `http://localhost:8000/v1`. |
| Jan | Optional | Match the key set in Jan. Default `http://127.0.0.1:1337/v1`. |

Khmer on local models depends on the model: Gemma 4 (`gemma4:latest`) produced correct Khmer in the recorded live test; Qwen 3-type models may output no Khmer.

### Cloud with a free tier

| Provider | Get a key | Free tier (from official docs, 2026-10-27) |
|---|---|---|
| OpenRouter | https://openrouter.ai/keys | Free-tagged models: 50 requests/day (1,000/day after buying ≥10 credits). |
| Groq | https://console.groq.com/keys | Free plan; paid Developer plan beyond. |
| Google Gemini | https://aistudio.google.com/apikey | Free tier; paid tiers beyond. |
| Cerebras | https://cloud.cerebras.ai | Free trial, then pay as you go. |

### Cloud paid

| Provider | Get a key |
|---|---|
| OpenAI | https://platform.openai.com/api-keys |
| Anthropic Claude | https://platform.claude.com/settings/keys |
| Mistral | https://console.mistral.ai/api-keys |
| Moonshot Kimi | https://platform.kimi.ai/console/api-keys |
| Z.ai GLM | https://z.ai/manage-apikey/apikey-list |
| Together AI | https://api.together.ai/settings/api-keys |
| Fireworks | https://fireworks.ai/account/api-keys |
| Hugging Face | https://huggingface.co/settings/tokens |
| DeepSeek | Provider console (no key link in the app) |
| MiniMax | Provider console (no key link in the app) |
| NVIDIA NIM | https://build.nvidia.com (cost not stated in docs) |

Claude compatibility notes: the OpenAI-compatibility layer ignores JSON mode and some sampling controls, and marks itself as not production-ready. Prefer local models or other presets for Khmer subtitle work until verified (see the research doc).

## Voice (text to speech)

| Provider | Khmer | Cost | Get a key | Notes |
|---|---|---|---|---|
| Azure Speech | ✅ `km-KH-SreymomNeural`, `km-KH-PisethNeural` | Free tier: 0.5 M characters/month (neural); paid beyond | https://portal.azure.com (Speech resource → **Keys and Endpoint**) | Regional endpoint preset (Southeast Asia); any other Azure voice name can be typed in. |
| Fish Audio | ❓ unverified - test with a short Khmer sentence | Free developer model `s2.1-pro-free`; paid models beyond | https://fish.audio/app/api-keys | Voices are model reference IDs. |
| ElevenLabs | ❌ not in any model's language list | Paid | https://elevenlabs.io/docs/overview/administration/workspaces/api-keys | Use for non-Khmer languages. |
| Edge TTS | ❓ (Microsoft neural voices; verify a Khmer sentence) | Free, no key | — | No style/speed controls. |
| OpenAI Voice | ❌ (language list without Khmer) | Paid | https://platform.openai.com/api-keys | `gpt-4o-mini-tts`. |
| MiniMax Voice | ❓ | Paid | MiniMax console | `speech-2.8-hd`. |
| Alibaba Cloud Voice | ❓ | Paid | Alibaba Cloud console (DashScope) | `qwen3-tts-flash`. |
| Volcengine Voice | ❓ | Paid | Volcengine console (Doubao Voice) | Cluster + voice id. |
| Local VoxCPM2 (dub engine) | ✅ per VoxCPM README | Free, local | — | Waits for model weights (T5.1). |

Where they work: all of the above work in **Text to Speech**, **Smart Dubbing** and stick-figure videos. **Video translation** dubbing runs inside the bundled `vishnuai` CLI and now supports all of them (Azure, ElevenLabs and Fish Audio were added in T8.11); a real dubbed video per provider is still to be verified with the owner's keys.

## Transcription (speech to text)

| Provider | Kind | Cost | Get a key | Notes |
|---|---|---|---|---|
| whisper.cpp | Local | Free | — | Available on Windows x64; models download in the app (tiny 78 MB, large-v3-turbo 1.6 GB, large-v2 3.1 GB, medium 1.5 GB). |
| OpenAI Whisper | Cloud | Paid | https://platform.openai.com/api-keys | `whisper-1`. |
| Alibaba Cloud (Aliyun) | Cloud | Paid | Aliyun console | |
| Volcengine | Cloud | Paid | Volcengine console (Doubao Voice) | Shares TTS credentials. |
| FunASR | Cloud | Paid | FunASR endpoint | `sensevoice`, `paraformer`, `fun-asr-nano`. |
| faster-whisper | Local | Free | — | Not installable on this platform yet. |
| WhisperKit | Local | Free | — | macOS on Apple silicon only. |

## Images

| Provider | Cost | Get a key | Notes |
|---|---|---|---|
| OpenAI (GPT Image) | Paid | https://platform.openai.com/api-keys | Text-to-image, edit, reference image. |
| fal.ai (FLUX) | Paid | https://fal.ai/dashboard/keys | FLUX.1 Schnell, Dev, and Pro via queue API. |
| Stability AI | Paid | https://platform.stability.ai/account/keys | Stable Image Core and SD 3.5 Large. |
| Replicate (FLUX) | Paid | https://replicate.com/account/api-tokens | FLUX Schnell and Dev predictions API. |
| Together AI (FLUX) | Paid | https://api.together.ai/settings/api-keys | FLUX.1 Schnell and Dev images API. |
| ComfyUI (Local) | Local | — | Free, local; runs against local ComfyUI on port 8188. |
| Jimeng / Seedream (Volcengine Ark) | Paid | Volcengine Ark console | Text-to-image. |
| Kling | Paid | Kling AI console | Uses access key + secret key. |
| Nano Banana (Gemini) | Free tier available | https://aistudio.google.com/apikey | Text-to-image, reference image. |
| Local Codex image generation | Local | — | Uses the signed-in app; no separate key. |

## Video generation

| Provider | Cost | Get a key | Notes |
|---|---|---|---|
| Seedance (Volcengine Ark) | Paid | Volcengine Ark console | Text-to-video, image-to-video. |
| Kling | Paid | Kling AI console | Access key + secret key. |
| Veo (Gemini) | Paid | https://aistudio.google.com/apikey | Text-to-video, image-to-video. |

## Dub engine

- **Local engine** - free, runs locally; check the Dub Engine tab shows it ready before starting a task.
- **Remote engine** - paid, requires the remote service to be configured.

## Deliberately not built

| Provider | Why |
|---|---|
| Google Cloud TTS | No Khmer voice; OAuth-only auth for TTS. |
| xAI Grok | Documents only the Responses API, not `chat/completions`. |
| Alibaba Qwen preset | The OpenAI-compatible URL is per workspace - use the **Custom** preset with your workspace URL. |
| SambaNova | Base URL not documented. |
| GitHub Models | Retired 2026-07-30. |
