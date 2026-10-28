import type { SrtCue } from '../validators/srt.js';
import { splitCaptionChunks } from '../clip/captions.js';

export type TranscriptParagraph = {
  startMs: number;
  endMs: number;
  text: string;
};

const khmerSentenceEnders = new Set(['។', '៕', '៖']);
const sentenceEnderPattern = /[។៕៖.!?。！？]$/;

// Groups transcript cues into chronological paragraphs. Paragraphs prefer
// sentence boundaries; if a stretch has no enders (common for Khmer, which
// often omits ។ in transcripts), the char/cue thresholds force a break.
// Khmer has no spaces, so the accumulation threshold is measured in
// characters instead of words.
export function transcriptParagraphs(
  cues: SrtCue[],
  options: { maxChars?: number; maxCues?: number } = {}
): TranscriptParagraph[] {
  const maxChars = options.maxChars ?? 800;
  const maxCues = options.maxCues ?? 12;
  const paragraphs: TranscriptParagraph[] = [];
  let current: SrtCue[] = [];
  let chars = 0;
  const flush = () => {
    if (current.length === 0) return;
    paragraphs.push(paragraphOf(current));
    current = [];
    chars = 0;
  };
  for (const cue of cues) {
    const text = cue.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    current.push(cue);
    chars += text.length;
    const lastText = current[current.length - 1]!.text.replace(/\s+/g, ' ').trim();
    if (
      current.length >= maxCues
      || chars >= maxChars
      || (sentenceComplete(lastText) && chars >= Math.ceil(maxChars / 2))
    ) {
      flush();
    }
  }
  flush();
  return paragraphs.map(paragraph => ({
    ...paragraph,
    text: paragraph.text.replace(/\s+/g, ' ').trim()
  })).filter(paragraph => paragraph.text.length > 0);
}

function sentenceComplete(text: string): boolean {
  const last = text[text.length - 1] ?? '';
  return sentenceEnderPattern.test(last) || khmerSentenceEnders.has(last);
}

function paragraphOf(cues: SrtCue[]): TranscriptParagraph {
  return {
    startMs: cues[0]!.startMs,
    endMs: cues[cues.length - 1]!.endMs,
    text: cues.map(cue => cue.text.replace(/\s+/g, ' ').trim()).join('\n')
  };
}

export type SeoChapter = { timestamp: string; label: string };

// Deterministic chapters from paragraph milestones: the opening plus evenly
// spaced progress points, labelled with a short snippet of the local content.
export function chaptersFromParagraphs(
  paragraphs: TranscriptParagraph[],
  maxChapters = 6
): SeoChapter[] {
  if (paragraphs.length === 0) return [];
  const selected = selectMilestones(paragraphs.length, Math.max(2, Math.min(maxChapters, paragraphs.length)));
  return selected.map(index => {
    const paragraph = paragraphs[index]!;
    return {
      timestamp: chapterTimestamp(paragraph.startMs),
      label: chapterLabel(paragraph.text)
    };
  });
}

function selectMilestones(total: number, count: number): number[] {
  const indexes: number[] = [0];
  const step = (total - 1) / Math.max(1, count - 1);
  for (let i = 1; i < count; i++) {
    const index = Math.min(total - 1, Math.round(i * step));
    if (indexes[indexes.length - 1] !== index) indexes.push(index);
  }
  return indexes;
}

function chapterTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function chapterLabel(text: string): string {
  const full = text.replace(/\s+/g, ' ').trim();
  const snippet = full.slice(0, 48);
  return snippet.length < full.length ? `${snippet.trimEnd()}…` : snippet;
}

export type DeterministicArticle = {
  title: string;
  markdown: string;
  seo: {
    description: string;
    keywords: string[];
    chapters: SeoChapter[];
    hashtags: string[];
    tags: string[];
  };
};

// Transparent fallback used when the writing model returns unusable output.
// It is deterministic content assembled from the transcript itself, never a
// placeholder pretending to be generated copy.
export function buildDeterministicArticle(input: {
  sourceTitle: string;
  targetLanguage: string;
  paragraphs: TranscriptParagraph[];
}): DeterministicArticle {
  const title = input.sourceTitle.trim() || (input.targetLanguage.startsWith('km')
    ? 'សេចក្តីសង្ខេបពីវីដេអូ'
    : 'Video summary');
  const transcript = input.paragraphs.map(paragraph => paragraph.text).join('\n\n');
  const keywords = topKeywords(transcript, 8);
  const chapters = chaptersFromParagraphs(input.paragraphs);
  const description = descriptionFromParagraphs(input.paragraphs, title);
  const sectionHeadings = chunksToParagraphHeadings(input.paragraphs, keywords);

  const lines = [`# ${title}`];
  lines.push('', description);
  for (const [index, section] of sectionHeadings.entries()) {
    lines.push('', `## ${section.heading}`, '', section.text);
  }
  if (chapters.length > 0) {
    const isKhmer = input.targetLanguage.startsWith('km');
    lines.push('', isKhmer ? `## ចំណុចសំខាន់ៗ` : '## Key moments');
    for (const chapter of chapters) lines.push(`- ${chapter.timestamp} ${chapter.label}`);
  }

  const hashtags = hashtagsFromKeywords(keywords, 4);
  return {
    title,
    markdown: lines.join('\n'),
    seo: {
      description,
      keywords,
      chapters,
      hashtags,
      tags: keywords.slice(0, 10)
    }
  };
}

function descriptionFromParagraphs(paragraphs: TranscriptParagraph[], title: string): string {
  const body = paragraphs.map(paragraph => paragraph.text).join(' ').replace(/\s+/g, ' ').trim();
  return body.length === 0 ? title : `${title} — ${truncate(body, 280)}`;
}

function chunksToParagraphHeadings(
  paragraphs: TranscriptParagraph[],
  keywords: string[]
): Array<{ heading: string; text: string }> {
  if (paragraphs.length === 0) return [];
  return paragraphs.slice(0, 6).map((paragraph, index) => ({
    heading: headingFromKeyword(keywords[index], index),
    text: paragraph.text
  }));
}

function headingFromKeyword(keyword: string | undefined, index: number): string {
  if (keyword && keyword.length >= 2) {
    return `${index + 1}. ${keyword}`;
  }
  return `Part ${index + 1}`;
}

export function topKeywords(text: string, limit: number): string[] {
  const frequencies = new Map<string, number>();
  for (const term of tokenizeTerms(text)) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }
  return [...frequencies.entries()]
    .sort((left, right) => right[1] - left[1])
    .filter(([, count]) => count > 1)
    .slice(0, limit)
    .map(([term]) => term);
}

function tokenizeTerms(text: string): string[] {
  const terms: string[] = [];
  for (const segment of text.split(/[\s,،、;:()\[\]"'«»]+/)) {
    if (!segment) continue;
    if (hasKhmer(segment)) {
      terms.push(...splitCaptionChunks(segment).filter(isUsefulTerm));
    } else {
      terms.push(...segment.split(/[.!?/?…]+/).filter(isUsefulTerm));
    }
  }
  return terms;
}

function hasKhmer(value: string): boolean {
  return /[\u1780-\u17FF]/.test(value);
}

function isUsefulTerm(term: string): boolean {
  return term.length >= 2 && term.length <= 24;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function hashtagsFromKeywords(keywords: string[], limit: number): string[] {
  const hashtags: string[] = [];
  for (const keyword of keywords) {
    const slug = keyword.replace(/[^\p{L}\p{N}_]/gu, '');
    if (slug.length < 2 || hashtags.includes(`#${slug}`)) continue;
    hashtags.push(`#${slug}`);
    if (hashtags.length >= limit) break;
  }
  return hashtags;
}
