import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { DubEngineService } from '../../src/dub-engine/service.js';

describe('Dub Engine real CPU integration (T3.10)', () => {
  const service = new DubEngineService({
    config: {
      enabled: true,
      mode: 'local',
      port: 8765
    }
  });
  const client = service.getClient();

  beforeAll(async () => {
    await service.start();
  }, 45_000);

  afterAll(async () => {
    await service.stop();
  });

  it('checks real engine health and hardware detection', async () => {
    const health = await client.getHealth();
    expect(health.status).toBe('ok');
    expect(health.version).toBe('0.1.0');

    const hardware = await client.getHardware();
    expect(hardware.tier).toBe('T1');
    expect(hardware.cpuCores).toBeGreaterThan(0);
    expect(hardware.ramTotalGb).toBeGreaterThan(0);
    expect(hardware.recommendedTts).toBe('edge-tts');
  });

  it('resynthesizes Khmer segment audio on real CPU engine and downloads artifact', async () => {
    const result = await client.resynthesizeSegment({
      segmentIndex: 0,
      text: 'សួស្តី',
      targetLanguage: 'km',
      provider: 'edge-tts'
    });

    expect(result.ok).toBe(true);
    expect(result.segmentIndex).toBe(0);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.audioUrl).toMatch(/\/v1\/dub\/segment_cache\/artifacts\/seg_0_.*\.mp3/);

    const artifactName = result.audioUrl.split('/').pop()!;
    const artifactBuf = await client.downloadArtifact('segment_cache', artifactName);
    expect(artifactBuf.length).toBeGreaterThan(100);

    // Verify MP3 header (either ID3 tag or 0xFF frame sync)
    const isId3 = artifactBuf.subarray(0, 3).toString('ascii') === 'ID3';
    const isMp3Sync = artifactBuf[0] === 0xff && ((artifactBuf[1] ?? 0) & 0xe0) === 0xe0;
    expect(isId3 || isMp3Sync).toBe(true);
  });
});
