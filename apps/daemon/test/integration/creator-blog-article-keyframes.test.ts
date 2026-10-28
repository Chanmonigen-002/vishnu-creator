import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { CreatorArtifact, CreatorJob, CreatorStageRun } from '@vishnucreator/protocol';
import { createBlogArticleExecutor } from '../../src/creator/article/blog-executor.js';
import { createBlogArticleModel } from '../../src/creator/article/blog-model.js';

const repoRoot = resolve(process.cwd(), '../..');
const runtimeRoot = resolve(
  process.env.VISHNUCREATOR_CREATOR_RUNTIME_ROOT
    ?? join(repoRoot, 'apps/desktop/.pack/creator-runtime/vishnuai')
);
const suffix = process.platform === 'win32' ? '.exe' : '';
const ffmpegPath = join(runtimeRoot, 'bin', `ffmpeg${suffix}`);
const ffprobePath = join(runtimeRoot, 'bin', `ffprobe${suffix}`);
const hasPackagedRuntime = [ffmpegPath, ffprobePath].every(existsSync);
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const khmerSrt = `1
00:00:01,000 --> 00:00:03,000
ភាសាខ្មែរ

2
00:00:03,500 --> 00:00:08,000
Explore the world
`;

describe.runIf(hasPackagedRuntime)('Creator packaged blog article generation', () => {
  it('extracts real keyframes with the packaged ffmpeg and falls back to a deterministic article', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vishnucreator-blog-article-'));
    roots.push(root);
    const workdir = join(root, 'work');
    mkdirSync(workdir);

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

    const subtitlePath = join(root, 'subtitle.srt');
    writeFileSync(subtitlePath, khmerSrt);

    const executor = createBlogArticleExecutor({
      model: createBlogArticleModel({
        configStore: { async read() { return { llm: { apiKey: 'test-key', model: 'test-model', baseUrl: 'https://llm.invalid', jsonMode: true }, proxy: '' } as never; } },
        fetchImpl: (async () => new Response('{}', { status: 200 })) as typeof fetch
      }),
      ffmpegPath,
      ffprobePath
    });

    const result = await executor.run({
      stageRun: stageRun(),
      job: job(),
      inputArtifacts: [
        artifact('subtitle', 'target_subtitle', subtitlePath),
        artifact('video', 'source_video', sourcePath)
      ],
      workdir,
      signal: new AbortController().signal,
      reportProgress: () => {}
    });

    const articles = result.outputs.filter(output => output.kind === 'article_keyframe');
    expect(articles).toHaveLength(4);
    const articleDocument = result.outputs.find(output => output.kind === 'article_document');
    const seoKit = result.outputs.find(output => output.kind === 'seo_kit');
    expect(articleDocument?.metadata).toMatchObject({ targetLanguage: 'km', generatedBy: 'deterministic-fallback' });
    expect(seoKit?.metadata?.generatedBy).toBe('deterministic-fallback');

    for (const keyframe of articles) {
      expect(existsSync(keyframe.path!)).toBe(true);
      const png = readFileSync(keyframe.path!, 'utf8').slice(1, 4);
      expect(png).toBe('PNG');
    }
    const timestamps = articles.map(article => String(article.metadata?.timestamp));
    expect(Number(String(articles[0]!.metadata?.startMs))).toBeGreaterThan(0);
    expect(Number(String(articles.at(-1)!.metadata?.startMs))).toBeLessThan(10_000);
    expect(Number(String(articles[1]!.metadata?.startMs))).toBeGreaterThan(Number(String(articles[0]!.metadata?.startMs)));

    const markdown = readFileSync(articleDocument!.path!, 'utf8');
    expect(markdown).toContain('សេចក្តីសង្ខេបពីវីដេអូ');
    expect(readFileSync(seoKit!.path!, 'utf8')).toContain('"description"');
    expect(timestamps.length).toBe(4);
  });
});

function artifact(id: string, kind: string, path: string): CreatorArtifact {
  return {
    id,
    jobId: 'blog-article-job',
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
    id: 'blog-article-job',
    projectId: 'project-1',
    templateId: 'blog-article',
    templateVersion: 1,
    status: 'running',
    revision: 0,
    state: {
      targetLanguage: 'km',
      keyframeCount: 4
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
    id: 'generate-stage',
    jobId: 'blog-article-job',
    stageId: 'generate',
    executor: 'blog-article',
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
