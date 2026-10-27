import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assTime,
  buildKaraokeAss,
  selectCuesInRange,
  splitCaptionChunks
} from '../../src/creator/clip/captions.js';

let tempDir = '';

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('karaoke captions', () => {
  it('splits Khmer captions per syllable cluster without breaking coeng stacks', () => {
    // ខ្មែរ: the coeng cluster (ខ + ្ម + vowel ែ) stays together; the next
    // base consonant រ starts its own reveal chunk.
    expect(splitCaptionChunks('ខ្មែរ')).toEqual(['ខ្មែ', 'រ']);
    expect(splitCaptionChunks('ភាសាខ្មែរ')).toEqual(['ភា', 'សា', 'ខ្មែ', 'រ']);
    // Punctuation joins the chunk before it instead of floating alone.
    expect(splitCaptionChunks('អ្នក។')).toEqual(['អ្ន', 'ក។']);
  });

  it('keeps mixed Khmer and spaced text in reading order', () => {
    const chunks = splitCaptionChunks('កម្ពុជា\u200Bនៅអាស៊ី and English');
    expect(chunks).toEqual(['ក', 'ម្ពុ', 'ជា', 'នៅ', 'អា', 'ស៊ី', 'and', 'English']);
  });

  it('splits spaced languages per word', () => {
    expect(splitCaptionChunks('Pricing and customers')).toEqual(['Pricing', 'and', 'customers']);
  });

  it('clips cues to the render range and shifts them into clip-local time', () => {
    const cues = [
      { index: 1, startMs: 1000, endMs: 4000, text: 'one two three' },
      { index: 2, startMs: 4500, endMs: 6000, text: 'four' },
      { index: 3, startMs: 9000, endMs: 12000, text: 'outside' }
    ];
    const selected = selectCuesInRange(cues, 2000, 5000);
    expect(selected).toEqual([
      { startMs: 0, endMs: 2000, parts: ['one', 'two', 'three'] },
      { startMs: 2500, endMs: 3000, parts: ['four'] }
    ]);
  });

  it('writes layout styles and karaoke tags that fill the whole cue duration', () => {
    const ass = buildKaraokeAss(
      [{ startMs: 500, endMs: 2500, parts: ['ខ្មែរ', 'នេះ'] }],
      { width: 1080, height: 1920, fontFamily: 'Noto Sans Khmer' }
    );
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('PlayResY: 1920');
    expect(ass).toContain('Style: Karaoke,Noto Sans Khmer');
    const dialogue = ass.split('\n').find(line => line.startsWith('Dialogue: 0,0:00:00.50'))!;
    expect(dialogue).toContain('0:00:02.50');
    const tags = [...dialogue.matchAll(/\\k(\d+)/g)].map(match => Number(match[1]));
    expect(tags.reduce((sum, value) => sum + value, 0)).toBe(200); // 2500-500ms = 200 centiseconds
    expect(tags.every(tag => tag >= 1)).toBe(true);
  });

  it('formats ASS timestamps with centisecond precision', () => {
    expect(assTime(0)).toBe('0:00:00.00');
    expect(assTime(12345)).toBe('0:00:12.34');
    expect(assTime(4500)).toBe('0:00:04.50');
    expect(assTime(-5)).toBe('0:00:00.00');
  });
});
