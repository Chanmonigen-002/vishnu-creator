import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CreatorArtifact, CreatorStageRun } from '@vishnucreator/protocol';
import { describe, expect, it } from 'vitest';
import { createBlogArticleExecutor } from '../../src/creator/article/blog-executor.js';
import { createBlogArticleModel } from '../../src/creator/article/blog-model.js';
import { topKeywords, transcriptParagraphs } from '../../src/creator/article/blog-text.js';
import { parseSrt } from '../../src/creator/validators/srt.js';
import type { CreatorExecutorInput } from '../../src/creator/executor.js';

const khmerSrt = `1
00:00:00,120 --> 00:00:02,400
ភាសាខ្មែរ

2
00:00:02,500 --> 00:00:05,000
ភាសាខ្មែរប្រើអក្សរខ្មែរ

3
00:00:05,100 --> 00:00:08,000
អត្ថបទប្លុកត្រូវសរសេរ

4
00:00:08,100 --> 00:00:10,000
អត្ថបទប្លុកត្រូវតែងងាយស្រួលអាន
`;

const modelArticle = {
  title: 'Khmer writing guide',
  sections: [{ heading: 'Basics', body: 'Khmer script has no spaces between words.' }],
  seo: {
    description: 'A short guide about Khmer writing for blog authors.',
    keywords: ['khmer script', 'writing'],
    chapters: [{ timestamp: '0:02', label: 'Khmer words' }],
    hashtags: ['#Khmer'],
    tags: ['khmer']
  }
};

type BlogArticleResult = Awaited<ReturnType<ReturnType<typeof createBlogArticleModel>['generateArticle']>>;

describe('blog text utilities', () => {
  it('groups khmer cues into paragraphs split at sentence ends', () => {
    const paragraphs = transcriptParagraphs(parseSrt(khmerSrt, { allowOverlaps: true }), { maxCues: 2 });
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]!.text).toContain('ភាសាខ្មែរ');
    expect(paragraphs[1]!.startMs).toBe(5100);
  });

  it('only keeps repeated terms as keywords', () => {
    const keywords = topKeywords('ភាសាខ្មែរ ភាសាខ្មែរ ភាសាខ្មែរ អក្សរ unique', 3);
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.some(keyword => keyword.includes('unique'))).toBe(false);
  });
});

describe('blog article executor', () => {
  it('falls back to a deterministic article when the model output is invalid', async () => {
    const subtitlePath = writeSubtitle();
    const executor = createBlogArticleExecutor({
      model: createBlogArticleModel({
        configStore: fakeConfigStore(),
        fetchImpl: (async () => new Response('{}', { status: 200 })) as typeof fetch
      })
    });
    const result = await executor.run(stageInput({
      subtitlePath,
      state: { sourceTitle: 'Khmer writing test' }
    }));
    const seoOutput = result.outputs.find(output => output.kind === 'seo_kit');
    const articleOutput = result.outputs.find(output => output.kind === 'article_document');
    expect(seoOutput?.metadata?.generatedBy).toBe('deterministic-fallback');
    expect(articleOutput?.metadata?.targetLanguage).toBe('km');
    const markdown = await import('node:fs/promises').then(fs => fs.readFile(articleOutput!.path!, 'utf8'));
    expect(markdown).toContain('# Khmer writing test');
  });

  it('prefers the writing model output when it parses', async () => {
    let transcript = '';
    const executor = createBlogArticleExecutor({
      model: {
        async generateArticle(request) {
          transcript = request.transcript;
          const result: BlogArticleResult = {
            title: modelArticle.title,
            sections: modelArticle.sections.map(section => ({ ...section })),
            seo: {
              ...modelArticle.seo,
              keywords: [...modelArticle.seo.keywords],
              chapters: modelArticle.seo.chapters.map(chapter => ({ ...chapter })),
              hashtags: [...modelArticle.seo.hashtags],
              tags: [...modelArticle.seo.tags]
            }
          };
          return result;
        }
      }
    });
    const result = await executor.run(stageInput({
      subtitlePath: writeSubtitle(),
      state: { targetLanguage: 'en', keyframeCount: 0 }
    }));
    expect(transcript).toContain('ភាសាខ្មែរ');
    const seo = result.outputs.find(output => output.kind === 'seo_kit');
    expect(seo?.metadata?.generatedBy).toBe('model');
  });

  it('fails the stage when no transcript artifact is present', async () => {
    const executor = createBlogArticleExecutor({ model: { async generateArticle() { throw new Error('unused'); } } });
    await expect(executor.run(stageInput({ subtitlePath: null })))
      .rejects.toMatchObject({ code: 'creator_stage_input_missing' });
  });
});

function writeSubtitle(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'blog-article-'));
  const subtitlePath = path.join(dir, 'captions.srt');
  writeFileSync(subtitlePath, khmerSrt, 'utf8');
  return subtitlePath;
}

function stageInput(input: {
  subtitlePath: string | null;
  state?: Record<string, import('@vishnucreator/protocol').CreatorJson>;
}): CreatorExecutorInput {
  const now = '2026-10-27T00:00:00.000Z';
  const job = {
    id: 'job-1',
    projectId: 'project-1',
    templateId: 'blog-article',
    templateVersion: 1,
    status: 'running' as const,
    revision: 1,
    state: input.state ?? {},
    agentThreadId: null,
    stages: [],
    artifacts: [],
    providerRequests: [],
    activities: [],
    createdAt: now,
    updatedAt: now
  };
  return {
    stageRun: {
      id: 'stage-1',
      jobId: job.id,
      stageId: 'generate',
      executor: 'blog-article',
      status: 'running',
      dispatchStatus: 'claimed',
      claimOwner: 'test',
      claimExpiresAt: null,
      attempt: 1,
      idempotencyKey: 'blog-article-test',
      scopeKey: null,
      inputFingerprint: null,
      progress: {},
      errorCode: null,
      errorMessage: null,
      startedAt: now,
      finishedAt: null
    } satisfies CreatorStageRun,
    job,
    inputArtifacts: input.subtitlePath === null ? [] : [{
      id: 'sub-1',
      jobId: job.id,
      kind: 'target_subtitle',
      version: 1,
      status: 'completed',
      path: input.subtitlePath,
      scopeKey: null,
      inputFingerprint: null,
      sha256: null,
      sourceArtifactIds: [],
      metadata: {},
      createdAt: now
    } satisfies CreatorArtifact],
    workdir: mkdtempSync(path.join(tmpdir(), 'blog-article-run-')),
    signal: new AbortController().signal,
    reportProgress: () => {}
  };
}

function fakeConfigStore() {
  return {
    async read() {
      return {
        llm: {
          apiKey: 'key',
          model: 'test-model',
          baseUrl: 'https://llm.test/v1',
          jsonMode: true
        },
        proxy: ''
      } as never;
    }
  };
}
