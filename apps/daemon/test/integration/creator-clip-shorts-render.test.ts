import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { CreatorArtifact, CreatorJob, CreatorStageRun } from '@vishnucreator/protocol';
import { createClipExecutor } from '../../src/creator/clip/executor.js';

const repoRoot = resolve(process.cwd(), '../..');
const runtimeRoot = resolve(
  process.env.VISHNUCREATOR_CREATOR_RUNTIME_ROOT
    ?? join(repoRoot, 'apps/desktop/.pack/creator-runtime/vishnuai')
);
const suffix = process.platform === 'win32' ? '.exe' : '';
const ffmpegPath = join(runtimeRoot, 'bin', `ffmpeg${suffix}`);
const ffprobePath = join(runtimeRoot, 'bin', `ffprobe${suffix}`);
const fontsDir = join(runtimeRoot, 'fonts');
const hasPackagedRuntime = [ffmpegPath, ffprobePath, join(fontsDir, 'manifest.json')].every(existsSync);
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe.runIf(hasPackagedRuntime)('Creator packaged 9:16 short rendering', () => {
  it('renders a vertical short with burned Khmer karaoke captions using the packaged ffmpeg', () => {
    const root = mkdtempSync(join(tmpdir(), 'vishnucreator-clip-shorts-'));
    roots.push(root);
    const workdir = join(root, 'work');
    mkdirSync(workdir);

    // Synthetic test input (lavfi test pattern + tone); the assert target is
    // the executor's real output mp4, not the input.
    const sourcePath = join(root, 'source.mp4');
    const generate = spawnSync(
      ffmpegPath,
      ['-y', '-v', 'error',
        '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=10',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest',
        sourcePath],
      { timeout: 120_000 }
    );
    expect(generate.status).toBe(0);

    const candidatesPath = join(root, 'clip-candidates.json');
    writeFileSync(candidatesPath, JSON.stringify({
      candidates: [{
        id: 'short-1',
        title: 'Khmer short',
        start: 1,
        end: 7,
        transcript: 'ខ្មែរ៣ ពិតជាល្អណាស់។',
        reason: 'integration probe',
        scores: { hook: 90, information: 85, emotion: 80, completeness: 95 }
      }]
    }));

    const subtitlePath = join(root, 'subtitle.srt');
    writeFileSync(subtitlePath, [
      '1', '00:00:01,000 --> 00:00:03,000', 'ភាសាខ្មែរ',
      '',
      '2', '00:00:03,500 --> 00:00:06,000', 'Explore the world',
      ''
    ].join('\n'));

    const reportProgress = vi.fn();
    const executor = createClipExecutor({
      configStore: { read: vi.fn() } as never,
      ffmpegPath,
      ffprobePath,
      fontsDir,
      preferHardwareEncoding: false
    });

    return executor.run({
      stageRun: stageRun(),
      job: job(),
      inputArtifacts: [
        artifact('source', 'source_video', sourcePath),
        artifact('candidates', 'clip_candidates', candidatesPath),
        artifact('subtitle', 'target_subtitle', subtitlePath)
      ],
      workdir,
      signal: new AbortController().signal,
      reportProgress
    }).then(result => {
      expect(result.progress).toMatchObject({ completed: 1, failed: 0, total: 1 });
      expect(result.outputs).toHaveLength(1);
      const output = result.outputs[0]!;
      expect(output.path?.endsWith('01-Khmer-short.mp4') ?? false).toBe(true);
      expect(output.metadata).toMatchObject({
        candidateId: 'short-1',
        captionsStyle: 'karaoke'
      });
      expect(output.metadata?.captionsArtifact).toBe('01-Khmer-short-captions.ass');
      const assPath = join(workdir, '01-Khmer-short-captions.ass');
      const ass = readFileSync(assPath, 'utf8');
      expect(ass).toContain('PlayResX: 1080');
      expect(ass).toContain('PlayResY: 1920');
      expect(ass).toContain('ភា');
      expect(ass).toContain('ខ្មែ');
      expect(ass).toContain('\\k');
      expect(existsSync(output.path!)).toBe(true);
      expect(readFileSync(output.path!, 'utf8').slice(4, 8)).toBe('ftyp');

      const probe = spawnSync(
        ffprobePath,
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', output.path!],
        { timeout: 60_000 }
      );
      expect(probe.status).toBe(0);
      const parsed = JSON.parse(String(probe.stdout)) as {
        format: { duration: string };
        streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>;
      };
      const video = parsed.streams.find(stream => stream.codec_type === 'video');
      const audio = parsed.streams.find(stream => stream.codec_type === 'audio');
      expect(video).toMatchObject({ codec_name: 'h264', width: 1080, height: 1920 });
      expect(audio).toMatchObject({ codec_name: 'aac' });
      const duration = Number(parsed.format.duration);
      expect(duration).toBeGreaterThanOrEqual(5.5);
      expect(duration).toBeLessThanOrEqual(7.5);
    });
  });
});

function artifact(id: string, kind: string, path: string): CreatorArtifact {
  return {
    id,
    jobId: 'auto-clip-job',
    kind,
    version: 1,
    status: 'completed',
    path,
    scopeKey: null,
    inputFingerprint: null,
    sha256: null,
    sourceArtifactIds: [],
    metadata: {},
    createdAt: new Date().toISOString()
  };
}

function job(): CreatorJob {
  const now = new Date().toISOString();
  return {
    id: 'auto-clip-job',
    projectId: 'project-1',
    templateId: 'auto-clip',
    templateVersion: 3,
    status: 'running',
    revision: 0,
    state: {
      aspectRatio: '9:16',
      captionStyle: 'karaoke'
    },
    presetOrigin: null,
    agentThreadId: null,
    stages: [],
    artifacts: [],
    providerRequests: [],
    activities: [],
    createdAt: now,
    updatedAt: now
  };
}

function stageRun(): CreatorStageRun {
  return {
    id: 'render-stage',
    jobId: 'auto-clip-job',
    stageId: 'render',
    executor: 'clip',
    status: 'running',
    dispatchStatus: 'claimed',
    claimOwner: 'test',
    claimExpiresAt: null,
    attempt: 1,
    idempotencyKey: null,
    scopeKey: null,
    inputFingerprint: null,
    progress: {},
    errorCode: null,
    errorMessage: null,
    startedAt: new Date().toISOString(),
    finishedAt: null
  };
}
