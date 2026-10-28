import type { FastifyInstance } from 'fastify';
import type { DubEngineRuntime } from '../dub-engine/runtime.js';
import { apiError } from './errors.js';

/** Status and start/stop for the local dub engine while the app runs (T6.7), plus model management (T7.2). */
export async function registerDubEngineRuntimeRoutes(server: FastifyInstance, runtime: DubEngineRuntime): Promise<void> {
  server.get('/creator-services/dub-engine/status', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return await runtime.status();
  });

  server.post('/creator-services/dub-engine/start', async (_request, reply) => {
    try {
      return await runtime.start();
    } catch (error) {
      return reply.code(500).send(apiError('INTERNAL_ERROR', error instanceof Error ? error.message : 'Could not start the dub engine'));
    }
  });

  server.post('/creator-services/dub-engine/stop', async () => await runtime.stop());

  // ─── Model Management Endpoints (T7.2) ────────────────────────────────────

  const registerModelRoutes = (prefix: string) => {
    // List models with cache status and disk space
    server.get(`${prefix}/models`, async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return await runtime.getModelManager().listModels();
      } catch (error) {
        return reply.code(500).send(apiError('INTERNAL_ERROR', error instanceof Error ? error.message : 'Failed to list models'));
      }
    });

    // Start downloading a model
    server.post<{ Body: { modelId?: string; forceRedownload?: boolean } }>(
      `${prefix}/models/download`,
      async (request, reply) => {
        const body = request.body || {};
        const modelId = typeof body.modelId === 'string' ? body.modelId.trim() : '';
        if (!modelId) {
          return reply.code(400).send(apiError('VALIDATION_FAILED', 'modelId is required'));
        }

        const modelManager = runtime.getModelManager();
        const existing = await modelManager.getModel(modelId);
        if (!existing) {
          return reply.code(404).send(apiError('dub_model_not_found', `Model "${modelId}" is not in the catalog`));
        }

        // Trigger download asynchronously
        const downloadPromise = modelManager.downloadModel({
          modelId,
          forceRedownload: Boolean(body.forceRedownload),
        });

        // Catch background download failures so unhandled promise rejection doesn't occur
        downloadPromise.catch(err => {
          server.log.warn({ modelId, err }, '[dub-engine] background model download failed');
        });

        // Return initial progress or active state immediately
        const progress = modelManager.getProgress(modelId) ?? {
          modelId,
          status: 'downloading',
          bytesDownloaded: 0,
          totalBytes: existing.sizeBytes,
          percent: 0,
          speedBytesPerSec: 0,
        };

        return reply.code(202).send(progress);
      }
    );

    // Get download progress for a specific model
    server.get<{ Params: { modelId: string } }>(
      `${prefix}/models/download/:modelId`,
      async (request, reply) => {
        const modelId = request.params.modelId.trim();
        const modelManager = runtime.getModelManager();
        const activeProgress = modelManager.getProgress(modelId);
        if (activeProgress) {
          return activeProgress;
        }

        const item = await modelManager.getModel(modelId);
        if (!item) {
          return reply.code(404).send(apiError('dub_model_not_found', `Model "${modelId}" not found`));
        }

        return {
          modelId: item.id,
          status: item.installed ? 'installed' : 'idle',
          bytesDownloaded: item.localSizeBytes ?? 0,
          totalBytes: item.sizeBytes,
          percent: item.installed ? 100 : 0,
          speedBytesPerSec: 0,
          localPath: item.localPath,
        };
      }
    );

    // Verify SHA-256 checksum of an installed model
    server.post<{ Body: { modelId?: string } }>(
      `${prefix}/models/verify`,
      async (request, reply) => {
        const body = request.body || {};
        const modelId = typeof body.modelId === 'string' ? body.modelId.trim() : '';
        if (!modelId) {
          return reply.code(400).send(apiError('VALIDATION_FAILED', 'modelId is required'));
        }

        const result = await runtime.getModelManager().verifyModel(modelId);
        if (result.error && !result.expectedSha256) {
          return reply.code(404).send(apiError('dub_model_not_found', result.error));
        }
        return result;
      }
    );

    // Delete a model from cache
    server.delete<{ Params: { modelId: string } }>(
      `${prefix}/models/:modelId`,
      async (request, reply) => {
        const modelId = request.params.modelId.trim();
        const result = await runtime.getModelManager().deleteModel(modelId);
        return result;
      }
    );
  };

  registerModelRoutes('/creator-services/dub');
  registerModelRoutes('/v1/dub');
}
