export type CreatorProviderKind = 'llm' | 'image' | 'video' | 'tts' | 'transcription';
export type CreatorProviderProtocol = 'openai-compatible' | 'gemini' | 'kling' | 'custom' | 'local';
export type CreatorProviderStatus = 'supported' | 'experimental' | 'planned';
export type CreatorProviderCredential = 'apiKey' | 'accessKey' | 'secretKey' | 'region';
/** How the provider is paid for, from its official docs (docs/providers/provider-research-2026-10.md). */
export type CreatorProviderAccess = 'free-tier' | 'paid' | 'local';

export type CreatorProviderModel = {
  id: string;
  label: string;
  recommended?: boolean;
  capabilities?: readonly string[];
};

export type CreatorProviderCatalogEntry = {
  id: string;
  kind: CreatorProviderKind;
  label: string;
  protocol: CreatorProviderProtocol;
  defaultBaseUrl?: string;
  models: readonly CreatorProviderModel[];
  credentials: readonly CreatorProviderCredential[];
  capabilities?: readonly string[];
  status: CreatorProviderStatus;
  access?: CreatorProviderAccess;
  /** Page where the user creates an API key. */
  keyUrl?: string;
  /** Documented placeholder for local servers that ignore the key. */
  placeholderApiKey?: string;
};

const entry = (value: CreatorProviderCatalogEntry) => value;

export const creatorProviderCatalog = [
  entry({ id: 'openai', kind: 'llm', label: 'OpenAI', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', recommended: true }], credentials: ['apiKey'], status: 'supported', access: 'paid', keyUrl: 'https://platform.openai.com/api-keys' }),
  entry({ id: 'deepseek', kind: 'llm', label: 'DeepSeek', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.deepseek.com', models: [{ id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', recommended: true }, { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' }, { id: 'deepseek-flash', label: 'DeepSeek Flash' }], credentials: ['apiKey'], status: 'supported' }),
  entry({ id: 'minimax', kind: 'llm', label: 'MiniMax', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.minimax.io', models: [{ id: 'MiniMax-M2.7', label: 'MiniMax M2.7', recommended: true }, { id: 'MiniMax-M2.7-highspeed', label: 'MiniMax M2.7 Highspeed' }, { id: 'MiniMax-M2.5', label: 'MiniMax M2.5' }, { id: 'MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed' }], credentials: ['apiKey'], status: 'supported' }),
  // Cloud and local presets below are verified against official docs on 2026-10-27
  // (docs/providers/provider-research-2026-10.md). They stay experimental until a
  // live chat/completions call is recorded for each (T8.5).
  entry({ id: 'openrouter', kind: 'llm', label: 'OpenRouter', protocol: 'openai-compatible', defaultBaseUrl: 'https://openrouter.ai/api/v1', models: [{ id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)', recommended: true }, { id: '~openai/gpt-sol-latest', label: 'GPT Sol (latest)' }], credentials: ['apiKey'], status: 'experimental', access: 'free-tier', keyUrl: 'https://openrouter.ai/keys' }),
  entry({ id: 'groq', kind: 'llm', label: 'Groq', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.groq.com/openai/v1', models: [{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', recommended: true }, { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' }, { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' }, { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' }], credentials: ['apiKey'], status: 'experimental', access: 'free-tier', keyUrl: 'https://console.groq.com/keys' }),
  entry({ id: 'gemini', kind: 'llm', label: 'Google Gemini', protocol: 'openai-compatible', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', models: [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', recommended: true }, { id: 'gemini-4-argon', label: 'Gemini 4 Argon' }, { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' }], credentials: ['apiKey'], status: 'experimental', access: 'free-tier', keyUrl: 'https://aistudio.google.com/apikey' }),
  entry({ id: 'anthropic', kind: 'llm', label: 'Anthropic Claude', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.anthropic.com/v1/', models: [{ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', recommended: true }, { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }, { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }], credentials: ['apiKey'], status: 'experimental', access: 'paid', keyUrl: 'https://platform.claude.com/settings/keys' }),
  entry({ id: 'mistral', kind: 'llm', label: 'Mistral', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.mistral.ai/v1', models: [{ id: 'mistral-large-latest', label: 'Mistral Large (latest)', recommended: true }, { id: 'mistral-small-latest', label: 'Mistral Small (latest)' }], credentials: ['apiKey'], status: 'experimental', access: 'paid', keyUrl: 'https://console.mistral.ai/api-keys' }),
  entry({ id: 'moonshot', kind: 'llm', label: 'Moonshot Kimi', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.moonshot.ai/v1', models: [{ id: 'kimi-k3.1-pro', label: 'Kimi K3.1 Pro', recommended: true }, { id: 'kimi-k3.1-pro-highspeed', label: 'Kimi K3.1 Pro Highspeed' }], credentials: ['apiKey'], status: 'experimental', access: 'paid', keyUrl: 'https://platform.kimi.ai/console/api-keys' }),
  entry({ id: 'zai', kind: 'llm', label: 'Z.ai GLM', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.z.ai/api/paas/v4/', models: [{ id: 'glm-5.3', label: 'GLM 5.3', recommended: true }], credentials: ['apiKey'], status: 'experimental', access: 'paid', keyUrl: 'https://z.ai/manage-apikey/apikey-list' }),
  entry({ id: 'together', kind: 'llm', label: 'Together AI', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.together.ai/v1', models: [{ id: 'MiniMaxAI/MiniMax-M3', label: 'MiniMax M3', recommended: true }], credentials: ['apiKey'], status: 'experimental', access: 'paid', keyUrl: 'https://api.together.ai/settings/api-keys' }),
  entry({ id: 'fireworks', kind: 'llm', label: 'Fireworks', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.fireworks.ai/inference/v1', models: [{ id: 'accounts/fireworks/models/llama-v3p1-8b-instruct', label: 'Llama 3.1 8B Instruct', recommended: true }], credentials: ['apiKey'], status: 'experimental', access: 'paid', keyUrl: 'https://fireworks.ai/account/api-keys' }),
  entry({ id: 'cerebras', kind: 'llm', label: 'Cerebras', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.cerebras.ai/v1', models: [{ id: 'gpt-oss-120b', label: 'GPT-OSS 120B', recommended: true }, { id: 'qwen-3.8-27b', label: 'Qwen 3.8 27B' }], credentials: ['apiKey'], status: 'experimental', access: 'free-tier', keyUrl: 'https://cloud.cerebras.ai' }),
  entry({ id: 'nvidia', kind: 'llm', label: 'NVIDIA NIM', protocol: 'openai-compatible', defaultBaseUrl: 'https://integrate.api.nvidia.com/v1', models: [{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', recommended: true }, { id: 'deepseek-ai/deepseek-v4-flash', label: 'DeepSeek V4 Flash' }, { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B' }], credentials: ['apiKey'], status: 'experimental', keyUrl: 'https://build.nvidia.com' }),
  entry({ id: 'huggingface', kind: 'llm', label: 'Hugging Face', protocol: 'openai-compatible', defaultBaseUrl: 'https://router.huggingface.co/v1', models: [{ id: 'openai/gpt-oss-120b:fastest', label: 'GPT-OSS 120B (fastest provider)', recommended: true }, { id: 'openai/gpt-oss-120b:cheapest', label: 'GPT-OSS 120B (cheapest provider)' }], credentials: ['apiKey'], status: 'experimental', access: 'paid', keyUrl: 'https://huggingface.co/settings/tokens' }),
  // Ollama: live call recorded 2026-10-27 (T8.5); gemma4 returned correct Khmer,
  // qwen3:4b returned none, so Khmer quality is per model, per T8.4.
  entry({ id: 'ollama', kind: 'llm', label: 'Ollama (local)', protocol: 'local', defaultBaseUrl: 'http://localhost:11434/v1', models: [{ id: 'gemma4:latest', label: 'Gemma 4 (good Khmer)', recommended: true }], credentials: [], capabilities: ['khmer'], status: 'supported', access: 'local', placeholderApiKey: 'ollama' }),
  entry({ id: 'lmstudio', kind: 'llm', label: 'LM Studio (local)', protocol: 'local', defaultBaseUrl: 'http://localhost:1234/v1', models: [], credentials: [], status: 'experimental', access: 'local', placeholderApiKey: 'lm-studio' }),
  entry({ id: 'llamacpp', kind: 'llm', label: 'llama.cpp server (local)', protocol: 'local', defaultBaseUrl: 'http://127.0.0.1:9931/v1', models: [], credentials: [], status: 'experimental', access: 'local', placeholderApiKey: 'llama-cpp' }),
  entry({ id: 'vllm', kind: 'llm', label: 'vLLM (local)', protocol: 'local', defaultBaseUrl: 'http://localhost:8000/v1', models: [], credentials: [], status: 'experimental', access: 'local', placeholderApiKey: 'EMPTY' }),
  entry({ id: 'jan', kind: 'llm', label: 'Jan (local)', protocol: 'local', defaultBaseUrl: 'http://127.0.0.1:1337/v1', models: [], credentials: [], status: 'experimental', access: 'local', placeholderApiKey: 'jan' }),
  entry({ id: 'custom', kind: 'llm', label: 'Custom OpenAI-compatible', protocol: 'custom', models: [], credentials: ['apiKey'], status: 'supported' }),
  entry({ id: 'openai', kind: 'image', label: 'OpenAI', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-image-2', label: 'GPT Image', recommended: true }], credentials: ['apiKey'], capabilities: ['text-to-image', 'image-edit', 'reference-image'], status: 'supported' }),
  entry({ id: 'jimeng', kind: 'image', label: 'Jimeng / Seedream', protocol: 'openai-compatible', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: [{ id: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0', recommended: true }], credentials: ['apiKey'], capabilities: ['text-to-image'], status: 'supported' }),
  entry({ id: 'kling', kind: 'image', label: 'Kling', protocol: 'kling', defaultBaseUrl: 'https://api-beijing.klingai.com', models: [{ id: 'kling-v2-1', label: 'Kling v2.1', recommended: true }], credentials: ['accessKey', 'secretKey'], capabilities: ['text-to-image'], status: 'supported' }),
  entry({ id: 'gemini', kind: 'image', label: 'Nano Banana / Gemini', protocol: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: [{ id: 'gemini-2.5-flash-image', label: 'Nano Banana', recommended: true }], credentials: ['apiKey'], capabilities: ['text-to-image', 'reference-image'], status: 'supported' }),
  entry({ id: 'codex-native', kind: 'image', label: 'Local Codex image generation', protocol: 'local', models: [], credentials: [], capabilities: ['text-to-image', 'image-edit', 'reference-image'], status: 'experimental' }),
  // Image presets researched 2026-10-28 (docs/providers/provider-research-2026-10.md, T8.8).
  entry({ id: 'fal', kind: 'image', label: 'fal.ai (FLUX)', protocol: 'custom', defaultBaseUrl: 'https://queue.fal.run', models: [{ id: 'fal-ai/flux/schnell', label: 'FLUX.1 Schnell', recommended: true }, { id: 'fal-ai/flux-1/dev', label: 'FLUX.1 Dev' }, { id: 'fal-ai/flux-pro', label: 'FLUX Pro' }], credentials: ['apiKey'], capabilities: ['text-to-image'], status: 'experimental', access: 'paid', keyUrl: 'https://fal.ai/dashboard/keys' }),
  entry({ id: 'stability', kind: 'image', label: 'Stability AI', protocol: 'custom', defaultBaseUrl: 'https://api.stability.ai', models: [{ id: 'core', label: 'Stable Image Core', recommended: true }, { id: 'sd3.5-large', label: 'Stable Diffusion 3.5 Large' }], credentials: ['apiKey'], capabilities: ['text-to-image', 'image-edit', 'reference-image'], status: 'experimental', access: 'paid', keyUrl: 'https://platform.stability.ai/account/keys' }),
  entry({ id: 'replicate', kind: 'image', label: 'Replicate (FLUX)', protocol: 'custom', defaultBaseUrl: 'https://api.replicate.com/v1', models: [{ id: 'black-forest-labs/flux-schnell', label: 'FLUX Schnell', recommended: true }, { id: 'black-forest-labs/flux-dev', label: 'FLUX Dev' }], credentials: ['apiKey'], capabilities: ['text-to-image'], status: 'experimental', access: 'paid', keyUrl: 'https://replicate.com/account/api-tokens' }),
  entry({ id: 'together', kind: 'image', label: 'Together AI (FLUX)', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.together.xyz/v1', models: [{ id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 Schnell', recommended: true }, { id: 'black-forest-labs/FLUX.1-dev', label: 'FLUX.1 Dev' }], credentials: ['apiKey'], capabilities: ['text-to-image'], status: 'experimental', access: 'paid', keyUrl: 'https://api.together.ai/settings/api-keys' }),
  entry({ id: 'comfyui', kind: 'image', label: 'ComfyUI (Local)', protocol: 'local', defaultBaseUrl: 'http://127.0.0.1:8188', models: [{ id: 'flux-schnell', label: 'FLUX Schnell', recommended: true }], credentials: [], capabilities: ['text-to-image'], status: 'experimental', access: 'local', placeholderApiKey: 'comfyui' }),
  entry({ id: 'seedance', kind: 'video', label: 'Seedance', protocol: 'openai-compatible', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: [{ id: 'doubao-seedance-2-5-260628', label: 'Seedance 2.5', recommended: true }], credentials: ['apiKey'], capabilities: ['text-to-video', 'image-to-video'], status: 'supported' }),
  entry({ id: 'kling-video', kind: 'video', label: 'Kling', protocol: 'kling', defaultBaseUrl: 'https://api-beijing.klingai.com', models: [{ id: 'kling-v2-1-master', label: 'Kling v2.1 Master', recommended: true }], credentials: ['accessKey', 'secretKey'], capabilities: ['text-to-video', 'image-to-video'], status: 'supported' }),
  entry({ id: 'veo', kind: 'video', label: 'Veo', protocol: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: [{ id: 'veo-3.1-generate-preview', label: 'Veo 3.1', recommended: true }], credentials: ['apiKey'], capabilities: ['text-to-video', 'image-to-video'], status: 'supported' }),
  entry({ id: 'openai-tts', kind: 'tts', label: 'OpenAI Voice', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.openai.com/v1', models: [{ id: 'gpt-4o-mini-tts', label: 'GPT-4o mini TTS', recommended: true }], credentials: ['apiKey'], capabilities: ['speech-generation', 'voice-preview'], status: 'supported' }),
  entry({ id: 'minimax-tts', kind: 'tts', label: 'MiniMax Voice', protocol: 'openai-compatible', defaultBaseUrl: 'https://api.minimax.io', models: [{ id: 'speech-2.8-hd', label: 'Speech 2.8 HD', recommended: true }], credentials: ['apiKey'], capabilities: ['speech-generation', 'voice-preview'], status: 'supported' }),
  entry({ id: 'aliyun-tts', kind: 'tts', label: 'Alibaba Cloud Voice', protocol: 'openai-compatible', defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1', models: [{ id: 'qwen3-tts-flash', label: 'Qwen3 TTS Flash', recommended: true }], credentials: ['apiKey'], capabilities: ['speech-generation', 'voice-preview'], status: 'supported' }),
  entry({ id: 'edge-tts', kind: 'tts', label: 'Edge TTS', protocol: 'custom', models: [], credentials: [], capabilities: ['speech-generation'], status: 'supported' }),
  // Voice presets researched 2026-10-27 (docs/providers/provider-research-2026-10.md, T8.7).
  // Catalog ids match the CreatorTtsProvider ids so settings can look them up directly.
  entry({ id: 'azure', kind: 'tts', label: 'Azure Speech', protocol: 'custom', defaultBaseUrl: 'https://southeastasia.tts.speech.microsoft.com', models: [{ id: '24khz', label: '24 kHz', recommended: true }, { id: '48khz', label: '48 kHz high fidelity' }], credentials: ['apiKey'], capabilities: ['speech-generation', 'khmer'], status: 'experimental', access: 'free-tier', keyUrl: 'https://portal.azure.com' }),
  entry({ id: 'elevenlabs', kind: 'tts', label: 'ElevenLabs', protocol: 'custom', defaultBaseUrl: 'https://api.elevenlabs.io', models: [{ id: 'eleven_multilingual_v2', label: 'Multilingual v2', recommended: true }, { id: 'eleven_v3', label: 'Eleven v3' }, { id: 'eleven_v4', label: 'Eleven v4' }, { id: 'eleven_flash_v2_5', label: 'Flash v2.5' }], credentials: ['apiKey'], capabilities: ['speech-generation'], status: 'experimental', access: 'paid', keyUrl: 'https://elevenlabs.io/docs/overview/administration/workspaces/api-keys' }),
  entry({ id: 'fishaudio', kind: 'tts', label: 'Fish Audio', protocol: 'custom', defaultBaseUrl: 'https://api.fish.audio', models: [{ id: 's2.1-pro-free', label: 'S2.1 Pro (free developer tier)', recommended: true }, { id: 's2.1-pro', label: 'S2.1 Pro' }, { id: 's2-pro', label: 'S2 Pro' }], credentials: ['apiKey'], capabilities: ['speech-generation'], status: 'experimental', access: 'free-tier', keyUrl: 'https://fish.audio/app/api-keys' })
] as const;

export const creatorProviderCatalogById = {
  llm: Object.fromEntries(creatorProviderCatalog.filter(item => item.kind === 'llm').map(item => [item.id, item])),
  image: Object.fromEntries(creatorProviderCatalog.filter(item => item.kind === 'image').map(item => [item.id, item]))
} as Record<'llm' | 'image', Record<string, CreatorProviderCatalogEntry>>;

export function creatorProvidersOfKind(kind: CreatorProviderKind): readonly CreatorProviderCatalogEntry[] {
  return creatorProviderCatalog.filter(provider => provider.kind === kind);
}

export function creatorProviderOfKind(
  kind: CreatorProviderKind,
  id: string
): CreatorProviderCatalogEntry | undefined {
  return creatorProviderCatalog.find(provider => provider.kind === kind && provider.id === id);
}
