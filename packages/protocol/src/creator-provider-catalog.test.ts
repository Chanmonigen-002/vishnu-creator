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
    // Phase 8 presets stay experimental until a live call is recorded (T8.5, T8.7).
    const phase8Voices = ['azure', 'elevenlabs', 'fishaudio'];
    expect(creatorProviderCatalog
      .filter(entry => entry.kind !== 'llm' && entry.id !== 'codex-native' && !phase8Voices.includes(entry.id))
      .every(entry => entry.status === 'supported')).toBe(true);
    expect(creatorProviderCatalogById.image.gemini?.status).toBe('supported');
  });

  it('keeps new voice presets experimental and labels Khmer support only where documented (T8.7)', () => {
    const voices = creatorProviderCatalog.filter(entry => entry.kind === 'tts');
    const byId = Object.fromEntries(voices.map(entry => [entry.id, entry]));
    for (const id of ['azure', 'elevenlabs', 'fishaudio']) expect(byId[id]?.status).toBe('experimental');
    expect(voices.filter(entry => entry.capabilities?.includes('khmer')).map(entry => entry.id)).toEqual(['azure']);
    expect(byId.fishaudio?.models[0]?.id).toBe('s2.1-pro-free');
  });

  it('keeps new text presets experimental until a live call is recorded (T8.5)', () => {
    for (const id of ['openrouter', 'groq', 'gemini', 'anthropic', 'llamacpp']) {
      expect(creatorProviderCatalogById.llm[id]?.status).toBe('experimental');
    }
    expect(creatorProviderCatalogById.llm.llamacpp?.defaultBaseUrl).toBe('http://127.0.0.1:9931/v1');
    // Ollama was verified with a live call on 2026-10-27.
    expect(creatorProviderCatalogById.llm.ollama).toMatchObject({ status: 'supported', access: 'local', credentials: [], placeholderApiKey: 'ollama' });
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
