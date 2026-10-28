import Fastify, { type FastifyInstance } from 'fastify';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultCreatorServicesConfig,
  type CreatorTtsProvider,
  type CreatorTtsVoicesResponse
} from '@vishnucreator/protocol';
import type { CreatorServicesConfigStore } from '../../src/creator-services/config-store.js';
import { registerCreatorServicesRoutes } from '../../src/api/routes.creator-services.js';
import { createVishnuCreatorServicesCapabilities } from '../../src/creator/vishnu/capabilities.js';
import type { VishnuTtsService } from '../../src/creator/vishnu/tts-service.js';
import { DubEngineClient } from '../../src/dub-engine/client.js';

describe('creator services API', () => {
  let server: FastifyInstance;
  let store: CreatorServicesConfigStore;
  let ttsService: Pick<VishnuTtsService, 'listVoices' | 'preview'>;

  beforeEach(async () => {
    const initial = createDefaultCreatorServicesConfig();
    initial.llm.apiKey = 'initial-secret';
    initial.llm.source = 'custom';
    store = {
      read: vi.fn(async () => initial),
      write: vi.fn(async config => config),
      reset: vi.fn(async () => createDefaultCreatorServicesConfig())
    };
    ttsService = {
      listVoices: vi.fn(async (
        provider: CreatorTtsProvider
      ): Promise<CreatorTtsVoicesResponse> => ({
        provider,
        model: provider === 'aliyun' ? 'qwen3-tts-flash' : '',
        voices: provider === 'aliyun'
          ? [{ id: 'Cherry', name: '芊悦', provider: 'aliyun', kind: 'builtin' as const }]
          : []
      })),
      preview: vi.fn(async request => ({
        content: Buffer.from(`preview:${request.voiceId}`),
        mime: 'audio/mpeg' as const,
        provider: 'aliyun' as const,
        model: 'qwen3-tts-flash',
        voiceId: request.voiceId,
        language: 'en',
        format: 'mp3' as const
      }))
    };
    server = Fastify({ logger: false });
    await registerCreatorServicesRoutes(
      server,
      store,
      () => createVishnuCreatorServicesCapabilities('darwin', 'arm64'),
      ttsService
    );
  });

  afterEach(async () => {
    await server.close();
  });

  it('reports unavailable capability instead of assuming native image generation is enabled', async () => {
    const response = await server.inject({ method: 'GET', url: '/creator-services/image/codex/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ready: false, authentication: 'none', executionMode: null });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(store.write).not.toHaveBeenCalled();
  });

  it('exposes the checked authentication mode without mutating configuration', async () => {
    await server.close();
    server = Fastify({ logger: false });
    const readStatus = vi.fn(async () => ({ authentication: 'chatgpt' as const, ready: true, executionMode: 'native' as const, version: 'codex-test', message: '原生工具已就绪' }));
    await registerCreatorServicesRoutes(server, store, undefined, ttsService, undefined, readStatus);
    const response = await server.inject({ method: 'GET', url: '/creator-services/image/codex/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authentication: 'chatgpt', ready: true, executionMode: 'native', version: 'codex-test' });
    expect(response.body).not.toContain('initial-secret');
    expect(readStatus).toHaveBeenCalledOnce();
    expect(store.write).not.toHaveBeenCalled();
    expect(store.reset).not.toHaveBeenCalled();
  });

  it('supports legacy independent text-model fields during migration', async () => {
    const read = await server.inject({ method: 'GET', url: '/creator-services/config' });
    expect(read.statusCode).toBe(200);
    expect(read.body).not.toContain('initial-secret');
    const config = read.json().config;
    expect(config.llm.apiKey).toBe('');
    expect(read.json().configuredCredentials).toContain('llm.apiKey');
    config.llm.apiKey = 'sk-local';

    const saved = await server.inject({
      method: 'PATCH',
      url: '/creator-services/config',
      payload: config
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain('sk-local');
    expect(store.write).toHaveBeenCalledWith(expect.objectContaining({
      llm: expect.objectContaining({
        apiKey: 'sk-local',
        source: 'custom'
      })
    }));

    const reset = await server.inject({ method: 'DELETE', url: '/creator-services/config' });
    expect(reset.statusCode).toBe(200);
    expect(store.reset).toHaveBeenCalledTimes(1);
    expect(reset.json().config.llm.source).toBe('codex');
  });

  it('retains configured credentials when a settings form submits blank secret fields', async () => {
    const read = await server.inject({ method: 'GET', url: '/creator-services/config' });
    const config = read.json().config;
    config.proxy = 'http://127.0.0.1:7897';

    const saved = await server.inject({
      method: 'PATCH',
      url: '/creator-services/config',
      payload: config
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain('initial-secret');
    expect(store.write).toHaveBeenCalledWith(expect.objectContaining({
      proxy: 'http://127.0.0.1:7897',
      llm: expect.objectContaining({ apiKey: 'initial-secret' })
    }));
  });

  it('does not return the FunASR API key from settings reads or saves', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.funasr.apiKey = 'funasr-secret';
    vi.mocked(store.read).mockResolvedValue(config);

    const read = await server.inject({ method: 'GET', url: '/creator-services/config' });
    expect(read.statusCode).toBe(200);
    expect(read.body).not.toContain('funasr-secret');
    expect(read.json().configuredCredentials).toContain('transcription.funasr.apiKey');

    const saved = await server.inject({
      method: 'PATCH', url: '/creator-services/config', payload: read.json().config
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain('funasr-secret');
    expect(store.write).toHaveBeenCalledWith(expect.objectContaining({
      transcription: expect.objectContaining({
        funasr: expect.objectContaining({ apiKey: 'funasr-secret' })
      })
    }));
  });

  it('tests the configured FunASR model with the retained credential', async () => {
    let authorization: string | undefined;
    const endpoint = createServer((request, response) => {
      authorization = request.headers.authorization;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'sensevoice' }] }));
    });
    await new Promise<void>(resolve => endpoint.listen(0, '127.0.0.1', resolve));
    try {
      const address = endpoint.address();
      if (address === null || typeof address === 'string') throw new Error('Missing endpoint address');
      const baseUrl = `http://127.0.0.1:${address.port}/v1`;
      const config = createDefaultCreatorServicesConfig();
      config.transcription.funasr.baseUrl = baseUrl;
      config.transcription.funasr.apiKey = 'funasr-secret';
      vi.mocked(store.read).mockResolvedValue(config);

      const payload = { baseUrl, model: 'sensevoice', apiKey: '', timeoutMs: 1000 };
      const connected = await server.inject({ method: 'POST', url: '/creator-services/transcription/test', payload });
      expect(connected.statusCode).toBe(200);
      expect(connected.json().connected).toBe(true);
      expect(authorization).toBe('Bearer funasr-secret');

      const missing = await server.inject({ method: 'POST', url: '/creator-services/transcription/test',
        payload: { ...payload, model: 'unknown-model' } });
      expect(missing.statusCode).toBe(502);
      expect(missing.json().error.message).toContain('unknown-model');

      authorization = undefined;
      const otherEndpoint = await server.inject({ method: 'POST', url: '/creator-services/transcription/test',
        payload: { ...payload, baseUrl: `${baseUrl}/other` } });
      expect(otherEndpoint.statusCode).toBe(200);
      expect(authorization).toBeUndefined();
    } finally {
      endpoint.close();
    }
  });

  it('accepts the default OpenAI provider with an empty API key', async () => {
    vi.mocked(store.read).mockResolvedValue(createDefaultCreatorServicesConfig());
    const config = createDefaultCreatorServicesConfig();

    const response = await server.inject({
      method: 'PATCH',
      url: '/creator-services/config',
      payload: config
    });

    expect(response.statusCode).toBe(200);
    expect(store.write).toHaveBeenCalledWith(expect.objectContaining({
      transcription: expect.objectContaining({
        provider: 'openai',
        openai: expect.objectContaining({ apiKey: '' })
      })
    }));
  });

  it('rejects unsupported providers without persisting the request', async () => {
    const config = createDefaultCreatorServicesConfig() as unknown as Record<string, any>;
    config.transcription.provider = 'unknown';

    const response = await server.inject({
      method: 'PATCH',
      url: '/creator-services/config',
      payload: config
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('transcription.provider'),
        details: {
          fields: expect.arrayContaining([
            expect.objectContaining({ field: 'transcription.provider' })
          ])
        }
      }
    });
    expect(store.write).not.toHaveBeenCalled();
  });

  it('reports Runtime transcription capabilities', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/creator-services/capabilities'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      platform: 'darwin',
      arch: 'arm64',
      transcription: {
        providers: expect.arrayContaining([
          expect.objectContaining({ provider: 'openai', available: true }),
          expect.objectContaining({ provider: 'whisperkit', available: true }),
          expect.objectContaining({ provider: 'faster-whisper', available: false }),
          expect.objectContaining({ provider: 'whisper.cpp', available: false })
        ])
      }
    });
  });

  it('rejects a local provider without a controlled Runtime installer', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'faster-whisper';

    const response = await server.inject({
      method: 'PATCH',
      url: '/creator-services/config',
      payload: config
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'unsupported_capability' }
    });
    expect(store.write).not.toHaveBeenCalled();
  });

  it('lists provider voices and streams a voice preview', async () => {
    const voices = await server.inject({
      method: 'GET',
      url: '/creator-services/tts/voices?provider=aliyun&model=qwen3-tts-flash'
    });

    expect(voices.statusCode).toBe(200);
    expect(voices.json()).toMatchObject({
      provider: 'aliyun',
      voices: [{ id: 'Cherry', name: '芊悦' }]
    });
    expect(ttsService.listVoices).toHaveBeenCalledWith('aliyun', 'qwen3-tts-flash');

    const preview = await server.inject({
      method: 'POST',
      url: '/creator-services/tts/preview',
      payload: {
        provider: 'aliyun',
        model: 'qwen3-tts-flash',
        voiceId: 'Cherry',
        language: 'ja-JP',
        text: '试听文本'
      }
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toContain('audio/mpeg');
    expect(preview.headers['content-language']).toBe('en');
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.rawPayload.toString()).toBe('preview:Cherry');
    expect(ttsService.preview).toHaveBeenCalledWith({
      provider: 'aliyun',
      model: 'qwen3-tts-flash',
      voiceId: 'Cherry',
      language: 'ja-JP',
      text: '试听文本'
    });
  });

  it('resynthesizes a segment via dub-engine and validates required text', async () => {
    const bad = await server.inject({
      method: 'POST',
      url: '/creator-services/dub-engine/resynthesize-segment',
      payload: {
        text: '   '
      }
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('VALIDATION_FAILED');

    const spy = vi.spyOn(DubEngineClient.prototype, 'resynthesizeSegment').mockResolvedValueOnce({
      ok: true,
      segmentIndex: 0,
      text: 'សួស្តី ភ្នំពេញ',
      audioUrl: '/v1/dub/job-1/resynthesized_0.mp3',
      duration: 1.85
    });

    const good = await server.inject({
      method: 'POST',
      url: '/creator-services/dub-engine/resynthesize-segment',
      payload: {
        jobId: 'job-1',
        segmentIndex: 0,
        text: 'សួស្តី ភ្នំពេញ',
        targetLanguage: 'km'
      }
    });

    expect(good.statusCode).toBe(200);
    expect(good.json()).toEqual({
      ok: true,
      segmentIndex: 0,
      text: 'សួស្តី ភ្នំពេញ',
      audioUrl: '/creator-services/dub-engine/artifacts/job-1/resynthesized_0.mp3',
      duration: 1.85
    });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      segmentIndex: 0,
      text: 'សួស្តី ភ្នំពេញ',
      targetLanguage: 'km'
    }));

    vi.spyOn(DubEngineClient.prototype, 'downloadArtifact').mockResolvedValueOnce(Buffer.from('mock-audio-data'));
    const art = await server.inject({
      method: 'GET',
      url: '/creator-services/dub-engine/artifacts/job-1/resynthesized_0.mp3'
    });
    expect(art.statusCode).toBe(200);
    expect(art.headers['content-type']).toBe('audio/mpeg');
    expect(art.rawPayload).toEqual(Buffer.from('mock-audio-data'));
  });

  it('calculates job time and cost estimates via /creator-services/dub-engine/estimate', async () => {
    vi.spyOn(DubEngineClient.prototype, 'getHardware').mockResolvedValueOnce({
      cpuCores: 12,
      cpuThreads: 24,
      cpuAvx2: true,
      cpuAvx512: false,
      ramTotalGb: 32,
      ramFreeGb: 24,
      gpuName: null,
      gpuVramGb: 0,
      cudaVersion: null,
      gpuComputeCapability: null,
      diskFreeGb: { 'D:': 120 },
      tier: 'T1',
      tierDescription: 'Low'
    });

    const localRes = await server.inject({
      method: 'POST',
      url: '/creator-services/dub-engine/estimate',
      payload: {
        durationSeconds: 60,
        mode: 'local'
      }
    });

    expect(localRes.statusCode).toBe(200);
    const localBody = localRes.json();
    expect(localBody.ok).toBe(true);
    expect(localBody.estimate.mode).toBe('local');
    expect(localBody.estimate.tier).toBe('T1');
    expect(localBody.estimate.durationSeconds).toBe(60);
    expect(localBody.estimate.estimatedCostUsd).toBe(0.0);
    expect(localBody.estimate.estimatedTimeSeconds).toBeGreaterThan(0);

    const apiAssistRes = await server.inject({
      method: 'POST',
      url: '/creator-services/dub-engine/estimate',
      payload: {
        durationSeconds: 120,
        mode: 'api-assist'
      }
    });

    expect(apiAssistRes.statusCode).toBe(200);
    const apiAssistBody = apiAssistRes.json();
    expect(apiAssistBody.ok).toBe(true);
    expect(apiAssistBody.estimate.mode).toBe('api-assist');
    expect(apiAssistBody.estimate.durationSeconds).toBe(120);
    expect(apiAssistBody.estimate.estimatedCostUsd).toBe(0.014);
  });
});
