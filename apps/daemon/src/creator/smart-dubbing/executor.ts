import {
  smartDubbingStyles,
  type CreatorJson,
  type CreatorTtsProvider,
  type SmartDubbingFormat,
  type SmartDubbingStyle
} from '@vishnucreator/protocol';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DubEngineError,
  type DubEngineService,
  type DubJobResponse
} from '../../dub-engine/service.js';
import {
  VishnuTtsServiceError,
  type VishnuTtsService
} from '../vishnu/tts-service.js';
import { smartDubbingInstructions } from '../../smart-dubbing/styles.js';
import type { CreatorExecutor } from '../executor.js';
import { CreatorExecutorError, type CreatorExecutorResult } from '../executor.js';

export function createSmartDubbingExecutor(input: {
  ttsService: Pick<VishnuTtsService, 'synthesize'>;
  isOfficial?(): boolean;
  dubEngineService?: DubEngineService;
}): CreatorExecutor {
  return {
    id: 'smart-dubbing',
    async run(stage) {
      stage.reportProgress({ phase: 'validating', percent: 5 });
      const request = readRequest(stage.job.state);
      const official = input.isOfficial?.() === true;
      const engine = input.dubEngineService;
      const useEngine = engine !== undefined
        && engine.isHealthy()
        && typeof request.sourceUrl === 'string'
        && request.sourceUrl.length > 0;
      if (stage.signal.aborted) {
        throw new CreatorExecutorError('creator_stage_canceled', 'Creator stage was canceled');
      }

      if (useEngine) {
        return await runEngineDub(stage, engine, request, official);
      }

      stage.reportProgress({ phase: 'generating_voice', percent: 20 });
      try {
        const synthesis = await input.ttsService.synthesize({
          logicalId:stage.stageRun.id,
          text: request.text,
          ...(request.provider === undefined ? {} : { provider: request.provider }),
          ...(request.model === undefined ? {} : { model: request.model }),
          ...(request.voiceCode === undefined ? {} : { voiceId: request.voiceCode }),
          format: request.format,
          speed: request.speed,
          instructions: official && request.style === 'natural' ? undefined : smartDubbingInstructions(request.style),
          signal: stage.signal
        });
        if (stage.signal.aborted) {
          throw new CreatorExecutorError('creator_stage_canceled', 'Creator stage was canceled');
        }
        stage.reportProgress({ phase: 'finalizing_output', percent: 90 });
        const fileName = `VishnuCreator-dubbing.${synthesis.format}`;
        const path = join(stage.workdir, fileName);
        await writeFile(path, synthesis.content, { mode: 0o600 });
        const characterCount = [...request.text].length;
        return {
          outputs: [{
            kind: 'dubbed_audio',
            status: 'completed',
            path,
            metadata: {
              fileName,
              mime: synthesis.mime,
              bytes: synthesis.content.length,
              sha256: createHash('sha256').update(synthesis.content).digest('hex'),
              provider: synthesis.provider,
              model: synthesis.model,
              voiceCode: synthesis.voiceId,
              voiceName: request.voiceName ?? synthesis.voiceId,
              style: request.style,
              speed: request.speed,
              format: synthesis.format,
              characterCount,
              settingsSnapshot: stage.job.state
            }
          }],
          progress: {
            phase: 'completed',
            percent: 100,
            completed: 1,
            failed: 0,
            total: 1
          }
        };
      } catch (error) {
        if (stage.signal.aborted) {
          throw new CreatorExecutorError('creator_stage_canceled', 'Creator stage was canceled');
        }
        if (error instanceof CreatorExecutorError) throw error;
        if (error instanceof VishnuTtsServiceError) {
          const code = error.code === 'VALIDATION_FAILED'
            ? 'creator_stage_input_missing'
            : error.code;
          throw new CreatorExecutorError(code, error.message);
        }
        throw new CreatorExecutorError(
          'creator_tts_upstream_error',
          error instanceof Error ? error.message : 'Speech synthesis failed'
        );
      }
    }
  };
}

async function runEngineDub(
  stage: Parameters<CreatorExecutor['run']>[0],
  engine: DubEngineService,
  request: {
    text: string;
    sourceUrl?: string;
    voiceCode?: string;
    voiceName?: string;
    style: string;
    speed: number;
  },
  official: boolean
): Promise<CreatorExecutorResult> {
  stage.reportProgress({ phase: 'creating_job', percent: 10 });

  const dubRequest: Parameters<DubEngineService['createDubJob']>[0] = {
    sourceUrl: request.sourceUrl ?? '',
    sourceLanguage: 'en',
    targetLanguage: 'km',
    ttsProvider: 'edge-tts',
    ttsVoiceId: request.voiceCode || undefined,
    ttsStyle: request.style,
    ttsSpeed: request.speed,
    separateVocals: true,
    bilingualSubtitles: true,
    composeVideo: true
  };

  let jobResponse: DubJobResponse;
  try {
    jobResponse = await engine.createDubJob(dubRequest);
  } catch (error) {
    if (error instanceof DubEngineError) {
      throw new CreatorExecutorError(
        'creator_dub_engine_error',
        error.message,
        { retryable: error.statusCode < 500 }
      );
    }
    throw new CreatorExecutorError(
      'creator_dub_engine_error',
      error instanceof Error ? error.message : 'Failed to create dub job',
      { retryable: false }
    );
  }

  const jobId = jobResponse.jobId;
  stage.reportProgress({ phase: 'dubbing', percent: 20 });

  try {
    for await (const progress of engine.watchJobProgress(jobId)) {
      if (stage.signal.aborted) {
        throw new CreatorExecutorError('creator_stage_canceled', 'Creator stage was canceled');
      }
      stage.reportProgress({
        phase: progress.phase,
        percent: Math.min(95, 20 + Math.floor(progress.percent * 0.75)),
        ...(progress.message !== undefined ? { message: progress.message } : {})
      });
    }
  } catch (error) {
    if (error instanceof CreatorExecutorError) throw error;
    if (error instanceof DubEngineError) {
      throw new CreatorExecutorError(
        'creator_dub_engine_error',
        error.message,
        { retryable: error.statusCode < 500 }
      );
    }
    throw new CreatorExecutorError(
      'creator_dub_engine_error',
      error instanceof Error ? error.message : 'Dub job failed',
      { retryable: false }
    );
  }

  stage.reportProgress({ phase: 'downloading_result', percent: 95 });

  const result = await engine.getJobStatus(jobId);
  if (result.status !== 'completed' || !result.resultUrl) {
    throw new CreatorExecutorError(
      'creator_dub_engine_error',
      result.error ?? 'Dub job did not complete successfully'
    );
  }

  const audioBuffer = await engine.downloadResult(jobId, stage.signal);
  const fileName = `VishnuCreator-dubbing-${jobId}.mp3`;
  const path = join(stage.workdir, fileName);
  await writeFile(path, audioBuffer, { mode: 0o600 });

  return {
    outputs: [{
      kind: 'dubbed_audio',
      status: 'completed',
      path,
      metadata: {
        fileName,
        mime: 'audio/mpeg',
        bytes: audioBuffer.length,
        sha256: createHash('sha256').update(audioBuffer).digest('hex'),
        provider: 'local-engine',
        model: 'local-engine',
        voiceCode: request.voiceCode ?? 'km-KH-SreymomNeural',
        voiceName: request.voiceName ?? request.voiceCode ?? 'Sreymom',
        style: request.style,
        speed: request.speed,
        format: 'mp3',
        characterCount: [...request.text].length,
        settingsSnapshot: stage.job.state,
        engineJobId: jobId
      }
    }],
    progress: {
      phase: 'completed',
      percent: 100,
      completed: 1,
      failed: 0,
      total: 1
    }
  };
}

function readRequest(state: Record<string, CreatorJson>): {
  text: string;
  sourceUrl?: string;
  provider?: Exclude<CreatorTtsProvider, 'edge-tts'>;
  model?: string;
  voiceCode?: string;
  voiceName?: string;
  style: SmartDubbingStyle;
  speed: number;
  format: SmartDubbingFormat;
} {
  const text = readString(state.text)?.trim() ?? '';
  if (!text || [...text].length > 5_000) {
    throw new CreatorExecutorError(
      'creator_stage_input_missing',
      'Dubbing text must contain between 1 and 5000 characters'
    );
  }
  const sourceUrl = readString(state.sourceUrl);
  const provider = readString(state.ttsProvider);
  if (provider !== undefined && !['openai', 'aliyun', 'minimax'].includes(provider)) {
    throw new CreatorExecutorError(
      'unsupported_capability',
      'The selected TTS provider does not support smart dubbing'
    );
  }
  const style = readString(state.style) ?? 'natural';
  if (!(smartDubbingStyles as readonly string[]).includes(style)) {
    throw new CreatorExecutorError('creator_stage_input_missing', 'Dubbing style is invalid');
  }
  const speed = typeof state.speed === 'number' ? state.speed : 1;
  if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.25) {
    throw new CreatorExecutorError('creator_stage_input_missing', 'Dubbing speed is invalid');
  }
  const format = state.format === 'wav' ? 'wav' : 'mp3';
  return {
    text,
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    ...(provider === undefined
      ? {}
      : { provider: provider as Exclude<CreatorTtsProvider, 'edge-tts'> }),
    ...(readString(state.ttsModel) === undefined ? {} : { model: readString(state.ttsModel) }),
    ...(readString(state.voiceCode) === undefined ? {} : { voiceCode: readString(state.voiceCode) }),
    ...(readString(state.voiceName) === undefined ? {} : { voiceName: readString(state.voiceName) }),
    style: style as SmartDubbingStyle,
    speed,
    format
  };
}

function readString(value: CreatorJson | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
