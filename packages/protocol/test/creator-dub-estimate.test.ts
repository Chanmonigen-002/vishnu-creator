import { describe, expect, it } from 'vitest';
import {
  estimateDubJob,
  formatEstimateDuration,
  formatEstimateCost
} from '../src/creator-services.js';

describe('estimateDubJob', () => {
  it('calculates local offline estimate with 0 USD cost across tiers', () => {
    const estimateT1 = estimateDubJob({
      durationSeconds: 60,
      mode: 'local',
      tier: 'T1'
    });
    expect(estimateT1.mode).toBe('local');
    expect(estimateT1.tier).toBe('T1');
    expect(estimateT1.durationSeconds).toBe(60);
    expect(estimateT1.estimatedCostUsd).toBe(0.0);
    // T1 default ratio is 3.5 -> breakdown sum = 53 + 11 + 95 + 53 = 212s
    expect(estimateT1.estimatedTimeSeconds).toBe(212);
    expect(estimateT1.breakdown.asrCostUsd).toBe(0.0);
    expect(estimateT1.breakdown.translationCostUsd).toBe(0.0);
    expect(estimateT1.breakdown.ttsCostUsd).toBe(0.0);
    expect(estimateT1.breakdown.separationCostUsd).toBe(0.0);
    expect(estimateT1.breakdown.asrSeconds + estimateT1.breakdown.translationSeconds + estimateT1.breakdown.ttsSeconds + estimateT1.breakdown.separationSeconds).toBe(212);

    const estimateT3 = estimateDubJob({
      durationSeconds: 60,
      mode: 'local',
      tier: 'T3'
    });
    // T3 default ratio is 0.4 -> breakdown sum = 6 + 1 + 11 + 6 = 24s
    expect(estimateT3.estimatedTimeSeconds).toBe(24);
    expect(estimateT3.estimatedCostUsd).toBe(0.0);
  });

  it('calculates api-assist mode with cloud ASR and translation costs', () => {
    const estimate = estimateDubJob({
      durationSeconds: 120,
      mode: 'api-assist',
      tier: 'T1'
    });
    expect(estimate.mode).toBe('api-assist');
    expect(estimate.durationSeconds).toBe(120);
    // ASR cost: (120 / 60) * 0.006 = 0.012
    // Translation cost: 0.002
    // Total cost: 0.014
    expect(estimate.estimatedCostUsd).toBe(0.014);
    expect(estimate.breakdown.asrCostUsd).toBe(0.012);
    expect(estimate.breakdown.translationCostUsd).toBe(0.002);
    expect(estimate.estimatedTimeSeconds).toBeGreaterThan(0);
  });

  it('calculates remote mode for dedicated engine server', () => {
    const estimate = estimateDubJob({
      durationSeconds: 60,
      mode: 'remote'
    });
    expect(estimate.mode).toBe('remote');
    expect(estimate.estimatedCostUsd).toBe(0.0);
    expect(estimate.estimatedTimeSeconds).toBe(21);
  });

  it('applies custom benchmark ratio when provided', () => {
    const estimate = estimateDubJob({
      durationSeconds: 60,
      mode: 'local',
      tier: 'T1',
      benchmarkTotalSeconds: 20.0 // ratio = 20.0 / 10.0 = 2.0
    });
    // 30 + 6 + 54 + 30 = 120s
    expect(estimate.estimatedTimeSeconds).toBe(120);
  });
});

describe('formatEstimateDuration & formatEstimateCost', () => {
  it('formats seconds into readable strings', () => {
    expect(formatEstimateDuration(45)).toBe('~45s');
    expect(formatEstimateDuration(95)).toBe('~1m 35s');
    expect(formatEstimateDuration(3600)).toBe('~60m');
  });

  it('formats costs cleanly', () => {
    expect(formatEstimateCost(0)).toBe('$0.00 (Free)');
    expect(formatEstimateCost(0.005)).toBe('< $0.01');
    expect(formatEstimateCost(0.014)).toBe('~$0.014');
  });
});
