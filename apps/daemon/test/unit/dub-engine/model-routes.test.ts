import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultCreatorServicesConfig, type CreatorServicesConfig } from '@vishnucreator/protocol';
import { registerDubEngineRuntimeRoutes } from '../../../src/api/routes.dub-engine-runtime.js';
import { DubEngineRuntime } from '../../../src/dub-engine/runtime.js';
import { DubModelManager } from '../../../src/dub-engine/model-manager.js';

describe('Dub Engine Model HTTP Routes (T7.2)', () => {
  let server: FastifyInstance;
  let tempDir: string;
  let runtime: DubEngineRuntime;
  let modelManager: DubModelManager;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `vishnu-routes-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tempDir, { recursive: true });

    let config = createDefaultCreatorServicesConfig();
    config.dubEngine.modelFolder = tempDir;

    const configStore = {
      read: vi.fn(async () => structuredClone(config)),
      write: vi.fn(async (next: CreatorServicesConfig) => {
        config = structuredClone(next);
        return structuredClone(config);
      }),
    };

    runtime = new DubEngineRuntime(configStore);
    modelManager = runtime.getModelManager();

    server = Fastify();
    await registerDubEngineRuntimeRoutes(server, runtime);
  });

  afterEach(async () => {
    await server.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('GET /creator-services/dub/models returns the catalog list and disk space', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/creator-services/dub/models',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.modelsRoot).toBeTruthy();
    expect(typeof body.availableDiskFreeBytes).toBe('number');
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThanOrEqual(6);

    const ids = body.models.map((m: any) => m.id);
    expect(ids).toContain('whisper-small-int8');
    expect(ids).toContain('htdemucs');
    expect(ids).toContain('voxcpm2-khmer');
  });

  it('GET /v1/dub/models acts as an alias to /creator-services/dub/models', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/v1/dub/models',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.models)).toBe(true);
  });

  it('POST /creator-services/dub/models/download validates request body', async () => {
    // Missing body
    const emptyRes = await server.inject({
      method: 'POST',
      url: '/creator-services/dub/models/download',
      payload: {},
    });
    expect(emptyRes.statusCode).toBe(400);
    expect(emptyRes.json().error.code).toBe('VALIDATION_FAILED');

    // Unknown model
    const notFoundRes = await server.inject({
      method: 'POST',
      url: '/creator-services/dub/models/download',
      payload: { modelId: 'nonexistent-model' },
    });
    expect(notFoundRes.statusCode).toBe(404);
    expect(notFoundRes.json().error.code).toBe('dub_model_not_found');
  });

  it('POST /creator-services/dub/models/download accepts valid model and triggers download', async () => {
    // Mock downloadModel on modelManager to avoid network calls
    vi.spyOn(modelManager, 'downloadModel').mockImplementation(async req => ({
      modelId: req.modelId,
      status: 'installed',
      bytesDownloaded: 100,
      totalBytes: 100,
      percent: 100,
      speedBytesPerSec: 0,
    }));

    const res = await server.inject({
      method: 'POST',
      url: '/creator-services/dub/models/download',
      payload: { modelId: 'whisper-small-int8' },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.modelId).toBe('whisper-small-int8');
    expect(['downloading', 'installed']).toContain(body.status);
  });

  it('GET /creator-services/dub/models/download/:modelId returns model status', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/creator-services/dub/models/download/whisper-small-int8',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.modelId).toBe('whisper-small-int8');
    expect(body.status).toBe('idle');
  });

  it('GET /creator-services/dub/models/download/:modelId returns 404 for unknown model', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/creator-services/dub/models/download/nonexistent-model',
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /creator-services/dub/models/verify validates parameters and returns verification result', async () => {
    // Missing modelId
    const missingRes = await server.inject({
      method: 'POST',
      url: '/creator-services/dub/models/verify',
      payload: {},
    });
    expect(missingRes.statusCode).toBe(400);

    // Uninstalled model verification
    const verifyRes = await server.inject({
      method: 'POST',
      url: '/creator-services/dub/models/verify',
      payload: { modelId: 'whisper-small-int8' },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().valid).toBe(false);
  });

  it('DELETE /creator-services/dub/models/:modelId deletes model from store', async () => {
    const delRes = await server.inject({
      method: 'DELETE',
      url: '/creator-services/dub/models/whisper-small-int8',
    });

    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().modelId).toBe('whisper-small-int8');
  });
});
