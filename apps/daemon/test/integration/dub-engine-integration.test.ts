import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDubEngineService } from '../../src/dub-engine/service.js';
import { createSmartDubbingExecutor } from '../../src/creator/smart-dubbing/executor.js';

describe('Dub engine daemon integration', () => {
  it('executes smart dubbing through dub engine and registers all artifacts', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dub-engine-int-'));

    try {
      const mockResultBuffer = Buffer.from('RIFF....WAVEfmt ....data....');
      const mockSrtBuffer = Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHello world\n');
      const mockKmSrtBuffer = Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nសួស្តីពិភពលោក\n');
      const mockVocalsBuffer = Buffer.from('RIFF....WAVEfmt ....data[vocals]....');
      const mockMusicBuffer = Buffer.from('RIFF....WAVEfmt ....data[music]....');

      const mockEngine = {
        isHealthy: () => true,
        createDubJob: vi.fn(async () => ({
          jobId: 'job_integration_123',
          status: 'running' as const,
          message: 'Job started'
        })),
        watchJobProgress: vi.fn(async function* () {
          yield { phase: 'asr', percent: 30, message: 'Transcribing' };
          yield { phase: 'translation', percent: 60, message: 'Translating' };
          yield { phase: 'tts', percent: 90, message: 'Synthesizing' };
          yield { phase: 'completed', percent: 100, message: 'Done' };
        }),
        getJobStatus: vi.fn(async () => ({
          jobId: 'job_integration_123',
          status: 'completed' as const,
          progress: { phase: 'completed', percent: 100 },
          resultUrl: '/v1/dub/job_integration_123/download',
          srtUrl: '/v1/dub/job_integration_123/artifacts/source.srt',
          kmSrtUrl: '/v1/dub/job_integration_123/artifacts/km.srt',
          vocalsUrl: '/v1/dub/job_integration_123/artifacts/vocals.wav',
          musicUrl: '/v1/dub/job_integration_123/artifacts/music.wav',
          error: null
        })),
        downloadResult: vi.fn(async () => mockResultBuffer),
        downloadArtifact: vi.fn(async (_jobId: string, filename: string) => {
          if (filename === 'source.srt') return mockSrtBuffer;
          if (filename === 'km.srt') return mockKmSrtBuffer;
          if (filename === 'vocals.wav') return mockVocalsBuffer;
          if (filename === 'music.wav') return mockMusicBuffer;
          throw new Error('Unknown artifact: ' + filename);
        })
      };

      const executor = createSmartDubbingExecutor({
        ttsService: { synthesize: vi.fn() },
        dubEngineService: mockEngine as any
      });

      const reportedProgress: any[] = [];
      const stage = {
        workdir: tempDir,
        signal: new AbortController().signal,
        job: {
          id: 'test_job',
          state: {
            text: 'Hello world dubbing test',
            sourceUrl: 'https://example.com/clip.mp4',
            style: 'warm',
            speed: 1.0,
            format: 'mp3'
          }
        },
        reportProgress: (p: any) => reportedProgress.push(p)
      };

      const result = await executor.run(stage as any);

      expect(mockEngine.createDubJob).toHaveBeenCalledWith(expect.objectContaining({
        sourceUrl: 'https://example.com/clip.mp4',
        targetLanguage: 'km',
        ttsProvider: 'edge-tts'
      }));

      // Verify all artifacts were downloaded and registered
      expect(result.outputs).toHaveLength(5);
      const outputKinds = result.outputs.map(o => o.kind);
      expect(outputKinds).toContain('dubbed_audio');
      expect(outputKinds).toContain('source_srt');
      expect(outputKinds).toContain('khmer_srt');
      expect(outputKinds).toContain('vocals_stem');
      expect(outputKinds).toContain('music_stem');

      // Verify progress phases were mapped
      expect(reportedProgress.some(p => p.phase === 'transcribing')).toBe(true);
      expect(reportedProgress.some(p => p.phase === 'translating')).toBe(true);
      expect(reportedProgress.some(p => p.phase === 'synthesizing_voice')).toBe(true);
      expect(result.progress?.phase).toBe('completed');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
