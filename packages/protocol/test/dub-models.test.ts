import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODEL_CATALOG,
  findModelInCatalog,
  type ModelCatalogItem,
  type ModelCategory,
} from '../src/index.js';

describe('dub-models protocol contracts', () => {
  it('defines the standard default model catalog', () => {
    expect(DEFAULT_MODEL_CATALOG.length).toBeGreaterThanOrEqual(6);

    const categories: ModelCategory[] = ['asr', 'tts', 'separation', 'font', 'acceleration'];
    for (const item of DEFAULT_MODEL_CATALOG) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(categories).toContain(item.category);
      expect(item.sizeBytes).toBeGreaterThan(0);
      expect(item.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(item.sourceUrl).toMatch(/^https?:\/\//);
      expect(item.filename).toBeTruthy();
      expect(item.targetSubdir).toBeTruthy();
      expect(item.recommendedForTier.length).toBeGreaterThan(0);
    }
  });

  it('finds models by ID', () => {
    const whisper = findModelInCatalog('whisper-small-int8');
    expect(whisper).toBeDefined();
    expect(whisper?.category).toBe('asr');
    expect(whisper?.recommendedForTier).toContain('T1');

    const demucs = findModelInCatalog('htdemucs');
    expect(demucs).toBeDefined();
    expect(demucs?.category).toBe('separation');

    const voxcpm = findModelInCatalog('voxcpm2-khmer');
    expect(voxcpm).toBeDefined();
    expect(voxcpm?.category).toBe('tts');

    const font = findModelInCatalog('noto-sans-khmer');
    expect(font).toBeDefined();
    expect(font?.category).toBe('font');

    const unknown = findModelInCatalog('nonexistent-model');
    expect(unknown).toBeUndefined();
  });
});
