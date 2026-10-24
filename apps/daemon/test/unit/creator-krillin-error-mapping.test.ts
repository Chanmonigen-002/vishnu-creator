import { describe, expect, it } from 'vitest';
import { normalizeVishnuFailure } from '../../src/creator/vishnu/adapter.js';
import { VishnuCliError } from '../../src/creator/vishnu/cli-runner.js';

describe('VishnuAI error mapping', () => {
  it.each(['Douyin', 'Douyin+vishnucreator'])('preserves the confirmed %s signature incompatibility in translation failures', prefix => {
    const error = new VishnuCliError('prepare_media_failed',
      `ERROR: [${prefix}] Douyin request signature is required (HTTP Error 403; Signature Not Found).`);
    expect(normalizeVishnuFailure(error).code).toBe('platform_request_signature_required');
    expect(error.publicFacts).toMatchObject({ kind: 'unsupported', httpStatus: 403, upstreamCode: 'prepare_media_failed' });
  });
  it.each(['prepare_media_failed', 'prepare_audio_fallback_failed'])('maps the confirmed Douyin session requirement during %s and preserves upstream evidence', code => {
    const message = 'linkToFile download audio yt-dlp error: exit status 1: WARNING: [Douyin] Failed to download web detail JSON: HTTP Error 403: Forbidden\nERROR: [Douyin] Fresh cookies (not necessarily logged in) are needed';
    const error = new VishnuCliError(code, message);
    expect(normalizeVishnuFailure(error)).toEqual({ code: 'platform_session_required', message });
    expect(error.publicFacts).toMatchObject({ kind: 'unauthorized', provider: 'vishnuai', httpStatus: 403,
      upstreamCode: code, upstreamMessage: expect.stringContaining('Fresh cookies (not necessarily logged in) are needed') });
    expect(normalizeVishnuFailure(new VishnuCliError(code, 'HTTP Error 403: Forbidden')).code).toBe(code);
  });
  it('reports a confirmed Bilibili risk-control rejection without inventing an HTTP status', () => {
    const error = new VishnuCliError('prepare_media_failed',
      'Bilibili risk control blocked media extraction after 3 attempts; wait and retry');
    expect(error.publicFacts).toMatchObject({ kind: 'http-rejected', provider: 'vishnuai' });
    expect(error.publicFacts.httpStatus).toBeUndefined();
    expect(new VishnuCliError('prepare_media_failed', 'No video formats found!').publicFacts.kind).toBe('unknown');
    expect(new VishnuCliError('prepare_media_failed',
      'WARNING: Bilibili risk control rejected the playback API request; retaining webpage media formats when available\nERROR: Requested format is not available'
    ).publicFacts.kind).toBe('unknown');
  });
  it('maps generic CLI usage errors to actionable creator configuration codes', () => {
    expect(normalizeVishnuFailure({
      code: 'usage',
      message: '使用OpenAI转录服务需要配置 OpenAI API Key'
    })).toEqual({
      code: 'creator_transcription_config_missing',
      message: '使用OpenAI转录服务需要配置 OpenAI API Key'
    });

    expect(normalizeVishnuFailure({
      code: 'usage',
      message: 'TTS 服务配置不完整'
    }).code).toBe('creator_tts_config_missing');
  });

  it('maps a deferred transcription failure after platform caption fallback', () => {
    expect(normalizeVishnuFailure({
      code: 'audio_transcription_failed',
      message: '使用OpenAI转录服务需要配置 OpenAI API Key'
    }).code).toBe('creator_transcription_config_missing');
  });
});
