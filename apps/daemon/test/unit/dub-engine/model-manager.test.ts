import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DubModelManager,
  checkFreeDiskSpace,
  computeFileSha256,
  resolveModelsCacheDirectory,
} from '../../../src/dub-engine/model-manager.js';
import type { ModelCatalogItem, ModelDownloadProgress } from '@vishnucreator/protocol';

describe('DubModelManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `vishnu-model-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    vi.restoreAllMocks();
  });

  describe('resolveModelsCacheDirectory', () => {
    it('uses customDir when explicitly provided', () => {
      const custom = join(tempDir, 'my-custom-models');
      const resolved = resolveModelsCacheDirectory({ customDir: custom });
      expect(resolved).toBe(custom);
      expect(existsSync(custom)).toBe(true);
    });

    it('honors VISHNU_DUB_MODEL_STORE env override', () => {
      const custom = join(tempDir, 'env-models');
      vi.stubEnv('VISHNU_DUB_MODEL_STORE', custom);

      const resolved = resolveModelsCacheDirectory();
      expect(resolved).toBe(custom);
      expect(existsSync(custom)).toBe(true);
    });

    it('honors VISHNUCREATOR_MODELS_DIR env override', () => {
      const custom = join(tempDir, 'models-dir');
      vi.stubEnv('VISHNU_DUB_MODEL_STORE', '');
      vi.stubEnv('VISHNUCREATOR_MODELS_DIR', custom);

      const resolved = resolveModelsCacheDirectory();
      expect(resolved).toBe(custom);
      expect(existsSync(custom)).toBe(true);
    });

    it('resolves cache directory on default drive or home', () => {
      vi.stubEnv('VISHNU_DUB_MODEL_STORE', '');
      vi.stubEnv('VISHNUCREATOR_MODELS_DIR', '');
      vi.stubEnv('VISHNU_MODEL_DIR', '');

      const resolved = resolveModelsCacheDirectory({ userHome: tempDir });
      expect(existsSync(resolved)).toBe(true);
      expect(resolved).toMatch(/(?:\.vishnucreator|VishnuCreatorData)[\\/]models/);
    });
  });

  describe('checkFreeDiskSpace & computeFileSha256', () => {
    it('passes space check for small required size', () => {
      expect(() => checkFreeDiskSpace(tempDir, 1024, 1024)).not.toThrow();
    });

    it('computes streaming SHA-256 digest accurately', async () => {
      const testFile = join(tempDir, 'test.bin');
      const content = Buffer.from('Vishnu Creator Model Downloader Test Content');
      writeFileSync(testFile, content);

      const expected = createHash('sha256').update(content).digest('hex');
      const calculated = await computeFileSha256(testFile);
      expect(calculated).toBe(expected);
    });
  });

  describe('Model listing, verification, and deletion', () => {
    const samplePayload = Buffer.from('Whisper test weights 12345');
    const sampleHash = createHash('sha256').update(samplePayload).digest('hex');

    const testCatalog: ModelCatalogItem[] = [
      {
        id: 'test-model-1',
        name: 'Test Model One',
        category: 'asr',
        description: 'Test ASR model',
        sizeBytes: samplePayload.length,
        expectedSha256: sampleHash,
        sourceUrl: 'https://example.com/models/test-model-1.bin',
        filename: 'weights.bin',
        targetSubdir: 'asr/test',
        recommendedForTier: ['T1'],
      },
    ];

    it('lists catalog models with installation state', async () => {
      const manager = new DubModelManager({
        modelsDir: tempDir,
        catalog: testCatalog,
      });

      const listBefore = await manager.listModels();
      expect(listBefore.modelsRoot).toBe(tempDir);
      expect(listBefore.models).toHaveLength(1);
      expect(listBefore.models[0]?.installed).toBe(false);

      // Create model file in target subdirectory
      const targetPath = manager.resolveLocalModelPath(testCatalog[0]!);
      mkdirSync(join(targetPath, '..'), { recursive: true });
      writeFileSync(targetPath, samplePayload);

      const listAfter = await manager.listModels();
      expect(listAfter.models[0]?.installed).toBe(true);
      expect(listAfter.models[0]?.localSizeBytes).toBe(samplePayload.length);
    });

    it('verifies valid and corrupted model files', async () => {
      const manager = new DubModelManager({
        modelsDir: tempDir,
        catalog: testCatalog,
      });

      // 1. Missing file
      const missingVerify = await manager.verifyModel('test-model-1');
      expect(missingVerify.valid).toBe(false);
      expect(missingVerify.error).toContain('not found');

      // 2. Corrupt file
      const targetPath = manager.resolveLocalModelPath(testCatalog[0]!);
      mkdirSync(join(targetPath, '..'), { recursive: true });
      writeFileSync(targetPath, Buffer.from('Damaged corrupted content'));

      const corruptVerify = await manager.verifyModel('test-model-1');
      expect(corruptVerify.valid).toBe(false);
      expect(corruptVerify.calculatedSha256).not.toBe(sampleHash);

      // 3. Valid file
      writeFileSync(targetPath, samplePayload);
      const validVerify = await manager.verifyModel('test-model-1');
      expect(validVerify.valid).toBe(true);
      expect(validVerify.calculatedSha256).toBe(sampleHash);
    });

    it('deletes model files and partial files', async () => {
      const manager = new DubModelManager({
        modelsDir: tempDir,
        catalog: testCatalog,
      });

      const targetPath = manager.resolveLocalModelPath(testCatalog[0]!);
      mkdirSync(join(targetPath, '..'), { recursive: true });
      writeFileSync(targetPath, samplePayload);
      writeFileSync(`${targetPath}.part`, Buffer.from('partial download'));

      const deleteRes = await manager.deleteModel('test-model-1');
      expect(deleteRes.deleted).toBe(true);
      expect(existsSync(targetPath)).toBe(false);
      expect(existsSync(`${targetPath}.part`)).toBe(false);
    });
  });

  describe('Resumable download and checksum verification', () => {
    it('downloads model and verifies SHA-256 atomically', async () => {
      const payload = Buffer.from('Full model tensor binary stream content');
      const hash = createHash('sha256').update(payload).digest('hex');

      const mockCatalog: ModelCatalogItem[] = [
        {
          id: 'test-download-model',
          name: 'Test Download Model',
          category: 'tts',
          description: 'TTS weights',
          sizeBytes: payload.length,
          expectedSha256: hash,
          sourceUrl: 'https://example.com/test-tts.safetensors',
          filename: 'test-tts.safetensors',
          targetSubdir: 'tts',
          recommendedForTier: ['T1'],
        },
      ];

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(payload));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'content-length': String(payload.length) },
        });
      });

      const manager = new DubModelManager({
        modelsDir: tempDir,
        catalog: mockCatalog,
        fetchFn: mockFetch,
        safetyMarginBytes: 1024,
      });

      const progressUpdates: ModelDownloadProgress[] = [];
      const finalProgress = await manager.downloadModel(
        { modelId: 'test-download-model' },
        prog => progressUpdates.push({ ...prog })
      );

      expect(finalProgress.status).toBe('installed');
      expect(finalProgress.percent).toBe(100);

      const targetFile = manager.resolveLocalModelPath(mockCatalog[0]!);
      expect(existsSync(targetFile)).toBe(true);
      expect(readFileSync(targetFile)).toEqual(payload);
      expect(existsSync(`${targetFile}.part`)).toBe(false);
    });

    it('rejects download when SHA-256 does not match and cleans up .part file', async () => {
      const payload = Buffer.from('Unexpected bad data payload');
      const expectedHash = '0000000000000000000000000000000000000000000000000000000000000000';

      const mockCatalog: ModelCatalogItem[] = [
        {
          id: 'bad-hash-model',
          name: 'Bad Hash Model',
          category: 'separation',
          description: 'Model with bad hash',
          sizeBytes: payload.length,
          expectedSha256: expectedHash,
          sourceUrl: 'https://example.com/bad.bin',
          filename: 'bad.bin',
          targetSubdir: 'separation',
          recommendedForTier: ['T1'],
        },
      ];

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(payload));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { 'content-length': String(payload.length) },
        });
      });

      const manager = new DubModelManager({
        modelsDir: tempDir,
        catalog: mockCatalog,
        fetchFn: mockFetch,
        safetyMarginBytes: 1024,
      });

      await expect(
        manager.downloadModel({ modelId: 'bad-hash-model' })
      ).rejects.toThrow(/SHA-256 verification failed/);

      const targetFile = manager.resolveLocalModelPath(mockCatalog[0]!);
      expect(existsSync(targetFile)).toBe(false);
      expect(existsSync(`${targetFile}.part`)).toBe(false);
    });

    it('resumes from existing .part file via HTTP 206', async () => {
      const firstChunk = Buffer.from('Part 1 of model data; ');
      const secondChunk = Buffer.from('Part 2 remaining tensors.');
      const fullPayload = Buffer.concat([firstChunk, secondChunk]);
      const fullHash = createHash('sha256').update(fullPayload).digest('hex');

      const mockCatalog: ModelCatalogItem[] = [
        {
          id: 'resume-model',
          name: 'Resume Model',
          category: 'asr',
          description: 'Resumable model',
          sizeBytes: fullPayload.length,
          expectedSha256: fullHash,
          sourceUrl: 'https://example.com/resumable.bin',
          filename: 'resumable.bin',
          targetSubdir: 'asr',
          recommendedForTier: ['T1'],
        },
      ];

      let sentRangeHeader: string | null = null;
      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        sentRangeHeader = headers?.['Range'] || null;

        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(secondChunk));
            controller.close();
          },
        });

        return new Response(stream, {
          status: 206,
          headers: { 'content-length': String(secondChunk.length) },
        });
      });

      const manager = new DubModelManager({
        modelsDir: tempDir,
        catalog: mockCatalog,
        fetchFn: mockFetch,
        safetyMarginBytes: 1024,
      });

      // Pre-create .part file with first chunk
      const targetFile = manager.resolveLocalModelPath(mockCatalog[0]!);
      mkdirSync(join(targetFile, '..'), { recursive: true });
      writeFileSync(`${targetFile}.part`, firstChunk);

      const result = await manager.downloadModel({ modelId: 'resume-model' });
      expect(result.status).toBe('installed');
      expect(sentRangeHeader).toBe(`bytes=${firstChunk.length}-`);
      expect(readFileSync(targetFile)).toEqual(fullPayload);
    });

    it('supports cancellation during download', async () => {
      const mockCatalog: ModelCatalogItem[] = [
        {
          id: 'cancel-model',
          name: 'Cancel Model',
          category: 'asr',
          description: 'Model to cancel',
          sizeBytes: 1000000,
          expectedSha256: 'abcdef',
          sourceUrl: 'https://example.com/cancel.bin',
          filename: 'cancel.bin',
          targetSubdir: 'asr',
          recommendedForTier: ['T1'],
        },
      ];

      const mockFetch: typeof fetch = vi.fn().mockImplementation(async (_url, init) => {
        const signal = init?.signal as AbortSignal;
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(Buffer.from('small chunk')));
            // Don't close immediately; wait for abort
            signal.addEventListener('abort', () => {
              controller.error(new Error('Aborted'));
            });
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { 'content-length': '1000000' },
        });
      });

      const manager = new DubModelManager({
        modelsDir: tempDir,
        catalog: mockCatalog,
        fetchFn: mockFetch,
        safetyMarginBytes: 1024,
      });

      const downloadPromise = manager.downloadModel({ modelId: 'cancel-model' });

      // Cancel right away
      const cancelled = manager.cancelDownload('cancel-model');
      expect(cancelled).toBe(true);

      const result = await downloadPromise;
      expect(result.status).toBe('idle');
    });
  });
});
