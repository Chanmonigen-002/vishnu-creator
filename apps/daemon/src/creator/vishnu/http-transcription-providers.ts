import type { CreatorServicesConfig } from '@vishnucreator/protocol';

// Direct HTTP adapters for transcription providers added in Phase 8 (T8.6).
// Endpoints, headers, and request formats come from each provider's official docs,
// recorded in docs/providers/provider-research-2026-10.md.

export const httpTranscriptionProviders = ['groq', 'elevenlabs', 'assemblyai', 'deepgram'] as const;
export type HttpTranscriptionProvider = (typeof httpTranscriptionProviders)[number];

export function isHttpTranscriptionProvider(value: unknown): value is HttpTranscriptionProvider {
  return httpTranscriptionProviders.some(provider => provider === value);
}

export type TranscriptionWord = {
  num: number;
  text: string;
  start: number;
  end: number;
};

export type TranscriptionResult = {
  language: string;
  text: string;
  words: TranscriptionWord[];
};

export type HttpTranscriptionRequest = {
  config: CreatorServicesConfig;
  provider: HttpTranscriptionProvider;
  audio: Uint8Array | Buffer;
  fileName?: string;
  mimeType?: string;
  language?: string;
};

export type HttpTranscriptionFetch = (url: string, init: RequestInit) => Promise<Response>;

export class HttpTranscriptionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpTranscriptionError';
  }
}

export function httpTranscriptionRequest(input: HttpTranscriptionRequest): { url: string; init: RequestInit } {
  const settings = input.config.transcription[input.provider];
  if (!settings.apiKey.trim()) {
    throw new HttpTranscriptionError(401, `${input.provider} transcription requires an API key`);
  }
  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  const fileName = input.fileName || 'audio.wav';
  const mimeType = input.mimeType || 'audio/wav';

  if (input.provider === 'groq') {
    const form = new FormData();
    const blob = new Blob([input.audio as unknown as BlobPart], { type: mimeType });
    form.append('file', blob, fileName);
    form.append('model', settings.model || 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    if (input.language?.trim()) {
      form.append('language', input.language.trim());
    }
    return {
      url: `${base}/audio/transcriptions`,
      init: {
        method: 'POST',
        headers: {
          authorization: `Bearer ${settings.apiKey.trim()}`
        },
        body: form
      }
    };
  }

  if (input.provider === 'elevenlabs') {
    const form = new FormData();
    const blob = new Blob([input.audio as unknown as BlobPart], { type: mimeType });
    form.append('file', blob, fileName);
    form.append('model_id', settings.model || 'scribe_v1');
    if (input.language?.trim()) {
      const lang = input.language.trim() === 'km' ? 'khm' : input.language.trim();
      form.append('language_code', lang);
    }
    form.append('tag_audio_events', 'false');
    return {
      url: `${base}/v1/speech-to-text`,
      init: {
        method: 'POST',
        headers: {
          'xi-api-key': settings.apiKey.trim()
        },
        body: form
      }
    };
  }

  if (input.provider === 'deepgram') {
    const model = encodeURIComponent(settings.model || 'nova-3');
    const url = `${base}/v1/listen?model=${model}&smart_format=true`;
    return {
      url,
      init: {
        method: 'POST',
        headers: {
          authorization: `Token ${settings.apiKey.trim()}`,
          'Content-Type': mimeType
        },
        body: input.audio as unknown as BodyInit
      }
    };
  }

  // assemblyai upload request
  return {
    url: `${base}/v2/upload`,
    init: {
      method: 'POST',
      headers: {
        authorization: settings.apiKey.trim(),
        'Content-Type': mimeType
      },
      body: input.audio as unknown as BodyInit
    }
  };
}

export function parseTranscriptionResponse(
  provider: HttpTranscriptionProvider,
  payload: Record<string, unknown>
): TranscriptionResult {
  if (provider === 'groq') {
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const language = typeof payload.language === 'string' ? payload.language : 'unknown';
    const words: TranscriptionWord[] = [];
    if (Array.isArray(payload.words)) {
      for (const w of payload.words) {
        if (typeof w === 'object' && w !== null) {
          const item = w as Record<string, unknown>;
          const wordText = typeof item.word === 'string' ? item.word.trim() : '';
          const start = typeof item.start === 'number' ? item.start : 0;
          const end = typeof item.end === 'number' ? item.end : start;
          if (wordText) {
            words.push({ num: words.length, text: wordText, start, end });
          }
        }
      }
    }
    if (words.length === 0 && Array.isArray(payload.segments)) {
      for (const s of payload.segments) {
        if (typeof s === 'object' && s !== null) {
          const seg = s as Record<string, unknown>;
          const segText = typeof seg.text === 'string' ? seg.text.trim() : '';
          const start = typeof seg.start === 'number' ? seg.start : 0;
          const end = typeof seg.end === 'number' ? seg.end : start;
          if (segText) {
            words.push({ num: words.length, text: segText, start, end });
          }
        }
      }
    }
    return { language, text, words };
  }

  if (provider === 'elevenlabs') {
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const language = typeof payload.language_code === 'string' ? payload.language_code : 'unknown';
    const words: TranscriptionWord[] = [];
    if (Array.isArray(payload.words)) {
      for (const w of payload.words) {
        if (typeof w === 'object' && w !== null) {
          const item = w as Record<string, unknown>;
          if (item.type === 'audio_event') continue;
          const wordText = typeof item.text === 'string' ? item.text.trim() : '';
          const start = typeof item.start === 'number' ? item.start : 0;
          const end = typeof item.end === 'number' ? item.end : start;
          if (wordText) {
            words.push({ num: words.length, text: wordText, start, end });
          }
        }
      }
    }
    return { language, text, words };
  }

  if (provider === 'deepgram') {
    const results = (payload.results && typeof payload.results === 'object') ? payload.results as Record<string, unknown> : {};
    const channels = Array.isArray(results.channels) ? results.channels : [];
    const firstChannel = channels[0] && typeof channels[0] === 'object' ? channels[0] as Record<string, unknown> : {};
    const alternatives = Array.isArray(firstChannel.alternatives) ? firstChannel.alternatives : [];
    const alt = alternatives[0] && typeof alternatives[0] === 'object' ? alternatives[0] as Record<string, unknown> : {};
    const text = typeof alt.transcript === 'string' ? alt.transcript.trim() : '';
    const language = typeof firstChannel.detected_language === 'string' ? firstChannel.detected_language : 'unknown';
    const words: TranscriptionWord[] = [];
    if (Array.isArray(alt.words)) {
      for (const w of alt.words) {
        if (typeof w === 'object' && w !== null) {
          const item = w as Record<string, unknown>;
          const wordText = typeof item.word === 'string' ? item.word.trim() : '';
          const start = typeof item.start === 'number' ? item.start : 0;
          const end = typeof item.end === 'number' ? item.end : start;
          if (wordText) {
            words.push({ num: words.length, text: wordText, start, end });
          }
        }
      }
    }
    return { language, text, words };
  }

  // assemblyai transcript result (milliseconds to seconds)
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const language = typeof payload.language_code === 'string' ? payload.language_code : 'unknown';
  const words: TranscriptionWord[] = [];
  if (Array.isArray(payload.words)) {
    for (const w of payload.words) {
      if (typeof w === 'object' && w !== null) {
        const item = w as Record<string, unknown>;
        const wordText = typeof item.text === 'string' ? item.text.trim() : '';
        const start = typeof item.start === 'number' ? item.start / 1000 : 0;
        const end = typeof item.end === 'number' ? item.end / 1000 : start;
        if (wordText) {
          words.push({ num: words.length, text: wordText, start, end });
        }
      }
    }
  }
  return { language, text, words };
}

export async function transcribeAudioHttp(
  input: HttpTranscriptionRequest,
  fetcher: HttpTranscriptionFetch = fetch
): Promise<TranscriptionResult> {
  const req = httpTranscriptionRequest(input);
  const response = await fetcher(req.url, req.init);
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new HttpTranscriptionError(
      response.status,
      `${input.provider} transcription failed (HTTP ${response.status}): ${errorBody.slice(0, 200)}`
    );
  }
  const payload = await response.json() as Record<string, unknown>;
  return parseTranscriptionResponse(input.provider, payload);
}
