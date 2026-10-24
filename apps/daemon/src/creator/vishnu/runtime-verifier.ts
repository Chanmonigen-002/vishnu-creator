import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  readVishnuRuntimeManifest,
  verifyVishnuRuntimeManifest
} from './manifest.js';

export type VishnuRuntimeVerificationResult = {
  cacheHit: boolean;
};

export function hasVishnuRuntimeVerificationWorker(): boolean {
  return existsSync(fileURLToPath(verificationWorkerUrl()));
}

export function startVishnuRuntimeVerification(input: {
  resourceRoot: string;
  cachePath: string;
}): Promise<VishnuRuntimeVerificationResult> {
  const workerUrl = verificationWorkerUrl();
  if (!hasVishnuRuntimeVerificationWorker()) {
    return new Promise((resolvePromise, reject) => {
      setImmediate(() => {
        try {
          const manifest = readVishnuRuntimeManifest(input.resourceRoot);
          resolvePromise(verifyVishnuRuntimeManifest(input.resourceRoot, manifest, {
            cachePath: input.cachePath
          }));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  return new Promise((resolvePromise, reject) => {
    const worker = new Worker(workerUrl, { workerData: input });
    let settled = false;
    worker.unref();
    worker.once('message', (message: unknown) => {
      if (settled) return;
      settled = true;
      if (
        typeof message === 'object'
        && message !== null
        && 'ok' in message
        && message.ok === true
        && 'cacheHit' in message
        && typeof message.cacheHit === 'boolean'
      ) {
        resolvePromise({ cacheHit: message.cacheHit });
        return;
      }
      const detail = typeof message === 'object'
        && message !== null
        && 'message' in message
        && typeof message.message === 'string'
        ? message.message
        : 'VishnuAI runtime verification failed';
      reject(new Error(detail));
    });
    worker.once('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    worker.once('exit', code => {
      if (settled) return;
      settled = true;
      reject(new Error(`VishnuAI runtime verification worker exited with code ${code}`));
    });
  });
}

function verificationWorkerUrl(): URL {
  return new URL('./verification-worker.js', import.meta.url);
}
