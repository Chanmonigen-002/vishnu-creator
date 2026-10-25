/**
 * Vishnu Creator — Khmer translation rules for subtitle dubbing.
 *
 * Original implementation for the Vishnu Creator project. These rules guide
 * LLM-based subtitle translation into Khmer so that the output is suitable
 * for text-to-speech synthesis and subtitle rendering:
 *
 * - Natural spoken Khmer, not stiff literary Khmer
 * - No spaces between words inside a sentence (Khmer script is unicameral
 *   and does not use inter-word spacing)
 * - Sentence punctuation uses ។ (Khmer full stop)
 * - Arabic numerals for numbers
 * - Coeng (U+17D2) subscript consonants must stay attached to their base
 * - No zero-width spaces or invisible characters
 */

export const KHMER_RULES = `KHMER DUBBING RULES:
- Write natural spoken Khmer, not stiff literary or Pali-influenced Khmer.
- Khmer has NO spaces between words: never insert spaces inside a sentence;
  only separate clauses and sentences, and place a space after ។ punctuation.
- NEVER insert Zero-Width Spaces (U+200B) or any invisible characters; the
  TTS engine reads plain continuous Khmer script.
- Preserve Coeng (U+17D2) subscript consonants: never split a subscript from
  its base consonant.
- Use standard Khmer punctuation: ។ ends a sentence.
- Write numbers as Arabic numerals (1, 2, 3); the TTS engine reads them correctly.
- Keep Buddhist and Pali-Sanskrit loan terms in their standard Khmer forms.
- Keep Latin brand names as-is when no common Khmer form exists.
- Avoid abbreviations the TTS engine cannot read aloud.
- Fit the translation within the character budget for the segment duration.`;

/**
 * Return the Khmer translation rules when the target language is Khmer,
 * otherwise an empty string (no language-specific rules applied).
 */
export function getKhmerRules(targetLanguage: string): string {
  const normalized = targetLanguage.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'km' || normalized === 'km-kh' || normalized === 'khmer') {
    return KHMER_RULES;
  }
  return '';
}

/**
 * Maximum characters allowed for a subtitle segment given its duration and
 * a characters-per-second (CPS) budget. The 1.25 factor gives headroom for
 * Khmer's typically longer glyph clusters compared to Latin text.
 */
export function maxCharsForDuration(durationSeconds: number, cps: number): number {
  return Math.max(0, Math.floor(durationSeconds * cps * 1.25));
}

/**
 * Check that a Khmer sentence contains no ASCII space characters inside a
 * sentence chunk (spaces only appear after ។ sentence boundaries).
 */
export function khmerHasNoInterWordSpaces(text: string): boolean {
  const parts = text.split(' ');
  for (const part of parts) {
    if (part.length > 0 && part.includes(' ')) return false;
  }
  return true;
}

/**
 * Split Khmer text into sentences on ។ boundaries, dropping empty chunks.
 */
export function splitKhmerSentences(text: string): string[] {
  return text.split('។').filter(part => part.trim().length > 0);
}

/**
 * Check that a Khmer sentence ends with ។ punctuation.
 */
export function khmerEndsWithSentencePunctuation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  return trimmed.endsWith('។');
}

/**
 * Detect whether text contains Arabic numerals (0-9).
 */
export function containsArabicNumerals(text: string): boolean {
  return /\d/.test(text);
}
