import { defaultVideoGenerationModels } from './media-generation.js';
import { publicErrorKindForCode, safePublicErrorMessage } from './errors.js';
import type { PublicErrorFacts } from './issues.js';
import type { GatewayVoiceProfile } from './gateway-account.js';

export type OpenAiCompatibleConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export const creatorTtsProviders = ['openai', 'aliyun', 'edge-tts', 'minimax', 'volcengine', 'azure', 'elevenlabs', 'fishaudio'] as const;
/** Providers the bundled vishnuai CLI can synthesize with (video translation dubbing). */
export const vishnuCliTtsProviders = ['openai', 'aliyun', 'edge-tts', 'minimax', 'volcengine', 'azure', 'elevenlabs', 'fishaudio'] as const satisfies readonly CreatorTtsProvider[];
export type CreatorTtsProvider = (typeof creatorTtsProviders)[number];

export const creatorDubEngineProviders = ['local-engine', 'remote-engine'] as const;
export type CreatorDubEngineProvider = (typeof creatorDubEngineProviders)[number];

export const creatorVoiceKinds = ['preset', 'cloned', 'designed'] as const;
export type CreatorVoiceKind = (typeof creatorVoiceKinds)[number];

export function isCreatorVoiceKind(value: unknown): value is CreatorVoiceKind {
  return creatorVoiceKinds.some(kind => kind === value);
}

export type CreatorDubEngineCapabilities = {
  transcription: boolean;
  translation: boolean;
  tts: boolean;
  vocalSeparation: boolean;
  videoComposition: boolean;
  benchmark: boolean;
};

export const defaultCreatorDubEngineCapabilities = (): CreatorDubEngineCapabilities => ({
  transcription: true,
  translation: true,
  tts: true,
  vocalSeparation: true,
  videoComposition: true,
  benchmark: true,
});

export function isCreatorDubEngineProvider(value: unknown): value is CreatorDubEngineProvider {
  return creatorDubEngineProviders.some(provider => provider === value);
}

export const creatorDubEngineModes = ['auto', 'local', 'api-assist', 'remote'] as const;
export type CreatorDubEngineMode = (typeof creatorDubEngineModes)[number];

export type CreatorDubEngineConfig = {
  enabled: boolean;
  mode: CreatorDubEngineMode;
  url: string;
  port: number;
  token: string;
  enginePath: string;
  pythonPath: string;
  autoStart: boolean;
  modelFolder?: string;
};

/** Local dub engine state shown on the dashboard (T6.7). */
export type DubEngineRuntimeState = 'off' | 'not_installed' | 'starting' | 'ready' | 'error';

export type DubEngineRuntimeStatus = {
  state: DubEngineRuntimeState;
  enabled: boolean;
  mode: CreatorDubEngineConfig['mode'];
  /** Where the local engine is expected; empty for remote mode. */
  engineDir: string;
  message?: string;
};

export type DubJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type DubJobProgress = {
  phase: string;
  percent: number;
  message?: string;
  currentStep?: number;
  totalSteps?: number;
  previewAudioUrl?: string;
};

export type DubJobRequest = {
  sourceUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
  ttsProvider: string;
  ttsVoiceId?: string;
  ttsStyle?: string;
  ttsSpeed: number;
  separateVocals: boolean;
  bilingualSubtitles: boolean;
  composeVideo: boolean;
  autoCloneSpeaker?: boolean;
};

export type DubJobResponse = {
  jobId: string;
  status: DubJobStatus;
  message: string;
};

export type DubJobStatusResponse = {
  jobId: string;
  status: DubJobStatus;
  progress: DubJobProgress | null;
  resultUrl: string | null;
  error: string | null;
};

export type DubHardwareProfile = {
  cpuCores: number;
  cpuThreads: number;
  cpuAvx2: boolean;
  cpuAvx512: boolean;
  ramTotalGb: number;
  ramFreeGb: number;
  gpuName: string | null;
  gpuVramGb: number | null;
  cudaVersion: string | null;
  gpuComputeCapability: string | null;
  diskFreeGb: Record<string, number>;
  tier: string;
  tierDescription: string;
};

export type CreatorJobEstimate = {
  mode: 'local' | 'api-assist' | 'remote';
  tier: string;
  durationSeconds: number;
  estimatedTimeSeconds: number;
  estimatedCostUsd: number;
  breakdown: {
    asrSeconds: number;
    asrCostUsd: number;
    translationSeconds: number;
    translationCostUsd: number;
    ttsSeconds: number;
    ttsCostUsd: number;
    separationSeconds: number;
    separationCostUsd: number;
  };
};

export type TimesyncSegmentStatus = 'fit' | 'sped_up' | 'overflow';

export type TimesyncSegmentPlacement = {
  index: number;
  target_start: number;
  target_end: number;
  speech_duration: number;
  tempo: number;
  placed_start: number;
  placed_end: number;
  status: TimesyncSegmentStatus;
  overflow: number;
};

export type TimesyncSummary = {
  segments: number;
  fit: number;
  sped_up: number;
  overflow: number;
  max_tempo: number;
  max_drift: number;
};

export type TimesyncReport = {
  max_speedup: number;
  segments: TimesyncSegmentPlacement[];
  summary: TimesyncSummary;
};

export function estimateDubJob(options: {
  durationSeconds: number;
  mode: 'local' | 'api-assist' | 'remote';
  tier?: string;
  benchmarkTotalSeconds?: number;
}): CreatorJobEstimate {
  const duration = Math.max(1, Math.round(options.durationSeconds));
  const tier = options.tier || 'T1';
  const mode = options.mode;

  const defaultRatioByTier: Record<string, number> = {
    T0: 6.0,
    T1: 3.5,
    T2: 1.2,
    T3: 0.4
  };
  const ratio = options.benchmarkTotalSeconds !== undefined && options.benchmarkTotalSeconds > 0
    ? options.benchmarkTotalSeconds / 10.0
    : (defaultRatioByTier[tier] ?? 3.5);

  if (mode === 'local') {
    const asrSecs = Math.round(duration * (ratio * 0.25));
    const transSecs = Math.round(duration * (ratio * 0.05));
    const ttsSecs = Math.round(duration * (ratio * 0.45));
    const sepSecs = Math.round(duration * (ratio * 0.25));
    const totalSecs = asrSecs + transSecs + ttsSecs + sepSecs;
    return {
      mode: 'local',
      tier,
      durationSeconds: duration,
      estimatedTimeSeconds: totalSecs,
      estimatedCostUsd: 0.0,
      breakdown: {
        asrSeconds: asrSecs,
        asrCostUsd: 0.0,
        translationSeconds: transSecs,
        translationCostUsd: 0.0,
        ttsSeconds: ttsSecs,
        ttsCostUsd: 0.0,
        separationSeconds: sepSecs,
        separationCostUsd: 0.0
      }
    };
  }

  if (mode === 'api-assist') {
    const asrSecs = Math.max(2, Math.round(duration * 0.1));
    const asrCost = Math.round(((duration / 60) * 0.006) * 1000) / 1000;
    const transSecs = Math.max(1, Math.round(duration * 0.05));
    const transCost = 0.002;
    const ttsSecs = Math.round(duration * (ratio * 0.45));
    const sepSecs = Math.round(duration * (ratio * 0.25));
    const totalSecs = asrSecs + transSecs + ttsSecs + sepSecs;
    const totalCost = Math.round((asrCost + transCost) * 1000) / 1000;
    return {
      mode: 'api-assist',
      tier,
      durationSeconds: duration,
      estimatedTimeSeconds: totalSecs,
      estimatedCostUsd: totalCost,
      breakdown: {
        asrSeconds: asrSecs,
        asrCostUsd: asrCost,
        translationSeconds: transSecs,
        translationCostUsd: transCost,
        ttsSeconds: ttsSecs,
        ttsCostUsd: 0.0,
        separationSeconds: sepSecs,
        separationCostUsd: 0.0
      }
    };
  }

  const totalSecs = Math.max(3, Math.round(duration * 0.35));
  return {
    mode: 'remote',
    tier: 'T3',
    durationSeconds: duration,
    estimatedTimeSeconds: totalSecs,
    estimatedCostUsd: 0.0,
    breakdown: {
      asrSeconds: Math.round(totalSecs * 0.25),
      asrCostUsd: 0.0,
      translationSeconds: Math.round(totalSecs * 0.05),
      translationCostUsd: 0.0,
      ttsSeconds: Math.round(totalSecs * 0.45),
      ttsCostUsd: 0.0,
      separationSeconds: Math.round(totalSecs * 0.25),
      separationCostUsd: 0.0
    }
  };
}

export function formatEstimateDuration(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
}

export function formatEstimateCost(costUsd: number): string {
  if (costUsd === 0) return '$0.00 (Free)';
  if (costUsd < 0.01) return '< $0.01';
  return `~$${costUsd.toFixed(3)}`;
}

export function isCreatorTtsProvider(value: unknown): value is CreatorTtsProvider {
  return creatorTtsProviders.some(provider => provider === value);
}

export type CreatorTtsProviderConfig = OpenAiCompatibleConfig & {
  defaultVoiceId: string;
};

/**
 * Doubao Voice / OpenSpeech console credentials.
 * ASR, TTS V1, and TTS V3 share this Access Token; only the wire names differ:
 * ASR and TTS V3 send `X-Api-Access-Key`, while TTS V1 sends
 * `Authorization: Bearer;<token>` and JSON `app.token`.
 */
export type VolcengineSpeechCredentials = {
  appId: string;
  accessToken: string;
};

export type VolcengineTtsConfig = VolcengineSpeechCredentials & {
  baseUrl: string;
  model: string;
  defaultVoiceId: string;
};

export type VolcengineAsrConfig = VolcengineSpeechCredentials & {
  resourceId: string;
  baseUrl: string;
};

export type CreatorTtsVoice = Omit<GatewayVoiceProfile, 'gender'> & {
  id: string;
  name: string;
  provider: CreatorTtsProvider;
  language?: string;
  previewLanguages?: string[];
  gender?: string;
  scenario?: string;
  kind?: 'builtin' | 'custom' | 'designed';
  supportedModels?: string[];
  recommended?: boolean;
};

export type CreatorTtsVoicesResponse = {
  provider: CreatorTtsProvider;
  model: string;
  voices: CreatorTtsVoice[];
};

export type CreatorTtsPreviewRequest = {
  provider: CreatorTtsProvider;
  model?: string;
  voiceId: string;
  text?: string;
  language?: string;
};

export type KlingAiConfig = {
  baseUrl: string;
  accessKey: string;
  secretKey: string;
  model: string;
};

export type AliyunOssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string;
};

export type AliyunSpeechConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  appKey: string;
};

export const creatorTranscriptionProviders = [
  'openai',
  'faster-whisper',
  'whisperkit',
  'whisper.cpp',
  'aliyun',
  'volcengine',
  'funasr',
  'groq',
  'elevenlabs',
  'assemblyai',
  'deepgram'
] as const;
export type CreatorTranscriptionProvider = (typeof creatorTranscriptionProviders)[number];

export function isCreatorTranscriptionProvider(
  value: unknown
): value is CreatorTranscriptionProvider {
  return creatorTranscriptionProviders.some(provider => provider === value);
}

export const creatorImageProviders = [
  'codex-native',
  'openai',
  'jimeng',
  'kling',
  'gemini',
  'fal',
  'stability',
  'replicate',
  'together',
  'comfyui'
] as const;
export type CreatorImageProvider = (typeof creatorImageProviders)[number];

export function isCreatorImageProvider(value: unknown): value is CreatorImageProvider {
  return creatorImageProviders.some(provider => provider === value);
}

export type CreatorServicesConfig = {
  proxy: string;
  llm: OpenAiCompatibleConfig & {
    jsonMode: boolean;
    source: 'codex' | 'custom';
  };
  transcription: {
    provider: CreatorTranscriptionProvider;
    enableGpuAcceleration: boolean;
    openai: OpenAiCompatibleConfig;
    fasterWhisper: { model: 'tiny' | 'medium' | 'large-v2' };
    whisperKit: { model: 'large-v2' };
    whisperCpp: { model: 'tiny' | 'medium' | 'large-v2' | 'large-v3-turbo' };
    aliyun: {
      oss: AliyunOssConfig;
      speech: AliyunSpeechConfig;
    };
    volcengine: VolcengineAsrConfig;
    funasr: OpenAiCompatibleConfig & { timeoutMs: number };
    groq: OpenAiCompatibleConfig;
    elevenlabs: OpenAiCompatibleConfig;
    assemblyai: OpenAiCompatibleConfig;
    deepgram: OpenAiCompatibleConfig;
  };
  tts: {
    provider: CreatorTtsProvider;
    openai: CreatorTtsProviderConfig;
    minimax: CreatorTtsProviderConfig;
    aliyun: CreatorTtsProviderConfig;
    volcengine: VolcengineTtsConfig;
    azure: CreatorTtsProviderConfig;
    elevenlabs: CreatorTtsProviderConfig;
    fishaudio: CreatorTtsProviderConfig;
  };
  image: {
    provider: CreatorImageProvider;
    openai: OpenAiCompatibleConfig;
    jimeng: OpenAiCompatibleConfig;
    kling: KlingAiConfig;
    gemini: OpenAiCompatibleConfig;
    codexNative: Record<never, never>;
    fal: OpenAiCompatibleConfig;
    stability: OpenAiCompatibleConfig;
    replicate: OpenAiCompatibleConfig;
    together: OpenAiCompatibleConfig;
    comfyui: OpenAiCompatibleConfig;
  };
  video: {
    provider: 'seedance' | 'kling' | 'veo';
    seedance: OpenAiCompatibleConfig;
    kling: KlingAiConfig;
    veo: OpenAiCompatibleConfig;
  };
  dubEngine: CreatorDubEngineConfig;
};

export type CreatorServicesConfigResponse = {
  config: CreatorServicesConfig;
  configuredCredentials: CreatorServicesCredentialField[];
};

export type CreatorTranscriptionProviderCapability = {
  provider: CreatorTranscriptionProvider;
  kind: 'cloud' | 'local';
  available: boolean;
  models: string[];
  modelDetails?: Record<string, { diskBytes: number }>;
  languageCapabilities?: Record<string, import('./creator-languages.js').TranscriptionLanguageCapability>;
  gpuAcceleration: boolean;
  unavailableReason?: 'unsupported_platform' | 'installer_unavailable';
};

export type CreatorServicesCapabilitiesResponse = {
  platform: string;
  arch: string;
  transcription: {
    providers: CreatorTranscriptionProviderCapability[];
  };
};

export type CodexImageStatus = {
  authentication: 'api_key' | 'chatgpt' | 'none';
  ready: boolean;
  executionMode: 'api' | 'native' | null;
  message: string;
  model?: string;
  version?: string;
};

export type CreatorPreflightExecutionMode = 'local' | 'remote' | 'mixed';

export type CreatorPreflightRepair = {
  label: string;
  deepLink?: string;
  capability?: string;
};

export type CreatorPreflightCheck = {
  id: string;
  title: string;
  message: string;
  executionMode: CreatorPreflightExecutionMode;
  repair?: CreatorPreflightRepair;
};

export type CreatorPreflightResponse = {
  templateId: string;
  templateVersion: number;
  stageId: string;
  executionMode: CreatorPreflightExecutionMode;
  canStart: boolean;
  ready: CreatorPreflightCheck[];
  warning: CreatorPreflightCheck[];
  blocked: Array<CreatorPreflightCheck & { repair: CreatorPreflightRepair }>;
  checkedAt: string;
};

/** Keep client-side and daemon-side preflight failures identical. */
export function creatorPreflightFailure(result: CreatorPreflightResponse): {
  code: string; message: string; publicFacts: PublicErrorFacts;
} {
  const codes: Record<string, string> = {
    'reference-image-required': 'creator_stage_input_missing',
    llm: 'creator_llm_config_missing',
    tts: 'creator_tts_config_missing',
    'image-provider': 'creator_image_config_missing',
    'video-provider': 'VIDEO_GENERATION_CONFIG_REQUIRED',
    'reference-image-capability': 'unsupported_capability',
    'transcription-config': 'creator_transcription_config_missing',
    'transcription-language': 'creator_transcription_language_unsupported',
    'transcription-timestamps': 'creator_transcription_timestamps_unavailable',
    'input-file': 'creator_stage_input_missing',
    'managed-directory': 'creator_storage_failed'
  };
  const id = Object.keys(codes).find(id => result.blocked.some(item => item.id === id));
  const code = id === undefined ? 'creator_preflight_blocked' : codes[id]!;
  const message = safePublicErrorMessage(result.blocked.map(item => item.message).join('; '))
    ?? 'Preflight checks failed. Review the task configuration.';
  return { code, message, publicFacts: {
    kind: publicErrorKindForCode(code) ?? 'validation', upstreamMessage: message,
    ...(id === 'reference-image-required' ? { upstreamCode: 'IMAGE_REFERENCE_MISSING' } : {})
  } };
}

export type CreatorServicesCredentialField =
  | 'llm.apiKey'
  | 'transcription.openai.apiKey'
  | 'transcription.groq.apiKey'
  | 'transcription.elevenlabs.apiKey'
  | 'transcription.assemblyai.apiKey'
  | 'transcription.deepgram.apiKey'
  | 'transcription.aliyun.oss.accessKeyId'
  | 'transcription.aliyun.oss.accessKeySecret'
  | 'transcription.aliyun.speech.accessKeyId'
  | 'transcription.aliyun.speech.accessKeySecret'
  | 'transcription.aliyun.speech.appKey'
  | 'transcription.volcengine.appId'
  | 'transcription.volcengine.accessToken'
  | 'transcription.funasr.apiKey'
  | 'tts.openai.apiKey'
  | 'tts.minimax.apiKey'
  | 'tts.aliyun.apiKey'
  | 'tts.volcengine.appId'
  | 'tts.volcengine.accessToken'
  | 'tts.azure.apiKey'
  | 'tts.elevenlabs.apiKey'
  | 'tts.fishaudio.apiKey'
  | 'image.openai.apiKey'
  | 'image.jimeng.apiKey'
  | 'image.kling.accessKey'
  | 'image.kling.secretKey'
  | 'image.gemini.apiKey'
  | 'image.fal.apiKey'
  | 'image.stability.apiKey'
  | 'image.replicate.apiKey'
  | 'image.together.apiKey'
  | 'video.seedance.apiKey'
  | 'video.kling.accessKey'
  | 'video.kling.secretKey'
  | 'video.veo.apiKey'
  | 'dubEngine.token';

export const defaultVolcengineSpeechBaseUrl = 'https://openspeech.bytedance.com';
export const defaultVolcengineAsrResourceId = 'volc.seedasr.auc';
export const defaultVolcengineTtsCluster = 'volcano_tts';
export const defaultVolcengineTtsVoiceId = 'BV001_streaming';

export function createDefaultCreatorServicesConfig(): CreatorServicesConfig {
  return {
    proxy: '',
    llm: {
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      jsonMode: false,
      source: 'codex'
    },
    transcription: {
      provider: 'openai',
      enableGpuAcceleration: false,
      openai: {
        baseUrl: '',
        apiKey: '',
        model: 'whisper-1'
      },
      fasterWhisper: { model: 'medium' },
      whisperKit: { model: 'large-v2' },
      whisperCpp: { model: 'tiny' },
      aliyun: {
        oss: { accessKeyId: '', accessKeySecret: '', bucket: '', region: 'cn-shanghai', endpoint: '' },
        speech: { accessKeyId: '', accessKeySecret: '', appKey: '' }
      },
      funasr: { baseUrl: 'http://127.0.0.1:8000/v1', apiKey: '', model: 'sensevoice', timeoutMs: 120000 },
      volcengine: {
        appId: '',
        accessToken: '',
        resourceId: defaultVolcengineAsrResourceId,
        baseUrl: defaultVolcengineSpeechBaseUrl
      },
      groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: '',
        model: 'whisper-large-v3'
      },
      elevenlabs: {
        baseUrl: 'https://api.elevenlabs.io',
        apiKey: '',
        model: 'scribe_v1'
      },
      assemblyai: {
        baseUrl: 'https://api.assemblyai.com',
        apiKey: '',
        model: 'universal'
      },
      deepgram: {
        baseUrl: 'https://api.deepgram.com',
        apiKey: '',
        model: 'nova-3'
      }
    },
    tts: {
      provider: 'openai',
      openai: {
        baseUrl: '',
        apiKey: '',
        model: 'gpt-4o-mini-tts',
        defaultVoiceId: 'marin'
      },
      minimax: {
        baseUrl: 'https://api.minimax.io',
        apiKey: '',
        model: 'speech-2.8-hd',
        defaultVoiceId: 'English_Graceful_Lady'
      },
      aliyun: {
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        apiKey: '',
        model: 'qwen3-tts-flash',
        defaultVoiceId: 'Cherry'
      },
      volcengine: {
        baseUrl: defaultVolcengineSpeechBaseUrl,
        accessToken: '',
        model: defaultVolcengineTtsCluster,
        defaultVoiceId: defaultVolcengineTtsVoiceId,
        appId: ''
      },
      // Azure Speech: regional endpoint (Southeast Asia is nearest Cambodia); `model` is
      // the output quality, mapped to an X-Microsoft-OutputFormat value.
      azure: {
        baseUrl: 'https://southeastasia.tts.speech.microsoft.com',
        apiKey: '',
        model: '24khz',
        defaultVoiceId: 'km-KH-SreymomNeural'
      },
      elevenlabs: {
        baseUrl: 'https://api.elevenlabs.io',
        apiKey: '',
        model: 'eleven_multilingual_v2',
        defaultVoiceId: ''
      },
      // Fish Audio: `model` is the `model` request header; voices are model reference IDs.
      fishaudio: {
        baseUrl: 'https://api.fish.audio',
        apiKey: '',
        model: 's2.1-pro-free',
        defaultVoiceId: ''
      }
    },
    image: {
      provider: 'codex-native',
      openai: {
        baseUrl: '',
        apiKey: '',
        model: 'gpt-image-2'
      },
      jimeng: {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: '',
        model: 'doubao-seedream-4-0-250828'
      },
      kling: {
        baseUrl: 'https://api-beijing.klingai.com',
        accessKey: '',
        secretKey: '',
        model: 'kling-v2-1'
      },
      gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        model: 'gemini-2.5-flash-image'
      },
      codexNative: {},
      fal: {
        baseUrl: 'https://queue.fal.run',
        apiKey: '',
        model: 'fal-ai/flux/schnell'
      },
      stability: {
        baseUrl: 'https://api.stability.ai',
        apiKey: '',
        model: 'core'
      },
      replicate: {
        baseUrl: 'https://api.replicate.com/v1',
        apiKey: '',
        model: 'black-forest-labs/flux-schnell'
      },
      together: {
        baseUrl: 'https://api.together.xyz/v1',
        apiKey: '',
        model: 'black-forest-labs/FLUX.1-schnell'
      },
      comfyui: {
        baseUrl: 'http://127.0.0.1:8188',
        apiKey: '',
        model: 'flux-schnell'
      }
    },
    video: {
      provider: 'seedance',
      seedance: {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKey: '',
        model: defaultVideoGenerationModels.seedance
      },
      kling: {
        baseUrl: 'https://api-beijing.klingai.com',
        accessKey: '',
        secretKey: '',
        model: defaultVideoGenerationModels.kling
      },
      veo: {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: '',
        model: defaultVideoGenerationModels.veo
      }
    },
    // On by default (T6.7): the local Khmer dub engine starts with the app when
    // it is installed; saved settings keep the user's own choice.
    dubEngine: {
      enabled: true,
      mode: 'local',
      url: 'http://127.0.0.1:8765',
      port: 8765,
      token: '',
      enginePath: '',
      pythonPath: '',
      autoStart: true,
      modelFolder: ''
    }
  };
}

export type CueCpsStatus = 'normal' | 'fast' | 'overlong';

export type CueCpsInfo = {
  cps: number;
  status: CueCpsStatus;
  label: string;
  durationSeconds: number;
  charCount: number;
  targetRate: number;
};

export function parseSubtitleTimestamp(value: string | number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }
  if (!value || typeof value !== 'string') return 0;
  const trimmed = value.trim().replace(',', '.');
  const parts = trimmed.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0] || '0');
    const minutes = parseFloat(parts[1] || '0');
    const seconds = parseFloat(parts[2] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0] || '0');
    const seconds = parseFloat(parts[1] || '0');
    return minutes * 60 + seconds;
  }
  const parsed = parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeLanguageCode(lang: string = '', text: string = ''): 'km' | 'zh' | 'ja' | 'latin' {
  const trimmed = (lang || '').trim().toLowerCase();
  if (
    trimmed.startsWith('km')
    || trimmed.includes('khmer')
    || trimmed.includes('高棉')
    || /[\u1780-\u17ff]/.test(trimmed)
    || /[\u1780-\u17ff]/.test(text)
  ) {
    return 'km';
  }
  if (
    trimmed.startsWith('zh')
    || trimmed.includes('chinese')
    || trimmed.includes('中文')
    || trimmed.includes('华语')
    || /[\u4e00-\u9fff]/.test(text)
  ) {
    return 'zh';
  }
  if (
    trimmed.startsWith('ja')
    || trimmed.includes('japanese')
    || trimmed.includes('日')
    || /[\u3040-\u30ff]/.test(text)
  ) {
    return 'ja';
  }
  return 'latin';
}

/**
 * Calibrate speech rate in Characters Per Second (CPS) per language.
 * Default calibrated target for Khmer ('km') speech synthesis is ~13.0 chars/sec.
 * - Normal: CPS <= 14.5
 * - Fast: 14.5 < CPS <= 19.0
 * - Overlong: CPS > 19.0
 */
export function calculateCueCps(
  cue: { start: string | number; end: string | number; text: string },
  lang: string = 'km'
): CueCpsInfo {
  const startSec = parseSubtitleTimestamp(cue.start);
  const endSec = parseSubtitleTimestamp(cue.end);
  const durationSeconds = Math.max(0.1, Number((endSec - startSec).toFixed(3)));

  // Clean newlines and redundant spaces for accurate character counting
  const cleanedText = (cue.text || '').replace(/\r?\n/g, ' ').trim();
  const charCount = cleanedText.length;
  const rawCps = charCount / durationSeconds;
  const cps = Number(rawCps.toFixed(1));

  const normalizedLang = normalizeLanguageCode(lang, cleanedText);

  let targetRate = 13.0;
  let status: CueCpsStatus = 'normal';
  let label = 'Normal';

  if (normalizedLang === 'km') {
    // Khmer speech calibration: target rate ~13.0 chars/sec
    targetRate = 13.0;
    if (cps <= 14.5) {
      status = 'normal';
      label = 'Normal';
    } else if (cps <= 19.0) {
      status = 'fast';
      label = 'Fast';
    } else {
      status = 'overlong';
      label = 'Overlong';
    }
  } else if (normalizedLang === 'zh' || normalizedLang === 'ja') {
    // CJK ideographic calibration: target rate ~3.5 chars/sec
    targetRate = 3.5;
    if (cps <= 4.0) {
      status = 'normal';
      label = 'Normal';
    } else if (cps <= 5.5) {
      status = 'fast';
      label = 'Fast';
    } else {
      status = 'overlong';
      label = 'Overlong';
    }
  } else {
    // Latin alphabetic calibration: target rate ~15.0 chars/sec
    targetRate = 15.0;
    if (cps <= 17.0) {
      status = 'normal';
      label = 'Normal';
    } else if (cps <= 21.0) {
      status = 'fast';
      label = 'Fast';
    } else {
      status = 'overlong';
      label = 'Overlong';
    }
  }

  return {
    cps,
    status,
    label,
    durationSeconds,
    charCount,
    targetRate
  };
}

export type ResynthesizeSegmentRequest = {
  jobId?: string;
  segmentIndex: number;
  text: string;
  voiceId?: string;
  provider?: string;
  speed?: number;
  targetLanguage?: string;
};

export type ResynthesizeSegmentResponse = {
  ok: boolean;
  segmentIndex: number;
  audioUrl: string;
  audioDataUrl?: string;
  duration: number;
  text: string;
};

export type JobQualityReport = {
  timingDriftMs: number;
  overlongCuesCount: number;
  totalCues: number;
  averageKhmerCps: number;
  cerPercent?: number;
  status: 'passed' | 'warning' | 'needs_attention';
};

export function calculateJobQualityReport(
  cues: Array<{ start: string | number; end: string | number; text: string }>,
  targetLanguage: string = 'km',
  options?: { measuredCerPercent?: number }
): JobQualityReport {
  if (!cues || cues.length === 0) {
    return {
      timingDriftMs: 0,
      overlongCuesCount: 0,
      totalCues: 0,
      averageKhmerCps: 0,
      cerPercent: options?.measuredCerPercent,
      status: 'passed'
    };
  }

  let totalChars = 0;
  let totalDuration = 0;
  let overlongCount = 0;
  let driftSumMs = 0;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    const cpsInfo = calculateCueCps(cue, targetLanguage);
    totalChars += cpsInfo.charCount;
    totalDuration += cpsInfo.durationSeconds;
    if (cpsInfo.status === 'overlong') {
      overlongCount++;
    }

    if (i < cues.length - 1) {
      const nextCue = cues[i + 1]!;
      const currEnd = parseSubtitleTimestamp(cue.end);
      const nextStart = parseSubtitleTimestamp(nextCue.start);
      const gapSec = nextStart - currEnd;
      // Drift is discrepancy from 40ms minimum broadcast gap if gap is non-zero
      if (gapSec < 0.04) {
        driftSumMs += Math.round(Math.abs(gapSec - 0.04) * 1000);
      }
    }
  }

  const averageKhmerCps = totalDuration > 0
    ? Number((totalChars / totalDuration).toFixed(1))
    : 0;

  const timingDriftMs = cues.length > 1
    ? Math.round(driftSumMs / (cues.length - 1))
    : 0;

  const overlongRatio = overlongCount / cues.length;
  let status: 'passed' | 'warning' | 'needs_attention' = 'passed';
  if (overlongCount > 0 || timingDriftMs > 60 || (options?.measuredCerPercent !== undefined && options.measuredCerPercent > 6.0)) {
    status = overlongRatio > 0.25 || timingDriftMs > 100 ? 'needs_attention' : 'warning';
  }

  return {
    timingDriftMs,
    overlongCuesCount: overlongCount,
    totalCues: cues.length,
    averageKhmerCps,
    cerPercent: options?.measuredCerPercent,
    status
  };
}

export type VoiceDesignRequest = {
  prompt: string;
  speed?: number;
};

export type VoiceDesignResponse = {
  ok: boolean;
  audioUrl: string;
  audioDataUrl?: string;
  duration: number;
  prompt: string;
};

export type VoiceLibraryItem = {
  id: string;
  name: string;
  prompt: string;
  duration: number;
  createdAt: string;
  audioUrl: string;
  audioDataUrl?: string;
  consent: boolean;
};

export type VoiceLibraryListResponse = {
  voices: VoiceLibraryItem[];
};

export type SaveVoiceDesignRequest = {
  prompt: string;
  consent: boolean;
};

export type DeleteVoiceDesignRequest = {
  voiceId: string;
};

export type PreviewVoiceDesignRequest = {
  voiceId: string;
};

export type PreviewVoiceDesignResponse = {
  blob: Blob;
};

export type DeleteVoiceDesignResponse = {
  ok: boolean;
};

// ─── Voice Library Service Interface ───

export interface VoiceLibraryService {
  listVoiceDesigns(): Promise<VoiceLibraryListResponse>;
  saveVoiceDesign(request: SaveVoiceDesignRequest): Promise<VoiceLibraryItem>;
  deleteVoiceDesign(request: DeleteVoiceDesignRequest): Promise<void>;
  previewVoiceDesign(request: PreviewVoiceDesignRequest): Promise<PreviewVoiceDesignResponse>;
}
