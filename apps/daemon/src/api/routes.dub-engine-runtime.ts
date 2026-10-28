import type { FastifyInstance } from 'fastify';
import type { DubEngineRuntime } from '../dub-engine/runtime.js';
import { apiError } from './errors.js';

/** Status and start/stop for the local dub engine while the app runs (T6.7). */
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
}
