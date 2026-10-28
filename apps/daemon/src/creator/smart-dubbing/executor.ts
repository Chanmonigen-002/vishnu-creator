import {
  smartDubbingStyles,
  type CreatorJson,
  type CreatorServicesConfig,
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
  /** Current engine at run time; it can be started after the daemon boots. */
  getDubEngineService?(): DubEngineService | undefined;
  configStore?: { read(): Promise<CreatorServicesConfig> };
}): CreatorExecutor {
  return {
    id: 'smart-dubbing',
    async run(stage) {
      stage.reportProgress({ phase: 'validating', percent: 5 });
      const request = readRequest(stage.job.state);
      const official = input.isOfficial?.() === true;
      const engine = input.getDubEngineService?.() ?? input.dubEngineService;
      const useEngine = engine !== undefined
        && engine.isHealthy()
        && typeof request.sourceUrl === 'string'
        && request.sourceUrl.length > 0;
      if (stage.signal.aborted) {
        throw new CreatorExecutorError('creator_stage_canceled', 'Creator stage was canceled');
      }

      if (useEngine) {
        const servicesConfig = input.configStore ? await input.configStore.read().catch(() => undefined) : undefined;
        return await runEngineDub(stage, engine, request, official, servicesConfig);
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
  official: boolean,
  servicesConfig?: CreatorServicesConfig
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
        phase: mapEngineStageToCreatorPhase(progress.phase),
        percent: Math.min(95, 20 + Math.floor(progress.percent * 0.75)),
        ...(progress.message !== undefined ? { message: progress.message } : {}),
        ...(progress.currentStep !== undefined ? { completed: progress.currentStep } : {}),
        ...(progress.totalSteps !== undefined ? { total: progress.totalSteps } : {})
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

  const resultBuffer = await engine.downloadResult(jobId, stage.signal);
  const isVideo = resultBuffer.length > 8 && resultBuffer.toString('ascii', 4, 8) === 'ftyp';
  const ext = isVideo ? 'mp4' : 'mp3';
  const mime = isVideo ? 'video/mp4' : 'audio/mpeg';
  const kind = isVideo ? 'dubbed_video' : 'dubbed_audio';
  const fileName = `VishnuCreator-dubbing-${jobId}.${ext}`;
  const path = join(stage.workdir, fileName);
  await writeFile(path, resultBuffer, { mode: 0o600 });

  const outputs: CreatorExecutorResult['outputs'] = [{
    kind,
    status: 'completed',
    path,
    metadata: {
      fileName,
      mime,
      bytes: resultBuffer.length,
      sha256: createHash('sha256').update(resultBuffer).digest('hex'),
      provider: 'local-engine',
      model: 'local-engine',
      voiceCode: request.voiceCode ?? 'km-KH-SreymomNeural',
      voiceName: request.voiceName ?? request.voiceCode ?? 'Sreymom',
      style: request.style,
      speed: request.speed,
      format: ext,
      characterCount: [...request.text].length,
      settingsSnapshot: stage.job.state,
      engineJobId: jobId
    }
  }];

  if (result.srtUrl) {
    try {
      const srtBuf = await engine.downloadArtifact(jobId, 'source.srt', stage.signal);
      const srtFile = `VishnuCreator-source-${jobId}.srt`;
      const srtPath = join(stage.workdir, srtFile);
      await writeFile(srtPath, srtBuf, { mode: 0o600 });
      outputs.push({
        kind: 'source_srt',
        status: 'completed',
        path: srtPath,
        metadata: {
          fileName: srtFile,
          mime: 'text/plain',
          bytes: srtBuf.length,
          sha256: createHash('sha256').update(srtBuf).digest('hex'),
          provider: 'local-engine',
          engineJobId: jobId
        }
      });
    } catch {
      // Non-fatal if secondary artifact download fails
    }
  }

  if (result.kmSrtUrl) {
    try {
      const kmSrtBuf = await engine.downloadArtifact(jobId, 'km.srt', stage.signal);
      const kmSrtFile = `VishnuCreator-khmer-${jobId}.srt`;
      const kmSrtPath = join(stage.workdir, kmSrtFile);
      await writeFile(kmSrtPath, kmSrtBuf, { mode: 0o600 });
      outputs.push({
        kind: 'khmer_srt',
        status: 'completed',
        path: kmSrtPath,
        metadata: {
          fileName: kmSrtFile,
          mime: 'text/plain',
          bytes: kmSrtBuf.length,
          sha256: createHash('sha256').update(kmSrtBuf).digest('hex'),
          provider: 'local-engine',
          engineJobId: jobId
        }
      });
    } catch {
      // Non-fatal
    }
  }

  if (result.vocalsUrl) {
    try {
      const vocalsBuf = await engine.downloadArtifact(jobId, 'vocals.wav', stage.signal);
      const vocalsFile = `VishnuCreator-vocals-${jobId}.wav`;
      const vocalsPath = join(stage.workdir, vocalsFile);
      await writeFile(vocalsPath, vocalsBuf, { mode: 0o600 });
      outputs.push({
        kind: 'vocals_stem',
        status: 'completed',
        path: vocalsPath,
        metadata: {
          fileName: vocalsFile,
          mime: 'audio/wav',
          bytes: vocalsBuf.length,
          sha256: createHash('sha256').update(vocalsBuf).digest('hex'),
          provider: 'local-engine',
          engineJobId: jobId
        }
      });
    } catch {
      // Non-fatal
    }
  }

  if (result.musicUrl) {
    try {
      const musicBuf = await engine.downloadArtifact(jobId, 'music.wav', stage.signal);
      const musicFile = `VishnuCreator-music-${jobId}.wav`;
      const musicPath = join(stage.workdir, musicFile);
      await writeFile(musicPath, musicBuf, { mode: 0o600 });
      outputs.push({
        kind: 'music_stem',
        status: 'completed',
        path: musicPath,
        metadata: {
          fileName: musicFile,
          mime: 'audio/wav',
          bytes: musicBuf.length,
          sha256: createHash('sha256').update(musicBuf).digest('hex'),
          provider: 'local-engine',
          engineJobId: jobId
        }
      });
    } catch {
      // Non-fatal
    }
  }

  try {
    const reportBuf = await engine.downloadArtifact(jobId, 'timesync_report.json', stage.signal);
    const reportFile = `VishnuCreator-timesync-${jobId}.json`;
    const reportPath = join(stage.workdir, reportFile);
    await writeFile(reportPath, reportBuf, { mode: 0o600 });
    let parsedReport: CreatorJson = null;
    try {
      parsedReport = JSON.parse(reportBuf.toString('utf8')) as CreatorJson;
    } catch {
      // Ignore parse failure
    }
    outputs.push({
      kind: 'timesync_report',
      status: 'completed',
      path: reportPath,
      metadata: {
        fileName: reportFile,
        mime: 'application/json',
        bytes: reportBuf.length,
        sha256: createHash('sha256').update(reportBuf).digest('hex'),
        provider: 'local-engine',
        engineJobId: jobId,
        ...(parsedReport ? { timesyncReport: parsedReport } : {})
      }
    });
  } catch {
    // Non-fatal
  }

  return {
    outputs,
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

// Maps engine pipeline stages (vishnu_dub/jobs.py) to creator progress phases
// per phase-3 task T3.7: validate → transcribe → translate → fit →
// synthesize → mix → assemble.
const ENGINE_STAGE_TO_CREATOR_PHASE: Readonly<Record<string, string>> = {
  initializing: 'validating',
  download: 'downloading_source',
  asr: 'transcribing',
  translation: 'translating',
  tts: 'synthesizing_voice',
  separation: 'mixing',
  assembly: 'assembling',
  completed: 'completed'
};

function mapEngineStageToCreatorPhase(stage: string): string {
  return ENGINE_STAGE_TO_CREATOR_PHASE[stage] ?? stage;
}
