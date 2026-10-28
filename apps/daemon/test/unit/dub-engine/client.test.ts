import { describe, expect, it } from 'vitest';
import {
  fromSnakeBenchmark,
  fromSnakeHardware,
  fromSnakeJobResponse,
  fromSnakeJobStatus,
  fromSnakeProgress,
  toSnakeDubRequest
} from '../../../src/dub-engine/client.js';

describe('snake_case ↔ camelCase wire-format mappers', () => {
  it('toSnakeDubRequest converts camelCase to snake_case', () => {
    const result = toSnakeDubRequest({
      sourceUrl: 'https://example.com/video.mp4',
      sourceLanguage: 'en',
      targetLanguage: 'km',
      ttsProvider: 'edge-tts',
      ttsVoiceId: 'km-KH-SreymomNeural',
      ttsStyle: 'natural',
      ttsSpeed: 1.25,
      separateVocals: true,
      bilingualSubtitles: false,
      composeVideo: true
    });
    expect(result).toEqual({
      source_url: 'https://example.com/video.mp4',
      source_language: 'en',
      target_language: 'km',
      tts_provider: 'edge-tts',
      tts_voice_id: 'km-KH-SreymomNeural',
      tts_style: 'natural',
      tts_speed: 1.25,
      separate_vocals: true,
      bilingual_subtitles: false,
      compose_video: true,
      llm_base_url: null,
      llm_api_key: null,
      llm_model: null
    });
  });

  it('toSnakeDubRequest omits optional voice id and style', () => {
    const result = toSnakeDubRequest({
      sourceUrl: 'u',
      sourceLanguage: 'en',
      targetLanguage: 'km',
      ttsProvider: 'edge-tts',
      ttsSpeed: 1,
      separateVocals: false,
      bilingualSubtitles: false,
      composeVideo: false
    });
    expect(result.tts_voice_id).toBeNull();
    expect(result.tts_style).toBeNull();
  });

  it('fromSnakeJobResponse maps job_id/status/message', () => {
    const result = fromSnakeJobResponse({
      job_id: 'abc123',
      status: 'running',
      message: 'processing'
    });
    expect(result).toEqual({ jobId: 'abc123', status: 'running', message: 'processing' });
  });

  it('fromSnakeJobStatus maps nested progress and nullable fields including artifact URLs', () => {
    const result = fromSnakeJobStatus({
      job_id: 'abc123',
      status: 'completed',
      progress: { stage: 'mix', percent: 78, message: 'mixing audio' },
      result_url: 'http://127.0.0.1:8765/v1/dub/abc123/download',
      srt_url: 'http://127.0.0.1:8765/v1/dub/abc123/artifacts/source.srt',
      km_srt_url: 'http://127.0.0.1:8765/v1/dub/abc123/artifacts/km.srt',
      vocals_url: 'http://127.0.0.1:8765/v1/dub/abc123/artifacts/vocals.wav',
      music_url: 'http://127.0.0.1:8765/v1/dub/abc123/artifacts/music.wav',
      error: null
    });
    expect(result.jobId).toBe('abc123');
    expect(result.status).toBe('completed');
    expect(result.progress).toEqual({ phase: 'mix', percent: 78, message: 'mixing audio' });
    expect(result.resultUrl).toBe('http://127.0.0.1:8765/v1/dub/abc123/download');
    expect(result.srtUrl).toBe('http://127.0.0.1:8765/v1/dub/abc123/artifacts/source.srt');
    expect(result.kmSrtUrl).toBe('http://127.0.0.1:8765/v1/dub/abc123/artifacts/km.srt');
    expect(result.vocalsUrl).toBe('http://127.0.0.1:8765/v1/dub/abc123/artifacts/vocals.wav');
    expect(result.musicUrl).toBe('http://127.0.0.1:8765/v1/dub/abc123/artifacts/music.wav');
    expect(result.error).toBeNull();
  });

  it('fromSnakeJobStatus handles null progress', () => {
    const result = fromSnakeJobStatus({ job_id: 'a', status: 'queued', progress: null });
    expect(result.progress).toBeNull();
  });

  it('fromSnakeProgress maps stage to phase', () => {
    expect(fromSnakeProgress({ stage: 'synthesize', percent: 45, message: 'tts' })).toEqual({
      phase: 'synthesize',
      percent: 45,
      message: 'tts'
    });
    expect(fromSnakeProgress({ percent: 0 })).toEqual({ phase: '', percent: 0 });
  });

  it('fromSnakeHardware maps CPU/GPU/disk/tier', () => {
    const result = fromSnakeHardware({
      cpu_cores: 8,
      cpu_threads: 16,
      cpu_avx2: true,
      cpu_avx512: false,
      ram_total_gb: 32,
      ram_free_gb: 18,
      gpu_name: null,
      gpu_vram_gb: null,
      cuda_version: null,
      gpu_compute_capability: null,
      disk_free_gb: { 'C:': 24.5, 'D:': 302.4 },
      tier: 'T1',
      tier_description: 'Low — CPU only',
      can_train_lora: false,
      voxcpm_mode: 'cpu',
      recommended_batch_size: 1
    });
    expect(result.cpuCores).toBe(8);
    expect(result.cpuThreads).toBe(16);
    expect(result.cpuAvx2).toBe(true);
    expect(result.cpuAvx512).toBe(false);
    expect(result.ramTotalGb).toBe(32);
    expect(result.ramFreeGb).toBe(18);
    expect(result.gpuName).toBeNull();
    expect(result.gpuVramGb).toBeNull();
    expect(result.diskFreeGb).toEqual({ 'C:': 24.5, 'D:': 302.4 });
    expect(result.tier).toBe('T1');
    expect(result.tierDescription).toBe('Low — CPU only');
    expect(result.canTrainLora).toBe(false);
    expect(result.voxcpmMode).toBe('cpu');
    expect(result.recommendedBatchSize).toBe(1);
  });

  it('fromSnakeHardware tolerates missing fields', () => {
    const result = fromSnakeHardware({});
    expect(result.cpuCores).toBe(0);
    expect(result.tier).toBe('unknown');
    expect(result.diskFreeGb).toEqual({});
  });

  it('fromSnakeBenchmark maps all timing fields', () => {
    const result = fromSnakeBenchmark({
      asr_time_seconds: 4.2,
      translation_time_seconds: 1.1,
      tts_time_seconds: 6.3,
      separation_time_seconds: 2.0,
      total_time_seconds: 13.6,
      tier: 'T2'
    });
    expect(result).toEqual({
      asrTimeSeconds: 4.2,
      translationTimeSeconds: 1.1,
      ttsTimeSeconds: 6.3,
      separationTimeSeconds: 2.0,
      totalTimeSeconds: 13.6,
      tier: 'T2'
    });
  });
});
