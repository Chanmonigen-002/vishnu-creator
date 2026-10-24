import { describe, expect, it } from 'vitest';
import {
  createVishnuCliExecutionPlan,
  isYouTubeSource
} from '../../src/creator/vishnu/execution-plan.js';

describe('VishnuAI CLI execution plan', () => {
  it('defers transcription until captions are absent or unusable', () => {
    expect(createVishnuCliExecutionPlan('subtitle', {
      sourceUrl: 'https://www.youtube.com/watch?v=demo', mediaSource: 'local:/video.mp4'
    }, { captionSource: 'any' })).toEqual([
      {
        source: 'https://www.youtube.com/watch?v=demo', options: { captionSource: 'platform' },
        continueOnErrorCodes: ['platform_caption_failed', 'platform_caption_invalid']
      },
      { source: 'local:/video.mp4', options: { captionSource: 'whisper' } }
    ]);
  });

  it('delegates platform-caption fallback to VishnuAI in one attempt', () => {
    const plan = createVishnuCliExecutionPlan(
      'subtitle',
      { captionSource: 'any' }
    );

    expect(plan).toEqual([{ options: { captionSource: 'any' } }]);
  });

  it('defaults subtitles to VishnuAI any-source mode', () => {
    expect(createVishnuCliExecutionPlan(
      'subtitle',
      {}
    )).toEqual([{
      options: { captionSource: 'any' }
    }]);

    expect(createVishnuCliExecutionPlan(
      'subtitle',
      { captionSource: 'whisper' }
    )).toEqual([{
      options: { captionSource: 'whisper' }
    }]);
  });

  it('keeps non-subtitle stages unchanged', () => {
    expect(createVishnuCliExecutionPlan(
      'render-horizontal',
      {}
    )).toEqual([{ options: {} }]);
  });

  it('recognizes supported YouTube hosts without accepting lookalike domains', () => {
    expect(isYouTubeSource('https://youtu.be/demo')).toBe(true);
    expect(isYouTubeSource('https://m.youtube.com/watch?v=demo')).toBe(true);
    expect(isYouTubeSource('https://www.youtube-nocookie.com/embed/demo')).toBe(true);
    expect(isYouTubeSource('https://youtube.com.example.test/watch?v=demo')).toBe(false);
    expect(isYouTubeSource('not-a-url')).toBe(false);
  });
});
