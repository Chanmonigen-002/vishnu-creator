// Independent implementation of burned karaoke captions for vertical short
// clips. Behaviour follows the observed reference studio flow (viral clips in
// 9:16 with progressive karaoke captions); no source text was copied.
import type { SrtCue } from '../validators/srt.js';

export type KaraokeCue = { startMs: number; endMs: number; parts: string[] };

// Khmer dependent vowel signs, coeng and related marks continue a cluster;
// ZWSP/ZWNJ/group separators also stay in a cluster.
const khmerCombining = /[\u17A3-\u17D3\u200C\u200D]/;
const khmerPunctuation = /[\u17D4\u17D5\u17D8]/;

export function selectCuesInRange(
  cues: SrtCue[],
  rangeStartMs: number,
  rangeEndMs: number
): KaraokeCue[] {
  const selected: KaraokeCue[] = [];
  for (const cue of cues) {
    const startMs = Math.max(cue.startMs, Math.round(rangeStartMs));
    const endMs = Math.min(cue.endMs, Math.round(rangeEndMs));
    if (endMs - startMs <= 0) continue;
    const parts = splitCaptionChunks(cue.text);
    if (parts.length === 0) continue;
    selected.push({ startMs: startMs - rangeStartMs, endMs: endMs - rangeStartMs, parts });
  }
  return selected;
}

// Splits a caption into reveal chunks. Spaced languages reveal per word;
// Khmer (unspaced) reveals per stack cluster, honouring zero-width separators
// when the author placed them.
export function splitCaptionChunks(text: string): string[] {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return [];
  const chunks: string[] = [];
  const push = (chunk: string): void => {
    if (chunk) chunks.push(chunk);
  };
  for (const piece of collapsed.split(' ')) {
    const zwspPieces = piece.includes('\u200B') ? piece.split('\u200B') : [piece];
    for (const part of zwspPieces) {
      if (!isKhmerScript(part)) {
        push(part);
        continue;
      }
      let current = '';
      let previousWasCoeng = false;
      for (const char of part) {
        const isCoeng = char === '\u17D2';
        const combining = khmerCombining.test(char);
        const punctuation = khmerPunctuation.test(char);
        if (current && !isCoeng && !combining && !punctuation && !previousWasCoeng) {
          push(current);
          current = '';
        }
        current += char;
        previousWasCoeng = isCoeng;
      }
      push(current);
    }
  }
  return chunks;
}

export function buildKaraokeAss(cues: KaraokeCue[], options: BuildKaraokeAssOptions = {}): string {
  const width = options.width ?? 1080;
  const height = options.height ?? 1920;
  const fontFamily = options.fontFamily ?? 'Noto Sans Khmer';
  const fontSize = (options.fontSize ?? 72).toFixed(0);
  const lines = [
    '[Script Info]',
    '; Independent implementation: structural re-implementation, ADR-0005 option 2',
    `Title: Short clip captions`,
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Karaoke,${fontFamily},${fontSize},&H0000E5FF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,60,60,${(height * 0.1).toFixed(0)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];
  for (const cue of cues) {
    const text = cueText(cue.parts, cue.endMs - cue.startMs);
    lines.push(`Dialogue: 0,${assTime(cue.startMs)},${assTime(cue.endMs)},Karaoke,,0,0,0,,${text}`);
  }
  return lines.join('\n').concat('\n');
}

export type BuildKaraokeAssOptions = {
  width?: number;
  height?: number;
  fontFamily?: string;
  fontSize?: number;
};

function isKhmerScript(value: string): boolean {
  return /[\u1780-\u17FF]/.test(value);
}

function cueText(parts: string[], durationMs: number): string {
  const weights = parts.map(part => [...part].length);
  const totalWeight = Math.max(1, weights.reduce((sum, weight) => sum + weight, 0));
  const totalCentiseconds = Math.max(1, Math.round(durationMs / 10));
  let used = 0;
  const tags: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const target = index === parts.length - 1
      ? totalCentiseconds
      : Math.min(totalCentiseconds, Math.round(totalCentiseconds * (used + weights[index]!) / totalWeight));
    const centiseconds = Math.max(1, target - used);
    used += centiseconds;
    tags.push(`{\\k${centiseconds}}${parts[index]!.replace(/\n/g, ' ')}`);
  }
  return tags.join('');
}

export function assTime(valueMs: number): string {
  const total = Math.max(0, Math.round(valueMs));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const centiseconds = Math.floor((total % 1000) / 10);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}
