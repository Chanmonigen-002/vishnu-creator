import type { CreatorServicesConfig, CreatorTtsVoice } from '@vishnucreator/protocol';

// Direct HTTP adapters for voice providers added in Phase 8 (T8.7). Endpoints,
// headers and fields come from each provider's official docs, recorded in
// docs/providers/provider-research-2026-10.md.

export const httpTtsProviders = ['azure', 'elevenlabs', 'fishaudio'] as const;
export type HttpTtsProvider = (typeof httpTtsProviders)[number];

export function isHttpTtsProvider(value: unknown): value is HttpTtsProvider {
  return httpTtsProviders.some(provider => provider === value);
}

export type HttpTtsRequest = {
  config: CreatorServicesConfig;
  provider: HttpTtsProvider;
  model: string;
  voiceId: string;
  text: string;
  format: 'mp3' | 'wav';
  speed: number;
};

export type HttpTtsFetch = (url: string, init: RequestInit) => Promise<Response>;

export class HttpTtsError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpTtsError';
  }
}

/** Azure Speech: Khmer neural voices listed on the language-support page. */
export const azureKhmerVoices: CreatorTtsVoice[] = [
  { id: 'km-KH-SreymomNeural', name: 'Sreymom', provider: 'azure', language: 'km-KH', gender: 'female', kind: 'builtin', recommended: true },
  { id: 'km-KH-PisethNeural', name: 'Piseth', provider: 'azure', language: 'km-KH', gender: 'male', kind: 'builtin' }
];

export function httpTtsRequest(input: HttpTtsRequest): { url: string; init: RequestInit } {
  const settings = input.config.tts[input.provider];
  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  if (input.provider === 'azure') {
    return {
      url: `${base}/cognitiveservices/v1`,
      init: {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': settings.apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': azureOutputFormat(input.model, input.format),
          'User-Agent': 'VishnuCreator'
        },
        body: azureSsml(input.text, input.voiceId, input.speed)
      }
    };
  }
  if (input.provider === 'elevenlabs') {
    const outputFormat = input.format === 'wav' ? 'wav_44100' : 'mp3_44100_128';
    return {
      url: `${base}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=${outputFormat}`,
      init: {
        method: 'POST',
        headers: { 'xi-api-key': settings.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input.text,
          model_id: input.model,
          ...(input.speed === 1 ? {} : { voice_settings: { speed: input.speed } })
        })
      }
    };
  }
  return {
    url: `${base}/v1/tts`,
    init: {
      method: 'POST',
      headers: { authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json', model: input.model },
      body: JSON.stringify({
        text: input.text,
        reference_id: input.voiceId,
        format: input.format,
        ...(input.speed === 1 ? {} : { prosody: { speed: input.speed } })
      })
    }
  };
}

export async function listHttpTtsVoices(
  config: CreatorServicesConfig,
  provider: HttpTtsProvider,
  fetcher: HttpTtsFetch = fetch
): Promise<CreatorTtsVoice[]> {
  // Azure documents a full voice list only for per-resource endpoints, so the
  // regional preset ships the documented Khmer voices; other voices can be typed in.
  if (provider === 'azure') return azureKhmerVoices;
  const settings = config.tts[provider];
  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  if (provider === 'elevenlabs') {
    const response = await fetcher(`${base}/v2/voices?page_size=100`, { headers: { 'xi-api-key': settings.apiKey } });
    if (!response.ok) throw new HttpTtsError(response.status, `ElevenLabs voice list failed (HTTP ${response.status})`);
    const payload = await response.json() as { voices?: Array<{ voice_id?: unknown; name?: unknown; category?: unknown; labels?: Record<string, unknown> }> };
    return (payload.voices ?? []).flatMap(voice => {
      if (typeof voice.voice_id !== 'string' || !voice.voice_id) return [];
      const gender = typeof voice.labels?.gender === 'string' ? voice.labels.gender : undefined;
      const language = typeof voice.labels?.language === 'string' ? voice.labels.language : undefined;
      return [{
        id: voice.voice_id,
        name: typeof voice.name === 'string' && voice.name ? voice.name : voice.voice_id,
        provider,
        ...(language ? { language } : {}),
        ...(gender ? { gender } : {}),
        kind: voice.category === 'cloned' || voice.category === 'professional'
          ? 'custom' as const
          : voice.category === 'generated' ? 'designed' as const : 'builtin' as const
      }];
    });
  }
  const headers = { authorization: `Bearer ${settings.apiKey}` };
  const [own, popular] = await Promise.all([
    fetcher(`${base}/model?self=true&page_size=100`, { headers }),
    fetcher(`${base}/model?page_size=50&sort_by=task_count`, { headers })
  ]);
  for (const response of [own, popular]) {
    if (!response.ok) throw new HttpTtsError(response.status, `Fish Audio voice list failed (HTTP ${response.status})`);
  }
  const seen = new Set<string>();
  const voices: CreatorTtsVoice[] = [];
  for (const [response, kind] of [[own, 'custom'], [popular, 'builtin']] as const) {
    const payload = await response.json() as { items?: Array<{ _id?: unknown; title?: unknown; languages?: unknown; type?: unknown }> };
    for (const item of payload.items ?? []) {
      if (typeof item._id !== 'string' || !item._id || seen.has(item._id) || item.type !== 'tts') continue;
      seen.add(item._id);
      const language = Array.isArray(item.languages) && typeof item.languages[0] === 'string' ? item.languages[0] : undefined;
      voices.push({
        id: item._id,
        name: typeof item.title === 'string' && item.title ? item.title : item._id,
        provider,
        ...(language ? { language } : {}),
        kind
      });
    }
  }
  return voices;
}

function azureOutputFormat(model: string, format: 'mp3' | 'wav'): string {
  const highFidelity = model.trim() === '48khz';
  if (format === 'wav') return highFidelity ? 'riff-48khz-16bit-mono-pcm' : 'riff-24khz-16bit-mono-pcm';
  return highFidelity ? 'audio-48khz-192kbitrate-mono-mp3' : 'audio-24khz-96kbitrate-mono-mp3';
}

function azureSsml(text: string, voiceId: string, speed: number): string {
  // ShortNames start with the locale, e.g. km-KH-SreymomNeural.
  const locale = /^[a-z]{2,3}-[A-Z]{2}/.exec(voiceId)?.[0] ?? 'en-US';
  const escaped = escapeXml(text);
  const content = speed === 1 ? escaped : `<prosody rate="${formatRate(speed)}">${escaped}</prosody>`;
  return `<speak version='1.0' xml:lang='${locale}'><voice xml:lang='${locale}' name='${escapeXml(voiceId)}'>${content}</voice></speak>`;
}

function formatRate(speed: number): string {
  const percent = Math.round((speed - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}
