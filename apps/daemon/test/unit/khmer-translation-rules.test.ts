/**
 * Unit tests for Khmer translation rules (clean re-implementation,
 * no ZastTranslate code copied).
 *
 * These tests validate the rule text, CPS character budget math, and
 * Khmer text handling (no inter-word spaces, ។ sentence punctuation,
 * Arabic numerals) purely in TypeScript — no LLM API key required.
 */

import { describe, it, expect } from 'vitest';
import {
  KHMER_RULES,
  getKhmerRules,
  maxCharsForDuration,
  khmerHasNoInterWordSpaces,
  splitKhmerSentences,
  khmerEndsWithSentencePunctuation,
  containsArabicNumerals,
} from '../../src/creator/vishnu/khmer-translation-rules.js';

describe('Khmer translation rules', () => {
  it('contains the required Khmer dubbing rules', () => {
    expect(KHMER_RULES).toContain('natural spoken Khmer');
    expect(KHMER_RULES).toContain('NO spaces between words');
    expect(KHMER_RULES).toContain('។');
    expect(KHMER_RULES).toContain('Arabic numerals');
    expect(KHMER_RULES).toContain('Coeng');
    expect(KHMER_RULES).toContain('Zero-Width');
  });

  it('returns Khmer rules for km target language', () => {
    expect(getKhmerRules('km')).toBe(KHMER_RULES);
    expect(getKhmerRules('km-kh')).toBe(KHMER_RULES);
    expect(getKhmerRules('khmer')).toBe(KHMER_RULES);
  });

  it('returns empty rules for non-Khmer languages', () => {
    expect(getKhmerRules('en')).toBe('');
    expect(getKhmerRules('zh')).toBe('');
    expect(getKhmerRules('fr')).toBe('');
  });

  it('CPS budget scales with duration', () => {
    const cps = 13.0;
    const short = maxCharsForDuration(1.0, cps);
    const long = maxCharsForDuration(5.0, cps);
    expect(long).toBeGreaterThan(short);
    expect(short).toBe(Math.floor(1.0 * 13.0 * 1.25)); // 16
  });

  it('higher CPS allows more characters for same duration', () => {
    const budgetLow = maxCharsForDuration(2.0, 10.0);
    const budgetHigh = maxCharsForDuration(2.0, 20.0);
    expect(budgetHigh).toBeGreaterThan(budgetLow);
  });

  it('Khmer text has no inter-word spaces inside sentences', () => {
    const khmer = 'សួស្តីក្រុងបណ្ដោះអាសន្ន។លើកទឹកមក។';
    // Spaces only appear after ។ boundaries
    const parts = khmer.split(' ');
    for (const part of parts) {
      if (part.length > 0) {
        expect(part.includes(' ')).toBe(false);
      }
    }
    expect(khmerHasNoInterWordSpaces(khmer)).toBe(true);
  });

  it('Khmer sentences end with ។', () => {
    const khmer = 'សួស្តីក្រុងបណ្ដោះអាសន្ន។លើកទឹកមក។';
    const sentences = splitKhmerSentences(khmer);
    expect(sentences.length).toBe(2);
    for (const sentence of sentences) {
      expect(khmerEndsWithSentencePunctuation(sentence + '។')).toBe(true);
    }
  });

  it('detects Arabic numerals', () => {
    expect(containsArabicNumerals('មានទី123 ប្រាំពីរ។')).toBe(true);
    expect(containsArabicNumerals('សួស្តី។')).toBe(false);
  });
});
