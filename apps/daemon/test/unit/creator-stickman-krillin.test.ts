import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildVishnuStageOptions,
  resolveVishnuStageContract,
  validateResultArtifacts
} from '../../src/creator/vishnu/adapter.js';
import {
  buildVishnuCliCommandArguments,
  outputMappings
} from '../../src/creator/vishnu/cli-runner.js';

let tempDir = '';

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

function stage(stageId: string) {
  return {
    job: { id: 'job-1', templateId: 'stickman-video', state: {} },
    stageRun: { id: 'stage-1', stageId, progress: {} },
    inputArtifacts: []
  } as never;
}

describe('stickman VishnuAI mapping', () => {
  it('maps semantic stages onto the existing Vishnu stage enum', () => {
    expect(resolveVishnuStageContract(stage('source-transcript'))).toMatchObject({
      stageType: 'subtitle',
      requiredOutputKinds: ['source_subtitle']
    });
    expect(resolveVishnuStageContract(stage('narration'))).toMatchObject({
      stageType: 'tts',
      outputAliases: { dubbed_audio: 'narration_audio' }
    });
    expect(resolveVishnuStageContract(stage('subtitles'))).toMatchObject({
      stageType: 'subtitle',
      requiredOutputKinds: ['bilingual_subtitle']
    });
    expect(resolveVishnuStageContract(stage('bilingual-render'))).toMatchObject({
      stageType: 'render-horizontal',
      outputAliases: { horizontal_video: 'bilingual_video' }
    });
    expect(outputMappings('narration')).toEqual([['tts_audio', 'narration_audio']]);
    expect(outputMappings('bilingual-render')).toEqual([['horizontal_video', 'bilingual_video']]);
  });

  it('uses source-only only for the stickman transcript stage', () => {
    const sourceTranscript = {
      workdir: 'job/source-transcript',
      job: {
        id: 'job-1',
        templateId: 'stickman-video',
        state: {
          sourceUrl: 'https://www.youtube.com/watch?v=abc',
          sourceLanguage: 'auto',
          targetLanguage: 'zh_cn'
        }
      },
      stageRun: { id: 'stage-1', stageId: 'source-transcript', progress: {} },
      inputArtifacts: [],
      signal: new AbortController().signal,
      reportProgress() {}
    };
    const stickmanOptions = buildVishnuStageOptions(sourceTranscript as never);
    expect(stickmanOptions.sourceOnly).toBe(true);
    const stickmanArgs = buildVishnuCliCommandArguments(
      sourceTranscript as never,
      [],
      stickmanOptions,
      undefined
    );
    expect(stickmanArgs).toContain('--source-only');
    expect(stickmanArgs).not.toContain('--prepare-video');

    const translationStage = {
      ...sourceTranscript,
      job: { ...sourceTranscript.job, templateId: 'video-translation' },
      stageRun: { ...sourceTranscript.stageRun, stageId: 'subtitle' }
    };
    const translationOptions = buildVishnuStageOptions(translationStage as never);
    expect(translationOptions.sourceOnly).toBe(false);
    const translationArgs = buildVishnuCliCommandArguments(
      translationStage as never,
      [],
      translationOptions,
      undefined
    );
    expect(translationArgs).not.toContain('--source-only');
    expect(translationArgs).not.toContain('--prepare-video');
  });

  it('rejects undeclared or missing stickman outputs and aliases valid subtitles', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-stickman-vishnu-'));
    const jobRoot = join(tempDir, 'job-1');
    mkdirSync(jobRoot, { recursive: true });

    await expect(validateResultArtifacts({
      stage: stage('source-transcript'),
      jobsRoot: tempDir,
      artifacts: [],
      ffprobe: 'unused'
    })).rejects.toMatchObject({ code: 'vishnu_output_missing' });
    await expect(validateResultArtifacts({
      stage: stage('source-transcript'),
      jobsRoot: tempDir,
      artifacts: [{
        id: 'bad',
        kind: 'vertical_video',
        relativePath: 'job-1/bad.mp4'
      }],
      ffprobe: 'unused'
    })).rejects.toMatchObject({ code: 'vishnu_output_mismatch' });

    const subtitlePath = join(jobRoot, 'source.srt');
    writeFileSync(subtitlePath, '1\n00:00:00,000 --> 00:00:01,000\n测试\n');
    const outputs = await validateResultArtifacts({
      stage: stage('source-transcript'),
      jobsRoot: tempDir,
      artifacts: [{
        id: 'source-subtitle',
        kind: 'source_subtitle',
        relativePath: 'job-1/source.srt'
      }],
      ffprobe: 'unused'
    });
    expect(outputs).toMatchObject([{ kind: 'source_subtitle', status: 'completed' }]);
  });
});
