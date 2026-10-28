import {
  type CodexImageStatus,
  type CodexProviderConfig,
  type CreatorServicesCapabilitiesResponse,
  type CreatorServicesConfig,
  type CreatorTtsPreviewRequest,
  type CreatorTtsProvider,
  estimateDubJob
} from '@vishnucreator/protocol';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ZodError } from 'zod/v3';
import {
  CreatorServicesConfigStoreError,
  parseCreatorServicesConfig,
  presentCreatorServicesConfig,
  retainCreatorServicesCredentials,
  type CreatorServicesConfigStore
} from '../creator-services/config-store.js';
import { createVishnuCreatorServicesCapabilities } from '../creator/vishnu/capabilities.js';
import { DubEngineClient, DubEngineError } from '../dub-engine/client.js';
import { resolveDubEngineDirectory } from '../dub-engine/service.js';
import {
  VishnuTtsServiceError,
  type VishnuTtsService
} from '../creator/vishnu/tts-service.js';
import { apiError } from './errors.js';
import { gatewayCreatorBinding } from '../gateway/creator-service-source.js';

export async function registerCreatorServicesRoutes(
  server: FastifyInstance,
  store: CreatorServicesConfigStore,
  readCapabilities: () => CreatorServicesCapabilitiesResponse =
    createVishnuCreatorServicesCapabilities,
  ttsService?: Pick<VishnuTtsService, 'listVoices' | 'preview'>,
  onConfigurationChanged?: () => Promise<void> | void,
  readCodexImageStatus?: () => Promise<CodexImageStatus>,
  readCodexModelStatus?: () => Promise<CodexProviderConfig>,
  networkStore: CreatorServicesConfigStore = store
): Promise<void> {
  server.get('/creator-services/network', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try { return { proxy: (await networkStore.read()).proxy }; }
    catch (error) { return sendStoreError(reply, error); }
  });
  server.patch<{ Body: unknown }>('/creator-services/network', async (request, reply) => {
    const body = request.body as { proxy?: unknown } | null;
    const proxy = typeof body?.proxy === 'string' ? body.proxy.trim() : undefined;
    let valid = proxy !== undefined && proxy.length <= 2048;
    if (proxy) {
      try {
        const url = new URL(proxy);
        valid = valid && ['http:', 'https:'].includes(url.protocol) && !!url.hostname
          && !url.search && !url.hash && (url.pathname === '/' || url.pathname === '');
      } catch { valid = false; }
    }
    if (!valid || !body || Object.keys(body).some(key => key !== 'proxy')) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Enter a valid HTTP or HTTPS proxy URL'));
    }
    try {
      const current = await networkStore.read();
      const saved = await networkStore.write({ ...current, proxy: proxy! });
      return { proxy: saved.proxy };
    } catch (error) { return sendStoreError(reply, error); }
  });
  server.get('/creator-services/capabilities', async () => readCapabilities());
  server.get('/creator-services/model/codex/status', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      return await readCodexModelStatus?.() ?? {
        authentication: 'none', apiKeyConfigured: false, baseUrl: '', model: ''
      } satisfies CodexProviderConfig;
    } catch {
      return { authentication: 'none', apiKeyConfigured: false, baseUrl: '', model: '' } satisfies CodexProviderConfig;
    }
  });
  server.get('/creator-services/image/codex/status', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return readCodexImageStatus ? await readCodexImageStatus() : {
      authentication: 'none', ready: false, executionMode: null,
      message: 'Codex image capability checks are not configured. Update or check the Runtime.'
    } satisfies CodexImageStatus;
  });

  server.get('/creator-services/config', async (_request, reply) => {
    try {
      const config = await store.read();
      if (gatewayCreatorBinding(config)) {
        const result = presentCreatorServicesConfig(config);
        clearOfficialAddresses(result.config);
        result.configuredCredentials = [];
        return result;
      }
      return presentCreatorServicesConfig(config);
    } catch (error) {
      return sendStoreError(reply, error);
    }
  });

  server.patch<{ Body: unknown }>('/creator-services/config', async (request, reply) => {
    try {
      const config = parseCreatorServicesConfig(request.body);
      const unsupportedProvider = unsupportedTranscriptionProvider(
        config,
        readCapabilities()
      );
      if (unsupportedProvider !== undefined) {
        return reply.code(400).send(apiError(
          'unsupported_capability',
          `Transcription provider is unavailable on this Runtime: ${unsupportedProvider}`
        ));
      }
      const current = await store.read();
      if (networkStore !== store) config.proxy = (await networkStore.read()).proxy;
      const saved = await store.write(retainCreatorServicesCredentials(config, current));
      try {
        await onConfigurationChanged?.();
      } catch (error) {
        server.log.warn({ error }, 'Creator workflow configuration reconciliation failed');
      }
      return presentCreatorServicesConfig(saved);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }));
        const firstIssue = issues[0];
        return reply.code(400).send(apiError(
          'VALIDATION_FAILED',
          firstIssue === undefined
            ? 'Creator services configuration is invalid'
            : `Invalid field ${firstIssue.field || 'config'}: ${firstIssue.message}`,
          { fields: issues }
        ));
      }
      return sendStoreError(reply, error);
    }
  });

  server.post<{ Body: unknown }>('/creator-services/transcription/test', async (request, reply) => {
    try {
      const body = request.body as { baseUrl?: string; apiKey?: string; model?: string; timeoutMs?: number };
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.replace(/\/+$/, '') : '';
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      if (!/^https?:\/\//i.test(baseUrl) || !model) return reply.code(400).send(apiError('VALIDATION_FAILED', 'FunASR Base URL and model are required'));
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(Math.max(body.timeoutMs ?? 10000, 1000), 60000));
      try {
        const saved = await store.read();
        const configured = saved.transcription.funasr;
        const apiKey = typeof body.apiKey === 'string' && body.apiKey
          ? body.apiKey
          : configured.baseUrl.replace(/\/+$/, '') === baseUrl ? configured.apiKey : '';
        const response = await fetch(`${baseUrl}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: controller.signal });
        const payload = await response.json().catch(() => undefined) as { data?: Array<{ id?: string }> } | undefined;
        if (!response.ok) return reply.code(502).send(apiError('SMART_DUBBING_UPSTREAM_ERROR', `FunASR connection failed (HTTP ${response.status})`));
        const models = Array.isArray(payload?.data)
          ? payload.data.map(item => item.id).filter((id): id is string => typeof id === 'string')
          : [];
        if (!models.includes(model)) return reply.code(502).send(apiError('SMART_DUBBING_UPSTREAM_ERROR', `FunASR model ${model} is not available`));
        return { connected: true, model, models, capabilities: ['audio.transcriptions'] };
      } finally { clearTimeout(timer); }
    } catch (error) { return reply.code(502).send(apiError('SMART_DUBBING_UPSTREAM_ERROR', error instanceof Error && error.name === 'AbortError' ? 'FunASR connection timed out' : 'FunASR connection failed')); }
  });

  // Lists the models an OpenAI-compatible text provider (cloud or local) offers,
  // so presets never rely on a stale built-in model list.
  server.post<{ Body: unknown }>('/creator-services/llm/models', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { baseUrl?: unknown; apiKey?: unknown };
      const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : '';
      if (!/^https?:\/\//i.test(baseUrl)) return reply.code(400).send(apiError('VALIDATION_FAILED', 'A valid model service Base URL is required'));
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const saved = await store.read();
        const apiKey = typeof body.apiKey === 'string' && body.apiKey
          ? body.apiKey
          : saved.llm.baseUrl.trim().replace(/\/+$/, '') === baseUrl ? saved.llm.apiKey : '';
        const response = await fetch(`${baseUrl}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: controller.signal });
        if (!response.ok) return reply.code(502).send(apiError('SMART_DUBBING_UPSTREAM_ERROR', `Model list request failed (HTTP ${response.status})`));
        const payload = await response.json().catch(() => undefined) as { data?: Array<{ id?: unknown }> } | undefined;
        const models = Array.isArray(payload?.data)
          ? [...new Set(payload.data.map(item => item.id).filter((id): id is string => typeof id === 'string' && id.length > 0))].sort()
          : [];
        return { models };
      } finally { clearTimeout(timer); }
    } catch (error) {
      return reply.code(502).send(apiError('SMART_DUBBING_UPSTREAM_ERROR', error instanceof Error && error.name === 'AbortError' ? 'Model list request timed out' : 'Model list request failed'));
    }
  });

  server.post<{ Body: unknown }>('/creator-services/dub-engine/test', async (request, reply) => {
    try {
      const body = (request.body ?? null) as {
        mode?: unknown; url?: unknown; port?: unknown; token?: unknown;
      } | null;
      const saved = await store.read();
      const mode = body?.mode === 'local' || body?.mode === 'remote' || body?.mode === 'auto' || body?.mode === 'api-assist'
        ? body.mode
        : saved.dubEngine.mode;
      const url = typeof body?.url === 'string' && body.url.trim().length > 0
        ? body.url.trim()
        : saved.dubEngine.url;
      const port = typeof body?.port === 'number' && Number.isInteger(body.port)
        && body.port >= 1 && body.port <= 65535
        ? body.port
        : saved.dubEngine.port;
      const token = typeof body?.token === 'string' && body.token.length > 0
        ? body.token
        : saved.dubEngine.token;
      const client = new DubEngineClient({
        enabled: true,
        mode,
        url,
        port,
        token,
        enginePath: saved.dubEngine.enginePath,
        pythonPath: saved.dubEngine.pythonPath,
        autoStart: false
      });
      const health = await client.getHealth();
      const hardware = await client.getHardware();
      return { connected: true, version: health.version, hardware };
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_UNREACHABLE',
        'Dub engine connection failed'
      ));
    }
  });

  server.post<{ Body: unknown }>('/creator-services/dub-engine/benchmark', async (_request, reply) => {
    try {
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true
      });
      const benchmark = await client.runBenchmark(10, 3);
      return { ok: true, benchmark };
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Benchmark failed'
      ));
    }
  });

  server.post<{
    Body: {
      durationSeconds?: number;
      mode?: 'local' | 'api-assist' | 'remote';
      benchmarkTotalSeconds?: number;
    };
  }>('/creator-services/dub-engine/estimate', async (request, reply) => {
    try {
      const { durationSeconds, mode, benchmarkTotalSeconds } = request.body || {};
      const saved = await store.read();
      let tier = 'T1';
      try {
        const client = new DubEngineClient({
          ...saved.dubEngine,
          enabled: true
        });
        const hw = await client.getHardware();
        tier = hw.tier;
      } catch {
        // Fall back to T1 if engine is not reachable
      }
      const estimate = estimateDubJob({
        durationSeconds: durationSeconds ?? 60,
        mode: mode ?? (saved.dubEngine.mode === 'remote' ? 'remote' : saved.dubEngine.mode === 'api-assist' ? 'api-assist' : 'local'),
        tier,
        benchmarkTotalSeconds
      });
      return { ok: true, estimate };
    } catch (error) {
      return reply.code(500).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Estimate failed'
      ));
    }
  });

  server.post<{
    Body: {
      jobId?: string;
      segmentIndex?: number;
      text?: string;
      voiceId?: string;
      provider?: string;
      speed?: number;
      targetLanguage?: string;
    };
  }>('/creator-services/dub-engine/resynthesize-segment', async (request, reply) => {
    try {
      const { jobId, segmentIndex, text, voiceId, provider, speed, targetLanguage } = request.body || {};
      if (typeof text !== 'string' || !text.trim()) {
        return reply.code(400).send(apiError('VALIDATION_FAILED', 'Text is required for re-synthesis'));
      }
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const result = await client.resynthesizeSegment({
        jobId,
        segmentIndex: segmentIndex ?? 0,
        text: text.trim(),
        voiceId,
        provider,
        speed,
        targetLanguage,
      });
      const filename = result.audioUrl ? result.audioUrl.split('/').pop() || '' : '';
      const safeJobId = jobId || 'segment_cache';
      const proxyAudioUrl = filename
        ? `/creator-services/dub-engine/artifacts/${encodeURIComponent(safeJobId)}/${encodeURIComponent(filename)}`
        : result.audioUrl;
      return {
        ...result,
        audioUrl: proxyAudioUrl,
      };
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Re-synthesis failed'
      ));
    }
  });

  server.post<{
    Body: {
      text: string;
      voiceId?: string;
      provider?: string;
      speed?: number;
      referenceAudio?: string;
      referenceText?: string;
    };
  }>('/creator-services/dub-engine/tts/stream', async (request, reply) => {
    try {
      const { text, voiceId, provider, speed, referenceAudio, referenceText } = request.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        return reply.code(400).send(apiError('VALIDATION_FAILED', 'text is required'));
      }
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const upstream = await client.streamTts({
        text: text.trim(),
        voiceId: voiceId || 'km-KH-SreymomNeural',
        provider,
        speed,
        referenceAudio,
        referenceText,
      });
      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'no-cache');
      reply.header('X-Content-Type-Options', 'nosniff');
      if (upstream.body) {
        return reply.send(Readable.fromWeb(upstream.body as any));
      }
      return reply.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Streaming TTS failed'
      ));
    }
  });

  server.get<{
    Params: {
      jobId: string;
      filename: string;
    };
  }>('/creator-services/dub-engine/artifacts/:jobId/:filename', async (request, reply) => {
    try {
      const { jobId, filename } = request.params;
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const buffer = await client.downloadArtifact(jobId, filename);
      const mime = filename.endsWith('.mp3')
        ? 'audio/mpeg'
        : filename.endsWith('.srt')
          ? 'text/plain; charset=utf-8'
          : filename.endsWith('.json')
            ? 'application/json'
            : 'audio/wav';
      return reply
        .header('Content-Type', mime)
        .header('Content-Length', String(buffer.length))
        .header('Cache-Control', 'public, max-age=3600')
        .send(buffer);
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(error.statusCode === 404 ? 404 : 502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Artifact download failed'
      ));
    }
  });

  server.delete('/creator-services/config', async (_request, reply) => {
    try {
      const proxy = networkStore !== store ? (await networkStore.read()).proxy : undefined;
      const reset = await store.reset();
      return presentCreatorServicesConfig(proxy === undefined ? reset : await store.write({ ...reset, proxy }));
    } catch (error) {
      return sendStoreError(reply, error);
    }
  });

  if (ttsService !== undefined) {
    server.get<{
      Querystring: { provider?: string; model?: string };
    }>('/creator-services/tts/voices', async (request, reply) => {
      const provider = parseTtsProvider(request.query.provider);
      if (provider === undefined) {
        return reply.code(400).send(apiError(
          'VALIDATION_FAILED',
          'A valid TTS provider is required'
        ));
      }
      try {
        return await ttsService.listVoices(provider, request.query.model);
      } catch (error) {
        return sendTtsError(reply, error);
      }
    });

    server.post<{ Body: CreatorTtsPreviewRequest }>(
      '/creator-services/tts/preview',
      async (request, reply) => {
        const provider = parseTtsProvider(request.body?.provider);
        if (
          provider === undefined
          || typeof request.body?.voiceId !== 'string'
          || request.body.voiceId.trim().length === 0
        ) {
          return reply.code(400).send(apiError(
            'VALIDATION_FAILED',
            'A valid TTS provider and voice are required'
          ));
        }
        try {
          const result = await ttsService.preview({
            provider,
            voiceId: request.body.voiceId,
            ...(typeof request.body.model === 'string' ? { model: request.body.model } : {}),
            ...(typeof request.body.language === 'string' ? { language: request.body.language } : {}),
            ...(typeof request.body.text === 'string' ? { text: request.body.text } : {})
          });
          if (result.language) reply.header('Content-Language', result.language);
          return reply
            .header('Content-Type', result.mime)
            .header('Content-Length', String(result.content.length))
            .header('Cache-Control', 'no-store')
            .header('X-Content-Type-Options', 'nosniff')
            .send(result.content);
        } catch (error) {
          return sendTtsError(reply, error);
        }
      }
    );
  }

  server.post<{
    Body: {
      prompt?: string;
      speed?: number;
    };
  }>('/creator-services/tts/design-voice', async (request, reply) => {
    const prompt = (request.body?.prompt ?? '').trim();
    if (!prompt) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Prompt is required for voice design'));
    }
    const speed = typeof request.body?.speed === 'number' ? request.body.speed : 1.0;
    try {
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const result = await client.designVoice({ prompt, speed });
      const filename = result.audioUrl ? result.audioUrl.split('/').pop() || '' : '';
      const proxyAudioUrl = filename
        ? `/creator-services/tts/artifacts/${encodeURIComponent(filename)}`
        : result.audioUrl;
      return {
        ...result,
        audioUrl: proxyAudioUrl,
      };
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Voice design failed'
      ));
    }
  });

  function readLocalVoiceDesignsFallback(enginePath?: string): Array<{
    id: string;
    name: string;
    prompt: string;
    duration: number;
    createdAt: string;
    audioUrl: string;
    consent: boolean;
    isSample: boolean;
  }> {
    try {
      const engineDir = resolveDubEngineDirectory({ enginePath: enginePath ?? '' });
      const sampleDir = join(engineDir, 'vishnu_dub', 'data', 'sample_voices');
      const voices: Array<{
        id: string;
        name: string;
        prompt: string;
        duration: number;
        createdAt: string;
        audioUrl: string;
        consent: boolean;
        isSample: boolean;
      }> = [];
      if (existsSync(sampleDir)) {
        for (const entry of readdirSync(sampleDir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            const metaFile = join(sampleDir, entry.name, 'metadata.json');
            if (existsSync(metaFile)) {
              try {
                const parsed = JSON.parse(readFileSync(metaFile, 'utf8'));
                if (parsed && typeof parsed.id === 'string') {
                  voices.push({
                    id: parsed.id,
                    name: typeof parsed.name === 'string' ? parsed.name : parsed.id,
                    prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
                    duration: typeof parsed.duration === 'number' ? parsed.duration : 0,
                    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
                    audioUrl: typeof parsed.audioUrl === 'string' ? parsed.audioUrl : `/creator-services/tts/artifacts/${parsed.id}.wav`,
                    consent: parsed.consent === true,
                    isSample: parsed.isSample === true,
                  });
                }
              } catch {}
            }
          }
        }
      }
      return voices;
    } catch {
      return [];
    }
  }

  function readLocalArtifactFallback(filename: string, enginePath?: string): Buffer | null {
    try {
      const safeName = filename.replace(/^(\.\.(\/|\\|$))+/, '');
      const engineDir = resolveDubEngineDirectory({ enginePath: enginePath ?? '' });
      const sampleDir = join(engineDir, 'vishnu_dub', 'data', 'sample_voices');
      const directPath = join(sampleDir, safeName);
      if (existsSync(directPath)) return readFileSync(directPath);
      if (existsSync(sampleDir)) {
        for (const sub of readdirSync(sampleDir, { withFileTypes: true })) {
          if (sub.isDirectory()) {
            const subPath = join(sampleDir, sub.name, safeName);
            if (existsSync(subPath)) return readFileSync(subPath);
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  function readLocalPreviewFallback(voiceId: string, enginePath?: string): Buffer | null {
    try {
      const safeId = voiceId.replace(/^(\.\.(\/|\\|$))+/, '');
      const engineDir = resolveDubEngineDirectory({ enginePath: enginePath ?? '' });
      const sampleVoiceDir = join(engineDir, 'vishnu_dub', 'data', 'sample_voices', safeId);
      if (existsSync(sampleVoiceDir)) {
        for (const file of readdirSync(sampleVoiceDir)) {
          if (file.endsWith('.wav') || file.endsWith('.mp3')) {
            return readFileSync(join(sampleVoiceDir, file));
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  server.get<{
    Params: { filename: string };
  }>('/creator-services/tts/artifacts/:filename', async (request, reply) => {
    let enginePath: string | undefined;
    try {
      const { filename } = request.params;
      const saved = await store.read();
      enginePath = saved.dubEngine.enginePath;
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const buffer = await client.downloadVoiceDesignArtifact(filename);
      return reply
        .header('Content-Type', 'audio/wav')
        .header('Content-Length', String(buffer.length))
        .header('Cache-Control', 'public, max-age=3600')
        .send(buffer);
    } catch (error) {
      const fallback = readLocalArtifactFallback(request.params.filename, enginePath);
      if (fallback) {
        return reply
          .header('Content-Type', 'audio/wav')
          .header('Content-Length', String(fallback.length))
          .header('Cache-Control', 'public, max-age=3600')
          .send(fallback);
      }
      if (error instanceof DubEngineError) {
        return reply.code(error.statusCode === 404 ? 404 : 502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Voice design artifact download failed'
      ));
    }
  });

  server.get('/creator-services/tts/voices/list', async (_request, reply) => {
    let enginePath: string | undefined;
    try {
      const saved = await store.read();
      enginePath = saved.dubEngine.enginePath;
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const result = await client.listVoiceDesigns();
      return result;
    } catch (error) {
      const fallbackVoices = readLocalVoiceDesignsFallback(enginePath);
      if (fallbackVoices.length > 0) {
        return { voices: fallbackVoices };
      }
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Failed to list voice designs'
      ));
    }
  });

  server.post<{
    Body: { prompt?: string; consent?: boolean };
  }>('/creator-services/tts/voices/save', async (request, reply) => {
    const prompt = (request.body?.prompt ?? '').trim();
    const consent = request.body?.consent === true;
    if (!prompt) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Prompt is required'));
    }
    if (!consent) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Consent is required to save voice design'));
    }
    try {
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const result = await client.saveVoiceDesign({ prompt, consent });
      return result;
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Failed to save voice design'
      ));
    }
  });

  server.post<{
    Body: { voiceId?: string };
  }>('/creator-services/tts/voices/delete', async (request, reply) => {
    const voiceId = request.body?.voiceId;
    if (!voiceId) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Voice ID is required'));
    }
    try {
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      await client.deleteVoiceDesign({ voiceId });
      return { ok: true };
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Failed to delete voice design'
      ));
    }
  });

  server.post<{
    Body: { voiceId?: string };
  }>('/creator-services/tts/voices/preview', async (request, reply) => {
    const voiceId = request.body?.voiceId;
    if (!voiceId) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Voice ID is required'));
    }
    let enginePath: string | undefined;
    try {
      const saved = await store.read();
      enginePath = saved.dubEngine.enginePath;
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const blob = await client.previewVoiceDesign({ voiceId });
      return reply
        .header('Content-Type', 'audio/wav')
        .header('Content-Length', String(blob.length))
        .header('Cache-Control', 'no-store')
        .send(blob);
    } catch (error) {
      const fallback = readLocalPreviewFallback(voiceId, enginePath);
      if (fallback) {
        return reply
          .header('Content-Type', 'audio/wav')
          .header('Content-Length', String(fallback.length))
          .header('Cache-Control', 'no-store')
          .send(fallback);
      }
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Voice preview failed'
      ));
    }
  });

  server.post<{
    Body: { voiceId?: string };
  }>('/creator-services/tts/voices/export', async (request, reply) => {
    const voiceId = request.body?.voiceId;
    if (!voiceId) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Voice ID is required'));
    }
    try {
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const result = await client.exportVoiceDesign(voiceId);
      return result;
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Voice export failed'
      ));
    }
  });

  server.post<{
    Body: { name?: string; prompt?: string; audioData?: string; consent?: boolean; loraWeightsBase64?: string };
  }>('/creator-services/tts/voices/import', async (request, reply) => {
    const { name, prompt, audioData, consent, loraWeightsBase64 } = request.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Voice name is required'));
    }
    if (!audioData || typeof audioData !== 'string') {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Audio data is required'));
    }
    if (!consent) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', 'Consent is required'));
    }
    try {
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const result = await client.importVoiceDesign({
        name: name.trim(),
        prompt: prompt?.trim(),
        audioData,
        consent: true,
        loraWeightsBase64,
      });
      return result;
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Voice import failed'
      ));
    }
  });

  server.get('/creator-services/hardware/performance', async (_request, reply) => {
    try {
      const saved = await store.read();
      const client = new DubEngineClient({
        ...saved.dubEngine,
        enabled: true,
      });
      const result = await client.getHardwarePerformance();
      return result;
    } catch (error) {
      if (error instanceof DubEngineError) {
        return reply.code(502).send(apiError('DUB_ENGINE_ERROR', error.message));
      }
      return reply.code(502).send(apiError(
        'DUB_ENGINE_ERROR',
        error instanceof Error ? error.message : 'Failed to query hardware performance'
      ));
    }
  });
}


function clearOfficialAddresses(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'baseUrl' || key === 'apiKey' || key === 'proxy') (value as Record<string, unknown>)[key] = '';
    else clearOfficialAddresses(child);
  }
}

function sendStoreError(reply: FastifyReply, error: unknown) {
  if (error instanceof CreatorServicesConfigStoreError) {
    return reply.code(503).send(apiError(error.code, 'Local configuration file is unavailable'));
  }
  throw error;
}

function sendTtsError(reply: FastifyReply, error: unknown) {
  if (error instanceof VishnuTtsServiceError) {
    return reply.code(error.statusCode).send(apiError(error.code, error.message, undefined, undefined, error.publicFacts));
  }
  throw error;
}

function parseTtsProvider(value: unknown): CreatorTtsProvider | undefined {
  if (value === 'openai' || value === 'aliyun' || value === 'minimax' || value === 'edge-tts' || value === 'volcengine') {
    return value;
  }
  return undefined;
}

function unsupportedTranscriptionProvider(
  config: CreatorServicesConfig,
  capabilities: CreatorServicesCapabilitiesResponse
): CreatorServicesConfig['transcription']['provider'] | undefined {
  const selected = capabilities.transcription.providers.find(
    candidate => candidate.provider === config.transcription.provider
  );
  return selected?.available === true ? undefined : config.transcription.provider;
}
