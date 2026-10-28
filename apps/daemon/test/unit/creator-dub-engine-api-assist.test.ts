import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultCreatorServicesConfig } from '@vishnucreator/protocol';
import { createSmartDubbingExecutor } from '../../src/creator/smart-dubbing/executor.js';
import type { DubEngineService } from '../../src/dub-engine/service.js';

describe('Dub Engine API assist routing (T3.11)', () => {
  function makeMockDubEngine(): DubEngineService {
    return {
      isHealthy: vi.fn(() => true),
      createDubJob: vi.fn(async (req) => ({
        jobId: 'job-assist-1',
        status: 'queued',
        message: 'created'
      })),
      watchJobProgress: vi.fn(async function* () {
        yield { phase: 'completed', percent: 100 };
      }),
      getJobStatus: vi.fn(async () => ({
        jobId: 'job-assist-1',
        status: 'completed',
        progress: null,
        resultUrl: '/v1/dub/job-assist-1/download',
        srtUrl: null,
        kmSrtUrl: null,
        vocalsUrl: null,
        musicUrl: null,
        error: null
      })),
      downloadResult: vi.fn(async () => Buffer.from('ftypmp42mock')),
      downloadArtifact: vi.fn(async () => Buffer.from('mock-artifact'))
    } as unknown as DubEngineService;
  }

  it('forwards cloud LLM credentials to dub engine when mode is api-assist and apiKey is present', async () => {
    const engine = makeMockDubEngine();
    const config = createDefaultCreatorServicesConfig();
    config.dubEngine.enabled = true;
    config.dubEngine.mode = 'api-assist';
    config.llm.baseUrl = 'https://api.openai.com/v1';
    config.llm.apiKey = 'sk-test-secret-key';
    config.llm.model = 'gpt-4o-mini';

    const configStore = {
      read: vi.fn(async () => config),
      update: vi.fn()
    };

    const executor = createSmartDubbingExecutor({
      ttsService: { synthesize: vi.fn() },
      dubEngineService: engine,
      configStore
    });

    const testDir = mkdtempSync(join(tmpdir(), 'vishnu-assist-'));
    try {
      const reportProgress = vi.fn();
      const result = await executor.run({
        job: {
          id: 'job-1',
          state: {
            text: 'Hello world',
            sourceUrl: 'https://example.com/source.mp4',
            style: 'natural',
            speed: 1.0
          }
        } as any,
        inputArtifacts: [],
        stageRun: { id: 'run-1' } as any,
        workdir: testDir,
        signal: new AbortController().signal,
        reportProgress
      });

      expect(engine.createDubJob).toHaveBeenCalledWith(expect.objectContaining({
        sourceUrl: 'https://example.com/source.mp4',
        llmBaseUrl: 'https://api.openai.com/v1',
        llmApiKey: 'sk-test-secret-key',
        llmModel: 'gpt-4o-mini'
      }));
      expect(result.outputs.length).toBeGreaterThan(0);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('enforces offline local execution without forwarding apiKey when mode is local', async () => {
    const engine = makeMockDubEngine();
    const config = createDefaultCreatorServicesConfig();
    config.dubEngine.enabled = true;
    config.dubEngine.mode = 'local';
    config.llm.baseUrl = 'https://api.openai.com/v1';
    config.llm.apiKey = 'sk-test-secret-key';

    const configStore = {
      read: vi.fn(async () => config),
      update: vi.fn()
    };

    const executor = createSmartDubbingExecutor({
      ttsService: { synthesize: vi.fn() },
      dubEngineService: engine,
      configStore
    });

    const testDir = mkdtempSync(join(tmpdir(), 'vishnu-assist-'));
    try {
      const reportProgress = vi.fn();
      await executor.run({
        job: {
          id: 'job-2',
          state: {
            text: 'Hello world',
            sourceUrl: 'https://example.com/source.mp4',
            style: 'natural',
            speed: 1.0
          }
        } as any,
        inputArtifacts: [],
        stageRun: { id: 'run-2' } as any,
        workdir: testDir,
        signal: new AbortController().signal,
        reportProgress
      });

      const callArg = (engine.createDubJob as any).mock.calls[0][0];
      expect(callArg.llmApiKey).toBeUndefined();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('falls back to local execution without error when mode is api-assist but apiKey is absent', async () => {
    const engine = makeMockDubEngine();
    const config = createDefaultCreatorServicesConfig();
    config.dubEngine.enabled = true;
    config.dubEngine.mode = 'api-assist';
    config.llm.apiKey = ''; // no key

    const configStore = {
      read: vi.fn(async () => config),
      update: vi.fn()
    };

    const executor = createSmartDubbingExecutor({
      ttsService: { synthesize: vi.fn() },
      dubEngineService: engine,
      configStore
    });

    const testDir = mkdtempSync(join(tmpdir(), 'vishnu-assist-'));
    try {
      const reportProgress = vi.fn();
      await executor.run({
        job: {
          id: 'job-3',
          state: {
            text: 'Hello world',
            sourceUrl: 'https://example.com/source.mp4',
            style: 'natural',
            speed: 1.0
          }
        } as any,
        inputArtifacts: [],
        stageRun: { id: 'run-3' } as any,
        workdir: testDir,
        signal: new AbortController().signal,
        reportProgress
      });

      const callArg = (engine.createDubJob as any).mock.calls[0][0];
      expect(callArg.llmApiKey).toBeUndefined();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
