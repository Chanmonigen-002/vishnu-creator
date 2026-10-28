import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreatorExecutor, CreatorExecutorInput, CreatorExecutorOutput } from '../executor.js';
import { CreatorExecutorError } from '../executor.js';
import { spawnCreatorProcess } from '../process-tree.js';
import { parseSrt } from '../validators/srt.js';
import { validateMediaFile } from '../validators/media.js';
import { validateImageFile } from '../validators/image.js';
import type { BlogArticleModel } from './blog-model.js';
import {
  buildDeterministicArticle,
  chaptersFromParagraphs,
  transcriptParagraphs,
  type TranscriptParagraph
} from './blog-text.js';

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  km: 'Write everything (title, sections, description, chapters, hashtags, tags) in natural Cambodian (Khmer). Keep technical product names in their original form.',
  en: 'Write everything in clear, natural English.'
};

const KEYFRAME_ARTIFACT_LIMIT = 10;

export function createBlogArticleExecutor(input: {
  model: BlogArticleModel;
  ffmpegPath?: string;
  ffprobePath?: string;
}): CreatorExecutor {
  return {
    id: 'blog-article',
    async run(stage) {
      if (stage.stageRun.stageId !== 'generate') {
        throw new CreatorExecutorError('creator_stage_not_supported', 'Unsupported blog article stage');
      }
      const subtitleArtifact = stage.inputArtifacts.find(artifact => artifact.kind.includes('subtitle'));
      if (!subtitleArtifact?.path) {
        throw new CreatorExecutorError('creator_stage_input_missing', 'A transcript subtitle is required');
      }
      const source = stage.inputArtifacts.find(artifact => artifact.kind === 'source_video')?.path;

      const srtCues = await readFile(subtitleArtifact.path!, 'utf8').then(content => {
        try {
          return parseSrt(content, { allowOverlaps: true });
        } catch (error) {
          throw CreatorExecutorError.from('creator_stage_input_invalid', error, 'The transcript is not a valid SRT file');
        }
      });
      const paragraphs = transcriptParagraphs(srtCues);
      if (paragraphs.length === 0) {
        throw new CreatorExecutorError('creator_blog_transcript_empty', 'The transcript contains no readable text');
      }

      const state = stage.job.state;
      const targetLanguage = readLanguage(state.targetLanguage);
      const keyframeCount = readKeyframeCount(state.keyframeCount);
      const extraRequirements = readString(state.extraRequirements);
      const sourceTitle = readString(state.sourceTitle);

      stage.reportProgress({ phase: 'extracting_keyframes', percent: 10 });

      const keyframes = source && keyframeCount > 0 && input.ffmpegPath && input.ffprobePath
        ? await extractKeyframes({
            ffmpegPath: input.ffmpegPath,
            ffprobePath: input.ffprobePath,
            videoPath: source,
            count: keyframeCount,
            workdir: stage.workdir,
            signal: stage.signal,
            reportProgress: stage.reportProgress
          })
        : [];

      stage.reportProgress({ phase: 'writing_article', percent: 35 });
      const transcript = renderTranscriptForModel(paragraphs, 100_000);
      let generated: { markdown: string; seo: object; generatedBy: 'model' | 'deterministic-fallback' };
      try {
        const result = await input.model.generateArticle({
          sourceTitle,
          transcript,
          languageInstructions: languageInstructions(targetLanguage),
          extraRequirements,
          keyframeHints: keyframes.map(keyframe => ({
            timestamp: keyframe.timestamp,
            srtMs: `${Math.round(keyframe.startMs)}`
          })),
          signal: stage.signal
        });
        generated = {
          markdown: renderMarkdown(result.title, result.sections, keyframes),
          seo: {
            title: result.title,
            ...result.seo,
            chapters: hydrateChapters(result.seo.chapters, paragraphs)
          },
          generatedBy: 'model'
        };
      } catch (error) {
        // A malformed or empty article payload falls back to the
        // deterministic article; upstream/config failures propagate.
        if (!isPayloadError(error)) throw error;
        const fallback = buildDeterministicArticle({
          sourceTitle,
          targetLanguage,
          paragraphs
        });
        generated = {
          markdown: fallback.markdown,
          seo: {
            title: fallback.title,
            description: fallback.seo.description,
            keywords: fallback.seo.keywords,
            chapters: hydrateChapters(fallback.seo.chapters, paragraphs),
            hashtags: fallback.seo.hashtags,
            tags: fallback.seo.tags
          },
          generatedBy: 'deterministic-fallback'
        };
      }

      stage.reportProgress({ phase: 'saving_artifacts', percent: 70 });
      const articlePath = join(stage.workdir, 'blog-article.md');
      await writeFile(articlePath, `${generated.markdown}\n`);
      const seoPath = join(stage.workdir, 'seo-kit.json');
      await writeFile(seoPath, `${JSON.stringify({ ...generated.seo, generatedBy: generated.generatedBy }, null, 2)}\n`);

      const outputs: CreatorExecutorOutput[] = [
        {
          kind: 'article_document' as const,
          status: 'completed' as const,
          path: articlePath,
          sourceArtifactIds: [subtitleArtifact.id, ...subtitleArtifact.sourceArtifactIds],
          metadata: {
            fileName: basename(articlePath),
            mimeType: 'text/markdown',
            targetLanguage,
            generatedBy: generated.generatedBy,
            keyframeCount: keyframes.length
          }
        },
        {
          kind: 'seo_kit' as const,
          status: 'completed' as const,
          path: seoPath,
          sourceArtifactIds: [subtitleArtifact.id, ...subtitleArtifact.sourceArtifactIds],
          metadata: {
            fileName: basename(seoPath),
            mimeType: 'application/json',
            targetLanguage,
            generatedBy: generated.generatedBy
          }
        },
        ...keyframes.map(keyframe => ({
          kind: 'article_keyframe' as const,
          status: 'completed' as const,
          path: keyframe.path,
          sourceArtifactIds: [subtitleArtifact.id, ...subtitleArtifact.sourceArtifactIds],
          metadata: {
            ...keyframe.image,
            startMs: keyframe.startMs,
            timestamp: keyframe.timestamp,
            fileName: basename(keyframe.path),
            mimeType: 'image/png'
          }
        }))
      ];
      stage.reportProgress({
        phase: 'completed',
        percent: 100,
        completed: 2 + keyframes.length,
        failed: 0,
        total: 2 + keyframes.length,
        message: 'Blog article and SEO kit saved'
      });
      return { outputs, progress: { phase: 'completed', percent: 100 } };
    }
  };
}

type ExtractedKeyframe = {
  path: string;
  startMs: number;
  timestamp: string;
  image: Awaited<ReturnType<typeof validateImageFile>>;
};

async function extractKeyframes(input: {
  ffmpegPath: string;
  ffprobePath: string;
  videoPath: string;
  count: number;
  workdir: string;
  signal: AbortSignal;
  reportProgress?(progress: Record<string, string | number | null>): void;
}): Promise<ExtractedKeyframe[]> {
  const media = await validateMediaFile(input.videoPath, input.ffprobePath).catch(() => undefined);
  if (media === undefined || !media.hasVideo || media.duration < 1) return [];
  const count = Math.min(input.count, KEYFRAME_ARTIFACT_LIMIT);
  const at = (index: number) => 10 + Math.round(((index + 1) / count) * 20);
  const keyframes: ExtractedKeyframe[] = [];
  for (let index = 0; index < count; index++) {
    if (input.signal.aborted) break;
    const startMs = Math.round(((index + 0.5) / count) * media.duration * 1000);
    const path = join(input.workdir, `keyframe-${String(index + 1).padStart(2, '0')}.png`);
    try {
      await runFfmpeg(input.ffmpegPath, [
        '-y',
        '-ss', formatFfmpegSeconds(startMs / 1000),
        '-i', input.videoPath,
        '-frames:v', '1',
        '-vf', 'scale=\'min(1920\,iw)\':-2:flags=lanczos',
        path
      ], input.signal);
      keyframes.push({
        path,
        startMs,
        timestamp: keyframeTimestamp(startMs),
        image: await validateImageFile(path)
      });
    } catch {
      // A single unreadable frame is skipped; article generation continues.
    }
    input.reportProgress?.({
      phase: 'extracting_keyframes',
      percent: at(index),
      completed: keyframes.length,
      failed: index + 1 - keyframes.length,
      total: count
    });
  }
  return keyframes;
}

function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnCreatorProcess(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] }, signal);
    let stderr = '';
    child.stderr?.on('data', chunk => {
      stderr = `${stderr}${String(chunk)}`.slice(-4000);
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-2000))));
  });
}

function formatFfmpegSeconds(value: number): string {
  const seconds = Math.floor(value);
  const fraction = value - seconds;
  return `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(Math.floor(fraction * 1000)).padStart(3, '0')}`;
}

function keyframeTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours === 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}`
    : `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderMarkdown(
  title: string,
  sections: Array<{ heading: string; body: string }>,
  keyframes: ExtractedKeyframe[]
): string {
  const lines = [`# ${title}`];
  sections.forEach((section, index) => {
    lines.push('', `## ${section.heading}`, '', section.body);
    const keyframe = keyframes[Math.min(index, keyframes.length - 1)];
    if (keyframe !== undefined) {
      lines.push('', `![${keyframe.timestamp} video frame](${basename(keyframe.path)})`);
    }
  });
  return lines.join('\n');
}

// Keep model chapters that parse as m:ss timestamps; fall back to
// deterministic transcript chapters when the model returned none.
function hydrateChapters(
  chapters: Array<{ timestamp: string; label: string }>,
  paragraphs: TranscriptParagraph[]
): Array<{ timestamp: string; label: string }> {
  const valid = chapters.filter(chapter => parseChapterSeconds(chapter.timestamp) !== null);
  return valid.length > 0 ? valid.slice(0, 12) : chaptersFromParagraphs(paragraphs);
}

function parseChapterSeconds(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function isSchemaError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && (error as { name?: string }).name === 'ZodError'
  );
}

function isPayloadError(error: unknown): boolean {
  return (
    error instanceof SyntaxError
    || isSchemaError(error)
    || (error instanceof CreatorExecutorError && error.code === 'creator_llm_empty_response')
  );
}

function languageInstructions(targetLanguage: string): string {
  const instruction = LANGUAGE_INSTRUCTIONS[targetLanguage];
  return instruction ?? `Write everything in natural ${targetLanguage}. Keep technical product names in their original form.`;
}

function renderTranscriptForModel(paragraphs: TranscriptParagraph[], limit: number): string {
  const parts: string[] = [];
  let remaining = limit;
  for (const paragraph of paragraphs) {
    if (remaining <= 0) break;
    const text = paragraph.text.slice(0, remaining);
    parts.push(`[at ${keyframeTimestamp(paragraph.startMs)}] ${text}`);
    remaining -= text.length + 1;
  }
  return parts.join('\n\n');
}

function readLanguage(value: unknown): string {
  return typeof value === 'string' && value.trim().length >= 2 ? value.trim().slice(0, 24) : 'km';
}

function readKeyframeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(10, Math.round(value)))
    : 4;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 6_000) : '';
}
