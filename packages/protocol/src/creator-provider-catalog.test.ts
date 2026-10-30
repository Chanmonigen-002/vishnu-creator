import { describe, expect, it } from 'vitest';
import {
  creatorProviderCatalog,
  creatorProviderCatalogById
} from './creator-provider-catalog.js';

describe('creator provider catalog', () => {
  it('provides selectable LLM providers with defaults', () => {
    expect(creatorProviderCatalogById.llm.openai).toMatchObject({
      models: [expect.objectContaining({ id: 'gpt-5.6-sol', recommended: true })]
    });
    expect(creatorProviderCatalogById.llm.deepseek).toMatchObject({
      label: 'DeepSeek',
      defaultBaseUrl: 'https://api.deepseek.com',
      models: expect.arrayContaining([
        expect.objectContaining({ id: 'deepseek-v4-pro' }),
        expect.objectContaining({ id: 'deepseek-v4-flash' }),
        expect.objectContaining({ id: 'deepseek-flash' })
      ])
    });
    expect(creatorProviderCatalogById.llm.minimax).toMatchObject({
      label: 'MiniMax',
      defaultBaseUrl: 'https://api.minimax.io',
      models: expect.arrayContaining([
        expect.objectContaining({ id: 'MiniMax-M2.7' }),
        expect.objectContaining({ id: 'MiniMax-M2.7-highspeed' })
      ])
    });
    expect(creatorProviderCatalogById.llm.minimax?.models).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'MiniMax-Text-01' })])
    );
  });

  it('marks only implemented providers as supported', () => {
    expect(creatorProviderCatalog.some(entry => entry.status === 'planned')).toBe(false);
    // Phase 8 presets stay experimental until a live call is recorded (T8.5, T8.6, T8.7, T8.8, T8.9).
    const phase8Presets = [
      'azure', 'elevenlabs', 'fishaudio',
      'fal', 'stability', 'replicate', 'together', 'comfyui',
      'runway', 'luma', 'minimax',
      'groq', 'assemblyai', 'deepgram', 'gemini'
    ];
    expect(creatorProviderCatalog
      .filter(entry => entry.kind !== 'llm' && entry.id !== 'codex-native' && !phase8Presets.includes(entry.id))
      .every(entry => entry.status === 'supported')).toBe(true);
    expect(creatorProviderCatalogById.image.gemini?.status).toBe('supported');
  });

  it('keeps new video presets experimental until a live call is recorded (T8.9)', () => {
    for (const id of ['runway', 'luma', 'minimax', 'comfyui'] as const) {
      expect(creatorProviderCatalogById.video[id]?.status).toBe('experimental');
    }
    expect(creatorProviderCatalogById.video.runway?.models[0]?.id).toBe('gen4.5');
    expect(creatorProviderCatalogById.video.comfyui).toMatchObject({ access: 'local', credentials: [] });
  });

  it('keeps new image presets experimental until a live call is recorded (T8.8)', () => {
    for (const id of ['fal', 'stability', 'replicate', 'together', 'comfyui'] as const) {
      expect(creatorProviderCatalogById.image[id]?.status).toBe('experimental');
    }
    expect(creatorProviderCatalogById.image.fal?.models[0]?.id).toBe('fal-ai/flux/schnell');
    expect(creatorProviderCatalogById.image.comfyui).toMatchObject({ access: 'local', credentials: [] });
  });

  it('keeps new voice presets experimental and labels Khmer support only where documented (T8.7)', () => {
    const voices = creatorProviderCatalog.filter(entry => entry.kind === 'tts');
    const byId = Object.fromEntries(voices.map(entry => [entry.id, entry]));
    for (const id of ['azure', 'elevenlabs', 'fishaudio']) expect(byId[id]?.status).toBe('experimental');
    expect(byId.voxcpm).toMatchObject({
      status: 'supported',
      access: 'local',
      credentials: [],
      capabilities: expect.arrayContaining(['speech-generation', 'voice-preview', 'khmer'])
    });
    expect(voices.filter(entry => entry.capabilities?.includes('khmer')).map(entry => entry.id)).toEqual(['azure', 'voxcpm']);
    expect(byId.fishaudio?.models[0]?.id).toBe('s2.1-pro-free');
  });

  it('lists Phase 8 transcription presets with Khmer support flags and local whisper.cpp as supported (T8.6)', () => {
    expect(creatorProviderCatalogById.transcription['whisper.cpp']).toMatchObject({
      status: 'supported',
      access: 'local',
      capabilities: ['khmer']
    });
    for (const id of ['groq', 'elevenlabs', 'assemblyai', 'deepgram', 'gemini'] as const) {
      expect(creatorProviderCatalogById.transcription[id]?.status).toBe('experimental');
    }
    expect(creatorProviderCatalogById.transcription.deepgram?.capabilities).toBeUndefined();
    expect(creatorProviderCatalogById.transcription.groq?.capabilities).toContain('khmer');
  });

  it('keeps unverified text presets experimental and marks verified ones as supported (T8.5)', () => {
    for (const id of ['groq', 'anthropic', 'llamacpp']) {
      expect(creatorProviderCatalogById.llm[id]?.status).toBe('experimental');
    }
    expect(creatorProviderCatalogById.llm.llamacpp?.defaultBaseUrl).toBe('http://127.0.0.1:9931/v1');
    // Ollama, OpenRouter, and Google Gemini verified live with real calls and Khmer generation.
    expect(creatorProviderCatalogById.llm.ollama).toMatchObject({ status: 'supported', access: 'local', credentials: [], placeholderApiKey: 'ollama' });
    expect(creatorProviderCatalogById.llm.openrouter).toMatchObject({ status: 'supported', access: 'free-tier' });
    expect(creatorProviderCatalogById.llm.gemini).toMatchObject({ status: 'supported', access: 'free-tier' });
  });

  it('describes Codex native image generation as credential-free and experimental', () => {
    expect(creatorProviderCatalogById.image['codex-native']).toMatchObject({
      label: 'Local Codex image generation',
      protocol: 'local',
      credentials: [],
      capabilities: ['text-to-image', 'image-edit', 'reference-image'],
      status: 'experimental'
    });
  });
});
