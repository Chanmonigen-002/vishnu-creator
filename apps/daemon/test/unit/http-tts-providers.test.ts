import { createDefaultCreatorServicesConfig, type CreatorServicesConfig } from '@vishnucreator/protocol';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreatorServicesConfigStore } from '../../src/creator-services/config-store.js';
import { createVishnuTtsService, VishnuTtsServiceError } from '../../src/creator/vishnu/tts-service.js';

// Request shapes follow the official docs recorded in
// docs/providers/provider-research-2026-10.md (T8.7).
describe('HTTP voice providers (Azure, ElevenLabs, Fish Audio)', () => {
  const roots: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });

  async function service(update: (config: CreatorServicesConfig) => void) {
    const root = await mkdtemp(join(tmpdir(), 'vishnucreator-http-tts-'));
    roots.push(root);
    const config = createDefaultCreatorServicesConfig();
    update(config);
    const executeUtility = vi.fn();
    return {
      executeUtility,
      tts: createVishnuTtsService({ resourceRoot: join(root, 'runtime'), workRoot: join(root, 'work'), configStore: store(config), executeUtility })
    };
  }

  it('synthesizes Khmer with Azure Speech using the regional endpoint, key header and escaped SSML', async () => {
    const audio = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]);
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { tts } = await service(config => { config.tts.azure.apiKey = 'azure-key'; });

    const result = await tts.synthesize({ provider: 'azure', text: 'សួស្តី <Cambodia> & "you"', format: 'mp3', speed: 1.2 });

    const [url, init] = fetchMock.mock.lastCall!;
    expect(url).toBe('https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1');
    expect(init?.headers).toMatchObject({
      'Ocp-Apim-Subscription-Key': 'azure-key',
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3'
    });
    expect(init?.body).toBe("<speak version='1.0' xml:lang='km-KH'><voice xml:lang='km-KH' name='km-KH-SreymomNeural'>"
      + '<prosody rate="+20%">សួស្តី &lt;Cambodia&gt; &amp; &quot;you&quot;</prosody></voice></speak>');
    expect(result).toMatchObject({ provider: 'azure', voiceId: 'km-KH-SreymomNeural', format: 'mp3' });
    expect([...result.content]).toEqual([...audio]);
  });

  it('uses the 48 kHz Azure output format for the high-fidelity model and WAV requests', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(Buffer.from('RIFF....WAVE'), { headers: { 'Content-Type': 'audio/wav' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { tts } = await service(config => { config.tts.azure.apiKey = 'k'; config.tts.azure.model = '48khz'; });

    await tts.synthesize({ provider: 'azure', text: 'hi', voiceId: 'en-US-JennyNeural', format: 'wav' });

    expect(fetchMock.mock.lastCall![1]?.headers).toMatchObject({ 'X-Microsoft-OutputFormat': 'riff-48khz-16bit-mono-pcm' });
    expect(String(fetchMock.mock.lastCall![1]?.body)).toContain("xml:lang='en-US'");
  });

  it('lists the documented Azure Khmer voices without a network call', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const { tts, executeUtility } = await service(() => {});

    const listed = await tts.listVoices('azure');

    expect(listed.voices.map(voice => voice.id)).toEqual(['km-KH-SreymomNeural', 'km-KH-PisethNeural']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(executeUtility).not.toHaveBeenCalled();
  });

  it('synthesizes with ElevenLabs using xi-api-key, the voice path and output_format', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([0xff, 0xfb, 1]), { headers: { 'Content-Type': 'audio/mpeg' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { tts } = await service(config => { config.tts.elevenlabs.apiKey = 'el-key'; });

    await tts.synthesize({ provider: 'elevenlabs', text: 'Hello', voiceId: 'voice/1', format: 'mp3', speed: 0.9 });

    const [url, init] = fetchMock.mock.lastCall!;
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%2F1?output_format=mp3_44100_128');
    expect(init?.headers).toMatchObject({ 'xi-api-key': 'el-key' });
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Hello', model_id: 'eleven_multilingual_v2', voice_settings: { speed: 0.9 } });
  });

  it('maps the ElevenLabs voice list and its categories', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ voices: [
      { voice_id: 'a', name: 'Aria', category: 'premade', labels: { gender: 'female', language: 'en' } },
      { voice_id: 'b', name: 'My clone', category: 'cloned', labels: {} },
      { voice_id: '', name: 'broken' }
    ] }));
    vi.stubGlobal('fetch', fetchMock);
    const { tts } = await service(config => { config.tts.elevenlabs.apiKey = 'el-key'; });

    const listed = await tts.listVoices('elevenlabs');

    expect(fetchMock.mock.lastCall![0]).toBe('https://api.elevenlabs.io/v2/voices?page_size=100');
    expect(listed.voices).toEqual([
      { id: 'a', name: 'Aria', provider: 'elevenlabs', language: 'en', gender: 'female', kind: 'builtin' },
      { id: 'b', name: 'My clone', provider: 'elevenlabs', kind: 'custom' }
    ]);
  });

  it('synthesizes with Fish Audio using Bearer auth, the model header and reference_id', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(Buffer.from('RIFF....WAVE'), { headers: { 'Content-Type': 'audio/wav' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { tts } = await service(config => { config.tts.fishaudio.apiKey = 'fish-key'; config.tts.fishaudio.defaultVoiceId = 'ref-123'; });

    const result = await tts.synthesize({ provider: 'fishaudio', text: 'សួស្តី', format: 'wav' });

    const [url, init] = fetchMock.mock.lastCall!;
    expect(url).toBe('https://api.fish.audio/v1/tts');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer fish-key', model: 's2.1-pro-free' });
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'សួស្តី', reference_id: 'ref-123', format: 'wav' });
    expect(result.format).toBe('wav');
  });

  it('lists the owner\'s Fish Audio voices first and skips duplicates and non-TTS models', async () => {
    const fetchMock = vi.fn<typeof fetch>(async input => Response.json(String(input).includes('self=true')
      ? { items: [{ _id: 'mine', title: 'My voice', type: 'tts', languages: ['km'] }] }
      : { items: [{ _id: 'mine', title: 'My voice', type: 'tts' }, { _id: 'pop', title: 'Popular', type: 'tts', languages: ['en'] }, { _id: 'svc', title: 'Voice changer', type: 'svc' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const { tts } = await service(config => { config.tts.fishaudio.apiKey = 'fish-key'; });

    const listed = await tts.listVoices('fishaudio');

    expect(listed.voices).toEqual([
      { id: 'mine', name: 'My voice', provider: 'fishaudio', language: 'km', kind: 'custom' },
      { id: 'pop', name: 'Popular', provider: 'fishaudio', language: 'en', kind: 'builtin' }
    ]);
  });

  it('requires a key before listing or synthesizing and never sends an empty voice', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const { tts } = await service(config => { config.tts.fishaudio.apiKey = 'fish-key'; });

    await expect(tts.listVoices('elevenlabs')).rejects.toMatchObject({ code: 'creator_tts_config_missing' });
    await expect(tts.synthesize({ provider: 'elevenlabs', text: 'x', voiceId: 'v' })).rejects.toMatchObject({ code: 'creator_tts_config_missing' });
    await expect(tts.synthesize({ provider: 'fishaudio', text: 'x' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports provider HTTP errors without leaking the key', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('{"detail":"invalid api key"}', { status: 401, headers: { 'Content-Type': 'application/json' } })));
    const { tts } = await service(config => { config.tts.azure.apiKey = 'secret-azure-key'; });

    const failure = await tts.synthesize({ provider: 'azure', text: 'hi' }).catch(error => error);

    expect(failure).toBeInstanceOf(VishnuTtsServiceError);
    expect(failure.code).toBe('creator_tts_upstream_error');
    expect(String(failure.message)).not.toContain('secret-azure-key');
  });
});

function store(config: CreatorServicesConfig): CreatorServicesConfigStore {
  return {
    read: vi.fn(async () => structuredClone(config)),
    write: vi.fn(async next => next),
    reset: vi.fn(async () => createDefaultCreatorServicesConfig())
  };
}
