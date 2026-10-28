import { createDefaultCreatorServicesConfig } from '@vishnucreator/protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  HttpTranscriptionError,
  httpTranscriptionProviders,
  httpTranscriptionRequest,
  isHttpTranscriptionProvider,
  parseTranscriptionResponse,
  transcribeAudioHttp
} from '../../src/creator/vishnu/http-transcription-providers.js';

describe('HTTP transcription providers (Groq, ElevenLabs, Deepgram, AssemblyAI)', () => {
  const dummyAudio = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00]);

  it('validates provider identifiers', () => {
    for (const p of httpTranscriptionProviders) {
      expect(isHttpTranscriptionProvider(p)).toBe(true);
    }
    expect(isHttpTranscriptionProvider('unknown')).toBe(false);
  });

  it('throws 401 when API key is missing', () => {
    const config = createDefaultCreatorServicesConfig();
    expect(() => httpTranscriptionRequest({
      config,
      provider: 'groq',
      audio: dummyAudio
    })).toThrowError(HttpTranscriptionError);
  });

  it('builds Groq Whisper request with Bearer auth and multipart form', () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.groq.apiKey = 'gsk_test_key_123';
    config.transcription.groq.model = 'whisper-large-v3-turbo';

    const req = httpTranscriptionRequest({
      config,
      provider: 'groq',
      audio: dummyAudio,
      language: 'km'
    });

    expect(req.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(req.init.method).toBe('POST');
    expect((req.init.headers as Record<string, string>)?.authorization).toBe('Bearer gsk_test_key_123');
    expect(req.init.body).toBeInstanceOf(FormData);
    const form = req.init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('language')).toBe('km');
  });

  it('parses Groq Whisper verbose_json response into words', () => {
    const payload = {
      task: 'transcribe',
      language: 'khmer',
      duration: 3.5,
      text: 'សួស្តីពិភពលោក',
      words: [
        { word: 'សួស្តី', start: 0.0, end: 1.2 },
        { word: 'ពិភពលោក', start: 1.3, end: 3.2 }
      ]
    };

    const res = parseTranscriptionResponse('groq', payload);
    expect(res.language).toBe('khmer');
    expect(res.text).toBe('សួស្តីពិភពលោក');
    expect(res.words).toHaveLength(2);
    expect(res.words[0]).toEqual({ num: 0, text: 'សួស្តី', start: 0.0, end: 1.2 });
    expect(res.words[1]).toEqual({ num: 1, text: 'ពិភពលោក', start: 1.3, end: 3.2 });
  });

  it('falls back to segments if Groq response has no words', () => {
    const payload = {
      text: 'ជំរាបសួរ',
      language: 'km',
      segments: [
        { id: 0, start: 0.5, end: 2.0, text: 'ជំរាបសួរ' }
      ]
    };

    const res = parseTranscriptionResponse('groq', payload);
    expect(res.words).toHaveLength(1);
    expect(res.words[0]).toEqual({ num: 0, text: 'ជំរាបសួរ', start: 0.5, end: 2.0 });
  });

  it('builds ElevenLabs Scribe request with xi-api-key and maps km to khm', () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.elevenlabs.apiKey = 'el_key_456';

    const req = httpTranscriptionRequest({
      config,
      provider: 'elevenlabs',
      audio: dummyAudio,
      language: 'km'
    });

    expect(req.url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect((req.init.headers as Record<string, string>)?.['xi-api-key']).toBe('el_key_456');
    const form = req.init.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v1');
    expect(form.get('language_code')).toBe('khm');
    expect(form.get('tag_audio_events')).toBe('false');
  });

  it('parses ElevenLabs Scribe response and ignores audio_event', () => {
    const payload = {
      text: 'Hello world',
      language_code: 'eng',
      words: [
        { text: 'Hello', start: 0.1, end: 0.6, type: 'word' },
        { text: '(laughter)', start: 0.6, end: 0.9, type: 'audio_event' },
        { text: 'world', start: 1.0, end: 1.5, type: 'word' }
      ]
    };

    const res = parseTranscriptionResponse('elevenlabs', payload);
    expect(res.text).toBe('Hello world');
    expect(res.words).toHaveLength(2);
    expect(res.words[0]!.text).toBe('Hello');
    expect(res.words[1]!.text).toBe('world');
  });

  it('builds Deepgram request with Token auth and raw audio body', () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.deepgram.apiKey = 'dg_key_789';
    config.transcription.deepgram.model = 'nova-2';

    const req = httpTranscriptionRequest({
      config,
      provider: 'deepgram',
      audio: dummyAudio,
      mimeType: 'audio/wav'
    });

    expect(req.url).toBe('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true');
    expect((req.init.headers as Record<string, string>)?.authorization).toBe('Token dg_key_789');
    expect((req.init.headers as Record<string, string>)?.['Content-Type']).toBe('audio/wav');
    expect(req.init.body).toBe(dummyAudio);
  });

  it('parses Deepgram nested alternatives response', () => {
    const payload = {
      results: {
        channels: [
          {
            detected_language: 'en',
            alternatives: [
              {
                transcript: 'Test transcription',
                words: [
                  { word: 'Test', start: 0.2, end: 0.6 },
                  { word: 'transcription', start: 0.7, end: 1.4 }
                ]
              }
            ]
          }
        ]
      }
    };

    const res = parseTranscriptionResponse('deepgram', payload);
    expect(res.text).toBe('Test transcription');
    expect(res.language).toBe('en');
    expect(res.words).toHaveLength(2);
    expect(res.words[1]).toEqual({ num: 1, text: 'transcription', start: 0.7, end: 1.4 });
  });

  it('parses AssemblyAI response converting milliseconds to seconds', () => {
    const payload = {
      id: 'task_123',
      status: 'completed',
      text: 'Khmer subtitle line',
      language_code: 'km',
      words: [
        { text: 'Khmer', start: 500, end: 1000 },
        { text: 'subtitle', start: 1100, end: 1800 },
        { text: 'line', start: 1900, end: 2400 }
      ]
    };

    const res = parseTranscriptionResponse('assemblyai', payload);
    expect(res.text).toBe('Khmer subtitle line');
    expect(res.language).toBe('km');
    expect(res.words).toHaveLength(3);
    expect(res.words[0]).toEqual({ num: 0, text: 'Khmer', start: 0.5, end: 1.0 });
    expect(res.words[2]).toEqual({ num: 2, text: 'line', start: 1.9, end: 2.4 });
  });

  it('executes transcribeAudioHttp with custom fetcher and reports errors cleanly', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.groq.apiKey = 'gsk_valid';

    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      text: 'Real Khmer transcription',
      language: 'km',
      words: [{ word: 'Real', start: 0, end: 0.5 }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const res = await transcribeAudioHttp({
      config,
      provider: 'groq',
      audio: dummyAudio
    }, fetchMock);

    expect(res.text).toBe('Real Khmer transcription');
    expect(res.words).toHaveLength(1);

    // Error case
    const errorFetchMock = vi.fn<typeof fetch>(async () => new Response('Invalid API key', { status: 401 }));
    await expect(transcribeAudioHttp({
      config,
      provider: 'groq',
      audio: dummyAudio
    }, errorFetchMock)).rejects.toMatchObject({
      name: 'HttpTranscriptionError',
      status: 401
    });
  });
});
