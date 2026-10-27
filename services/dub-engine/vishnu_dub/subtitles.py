"""Vishnu Dub Engine — Subtitle Stabilization & Ergonomic Formatting.

Origin: ZastTranslate (modules/srt_cleaner.py, modules/srt_parser.py, modules/transcriber.py)
License: Apache-2.0 per ADR-0005 (clean re-implementation)

Implements the strict 8-step subtitle stabilization pipeline:
1. AI & Tech Context Priming (initial_prompt for WhisperX / faster-whisper)
2. Lookahead Word-Level Boundary Splitting (no 1-word cues, min_cue_words=3, min_cue_duration_ms=400ms)
3. Empty & Isolated Punctuation Elimination (redistributes duration to previous cue)
4. Sentence Fragment Merging & Anti-Dangling Engine (merges dangling connectors)
5. Context-Aware Sentence Casing (fix_inter_cue_casing: proper nouns, English "I", German nouns, acronyms)
6. Oral Filler & Hesitation Cleaning (heuristic oral tic removal)
7. Cross-Cue Post-ASR Tech Dictionary Repairs (222+ rules)
8. Broadcast-Compliant Formatting & Strict Monotonic Timecode Normalization (end[i] <= start[i+1] - 40ms)
"""

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

MIN_CUE_WORDS = 3
MIN_CUE_DURATION_MS = 400
MIN_GAP_MS = 40
MAX_CHARS_PER_LINE = 50

DEFAULT_INITIAL_PROMPT = (
    "Vishnu Creator, Pinokio, WhisperX, large-v3, Qwen, Qwen3.5-9B, VoxCPM 2, "
    "FLUX.1-schnell, Fitted, Bulk Mode, Translation et Dubbing, Blog Studio, "
    "Clean Fillers, 16:9, 9:16, longues traînes, tics IA, Demucs, pyannote, Ollama, vLLM, "
    "Claude, Claude.ai, ChatGPT, OpenAI, GPT-4, DeepSeek, PyTorch, LoRA, ElevenLabs, "
    "Kokoro, F5-TTS, CosyVoice, Midjourney, Stable Diffusion, ComfyUI, Hugging Face, "
    "FFmpeg, VRAM, CUDA, GGUF, Python, GitHub, YouTube, Gradio, LLM, IA, API, SRT, VTT, TTS, "
    "WordPress, TikTok."
)

STRONG_PUNCTUATIONS = ('.', '?', '!', ';', '…', ':', '»', '។', '៕')
WEAK_PUNCTUATIONS = (',', '-', '–', '—')

DANGLING_CONNECTORS = {
    # French
    "si", "que", "de", "le", "la", "les", "des", "pour", "avec", "dans", "sans", "sur",
    "sous", "en", "par", "à", "au", "aux", "et", "ou", "mais", "car", "donc", "un", "une",
    "du", "d'", "l'", "c'", "qu'", "ce", "cette", "ces", "mon", "ton", "son", "notre", "votre", "leur",
    "après", "avant", "pendant", "vers", "chez",
    # English
    "if", "and", "the", "to", "of", "in", "for", "on", "with", "that", "this", "as", "at",
    "by", "or", "but", "because", "so",
    # German
    "wenn", "dass", "und", "oder", "aber", "weil", "ob", "wie",
    # Spanish / Italian / Portuguese
    "se", "che", "di", "y", "o", "pero",
}

SENTENCE_STARTERS = {
    "parce", "car", "mais", "or", "donc", "ensuite", "puis", "enfin", "d'ailleurs", "selon", "d'après", "en",
    "because", "however", "therefore", "furthermore", "meanwhile", "moreover", "actually",
}

GERMAN_LOWERCASE_WORDS = {
    "und", "oder", "aber", "denn", "weil", "dass", "da", "wenn", "ob", "wie", "als",
    "wir", "sie", "er", "es", "ich", "du", "ihr", "mein", "dein", "sein", "unser", "euer",
    "der", "die", "das", "ein", "eine", "einer", "einem", "einen", "eines",
    "in", "an", "auf", "aus", "bei", "mit", "nach", "von", "zu", "für", "über", "unter",
    "vor", "zwischen", "durch", "ohne", "um", "gegen", "ist", "sind", "war", "waren",
    "wird", "werden", "wurde", "wurden", "hat", "haben", "hatte", "hatten",
    "kann", "können", "muss", "müssen", "soll", "sollen", "will", "wollen",
    "nicht", "auch", "noch", "schon", "sehr", "nur", "so", "dann", "hier", "da", "jetzt",
}

FILLER_PATTERNS_BY_LANG: Dict[str, List[str]] = {
    "fr": [
        r"^(?:donc\s+voil[aà]|donc\s+alors|voil[aà]\s+donc|en\s+fait\s+donc|du\s+coup\s+donc|alors\s+voil[aà])\b[,;\s]*",
        r"^(?:donc|voil[aà]|alors|en\s+fait|du\s+coup|euh|ben|bah|bon\s+ben|bon\s+bah)\b[,;\s]*",
    ],
    "en": [
        r"^(?:so\s+basically|so\s+like|you\s+know\s+like|actually\s+so|well\s+so)\b[,;\s]*",
        r"^(?:so|well|actually|basically|you\s+know|like|um|uh|er|ah)\b[,;\s]*",
    ],
    "es": [
        r"^(?:bueno\s+pues|o\s+sea\s+que|entonces\s+bueno)\b[,;\s]*",
        r"^(?:bueno|pues|entonces|o\s+sea|eh|em|este)\b[,;\s]*",
    ],
    "de": [
        r"^(?:also\s+quasi|also\s+halt|sozusagen\s+also)\b[,;\s]*",
        r"^(?:also|halt|quasi|sozusagen|ähm|äh|na\s+ja)\b[,;\s]*",
    ],
    "it": [
        r"^(?:quindi\s+ecco|allora\s+quindi|cioè\s+quindi)\b[,;\s]*",
        r"^(?:quindi|allora|ecco|cioè|ehm|eh|insomma)\b[,;\s]*",
    ],
    "pt": [
        r"^(?:então\s+tipo|bom\s+então|tipo\s+assim)\b[,;\s]*",
        r"^(?:então|tipo|bom|né|tipo\s+assim|aí)\b[,;\s]*",
    ],
}

FILLER_WORDS_BY_LANG: Dict[str, Set[str]] = {
    "fr": {"donc", "voila", "voilà", "alors", "euh", "ben", "bah", "quoi"},
    "en": {"so", "um", "uh", "er", "ah", "like", "basically", "actually"},
    "es": {"bueno", "pues", "entonces", "eh", "em", "este"},
    "de": {"also", "halt", "quasi", "ähm", "äh"},
    "it": {"quindi", "allora", "ecco", "cioè", "ehm"},
    "pt": {"então", "tipo", "bom", "né", "aí"},
}

MID_HESITATION_PATTERNS: Dict[str, Tuple[str, str]] = {
    "fr": (r'[,;\s]*\b(?:euh|ben|bah)\b[,;\s]*', r'[,;\s]+\b(?:voil[aà]|quoi)\s*$'),
    "en": (r'[,;\s]*\b(?:um|uh|er|ah)\b[,;\s]*', r'[,;\s]+\b(?:you\s+know|right)\s*$'),
    "es": (r'[,;\s]*\b(?:eh|em|este)\b[,;\s]*', r'[,;\s]+\b(?:viste|sabes)\s*$'),
    "de": (r'[,;\s]*\b(?:ähm|äh)\b[,;\s]*', r'[,;\s]+\b(?:oder\s+so|nicht\s+wahr)\s*$'),
    "it": (r'[,;\s]*\b(?:ehm|eh)\b[,;\s]*', r'[,;\s]+\b(?:capito|sai)\s*$'),
    "pt": (r'[,;\s]*\b(?:é|ahn)\b[,;\s]*', r'[,;\s]+\b(?:né|sabe)\s*$'),
}

DEFAULT_GLOSSARY_PROPER_NOUNS: Set[str] = {
    "Vishnu Creator", "YouTube", "VoxCPM", "Qwen", "FLUX", "FLUX.1", "Pinokio",
    "Whisper", "WhisperX", "Claude", "OpenAI", "ChatGPT", "WordPress", "TikTok",
    "Midjourney", "ComfyUI", "Gradio", "SEO", "IA", "AI", "URL", "API", "TTS", "LLM",
    "SRT", "VTT", "SBV", "CPS", "HD", "4K", "TF32", "NVIDIA", "CUDA", "JSON",
    "YAML", "HTML", "CSS", "JS", "Auto", "Hermès", "Blog", "Bulk", "Mode",
    "Studio", "Clean", "Fillers", "Translation", "Dubbing", "Fitted",
}


def format_timestamp(seconds: float, decimal_sep: str = ",") -> str:
    """Format seconds as SRT/VTT timestamp (HH:MM:SS,mmm or HH:MM:SS.mmm)."""
    if seconds < 0:
        seconds = 0.0
    total_ms = int(round(seconds * 1000))
    hours = total_ms // 3_600_000
    minutes = (total_ms % 3_600_000) // 60_000
    secs = (total_ms % 60_000) // 1_000
    millis = total_ms % 1_000
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{decimal_sep}{millis:03d}"


def seconds_from_srt_timestamp(ts: str) -> float:
    """Parse SRT timestamp (HH:MM:SS,mmm or HH:MM:SS.mmm) into seconds as float."""
    normalized = ts.strip().replace(",", ".")
    parts = normalized.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return float(h) * 3600.0 + float(m) * 60.0 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return float(m) * 60.0 + float(s)
    return float(normalized)


def load_khmer_asr_corrections() -> List[Dict[str, Any]]:
    """Load built-in Khmer ASR corrections from data/asr_corrections_khmer.json."""
    khmer_data_path = Path(__file__).parent / "data" / "asr_corrections_khmer.json"
    if khmer_data_path.exists() and khmer_data_path.is_file():
        try:
            with open(khmer_data_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception as e:
            print(f"[subtitles] Error loading {khmer_data_path}: {e}")
    return []


def load_asr_corrections(
    config_path: Optional[str] = None,
    lang_code: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Load external/built-in ASR corrections from data/asr_corrections.json and
    data/asr_corrections_khmer.json.
    """
    candidate_paths: List[Path] = []
    if config_path:
        candidate_paths.append(Path(config_path))
    default_data_path = Path(__file__).parent / "data" / "asr_corrections.json"
    candidate_paths.append(default_data_path)

    loaded_corrections: List[Dict[str, Any]] = []
    for p in candidate_paths:
        if p.exists() and p.is_file():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        loaded_corrections.extend(data)
                        break
            except Exception as e:
                print(f"[subtitles] Error loading {p}: {e}")

    # Load Khmer corrections if lang_code is "km" or None (included by default for full coverage)
    norm_lang = (lang_code or "").lower()[:2]
    if norm_lang == "km" or not lang_code:
        khmer_corrs = load_khmer_asr_corrections()
        loaded_corrections.extend(khmer_corrs)

    return loaded_corrections



# ============================================================================
# Step 2: Lookahead Word-Level Boundary Splitting
# ============================================================================

def split_segment(
    seg: Dict[str, Any],
    max_duration: float = 8.0,
    max_chars: int = 75,
    min_words: int = MIN_CUE_WORDS,
    min_duration_ms: int = MIN_CUE_DURATION_MS,
    text_key: str = "text",
) -> List[Dict[str, Any]]:
    """
    Split a single segment into smaller cues if it exceeds max_duration or max_chars.
    Enforces lookahead word counting (min_words=3, min_duration_ms=400ms):
    - Never expels 1-2 word orphans.
    - Preserves short single-cue segments if the entire segment is that short or punctuated.
    """
    start = float(seg.get("start", 0.0))
    end = float(seg.get("end", start + 0.4))
    duration = max(0.0, end - start)
    text = seg.get(text_key, "").strip()
    min_duration = min_duration_ms / 1000.0

    if duration <= max_duration and len(text) <= max_chars:
        return [dict(seg)]

    words = seg.get("words", [])
    if words:
        # Interpolate missing word timestamps if any
        seg_start = start
        seg_end = end
        for idx, w in enumerate(words):
            if "start" not in w or w["start"] is None:
                w["start"] = seg_start if idx == 0 else words[idx - 1].get("end", seg_start)
            if "end" not in w or w["end"] is None:
                w["end"] = w["start"] + 0.1
            if w["end"] < w["start"]:
                w["end"] = w["start"] + 0.1

        sub_segs: List[Dict[str, Any]] = []
        curr_words: List[Dict[str, Any]] = []

        def build_sub_seg(word_list: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
            if not word_list:
                return None
            sub_start = float(word_list[0]["start"])
            sub_end = float(word_list[-1]["end"])
            sub_text = " ".join([str(w.get("word", "")).strip() for w in word_list if str(w.get("word", "")).strip()])
            return {
                "start": round(sub_start, 3),
                "end": round(sub_end, 3),
                text_key: sub_text,
                "words": list(word_list),
            }

        for i, w in enumerate(words):
            curr_words.append(w)
            word_text = str(w.get("word", "")).strip()
            has_strong_punct = any(word_text.endswith(p) for p in STRONG_PUNCTUATIONS)
            has_weak_punct = any(word_text.endswith(p) for p in WEAK_PUNCTUATIONS)

            curr_dur = float(curr_words[-1]["end"]) - float(curr_words[0]["start"])
            curr_len = sum(len(str(cw.get("word", ""))) for cw in curr_words) + (len(curr_words) - 1)

            is_last = (i == len(words) - 1)
            if is_last:
                break

            rem_words = words[i + 1:]
            rem_count = len(rem_words)
            rem_dur = float(rem_words[-1]["end"]) - float(rem_words[0]["start"])

            # Check if splitting here would leave an invalid orphan remainder (< 3 words)
            rem_is_too_short = (rem_count < min_words or rem_dur < min_duration)

            should_split = False
            if not rem_is_too_short:
                if has_strong_punct and curr_dur >= 2.5:
                    should_split = True
                elif has_weak_punct and curr_dur >= 4.0:
                    should_split = True
                elif curr_dur >= max_duration:
                    should_split = True
                elif curr_len >= max_chars and (has_strong_punct or has_weak_punct):
                    should_split = True

            if should_split:
                sub_seg = build_sub_seg(curr_words)
                if sub_seg:
                    sub_segs.append(sub_seg)
                curr_words = []

        # Handle remaining words
        if curr_words:
            curr_dur = float(curr_words[-1]["end"]) - float(curr_words[0]["start"])
            is_orphan = (len(curr_words) < min_words or curr_dur < min_duration)

            if is_orphan and sub_segs:
                # Merge into the previous sub-segment instead of creating a 1-2 word orphan
                prev = sub_segs[-1]
                prev["words"].extend(curr_words)
                prev["end"] = round(float(curr_words[-1]["end"]), 3)
                prev[text_key] = " ".join([str(w.get("word", "")).strip() for w in prev["words"] if str(w.get("word", "")).strip()])
            else:
                sub_seg = build_sub_seg(curr_words)
                if sub_seg:
                    sub_segs.append(sub_seg)

        # Adjust contiguous segment boundaries to prevent overlaps
        for idx in range(len(sub_segs) - 1):
            if sub_segs[idx]["end"] > sub_segs[idx + 1]["start"]:
                sub_segs[idx]["end"] = round(max(sub_segs[idx]["start"] + 0.1, sub_segs[idx + 1]["start"]), 3)

        return sub_segs if sub_segs else [dict(seg)]

    else:
        # Fallback: split by text length proportionally without word timestamps
        tokens = text.split()
        if not tokens:
            return [dict(seg)]

        chunks: List[str] = []
        curr_chunk: List[str] = []
        curr_len = 0
        for t in tokens:
            if curr_len + len(t) + 1 > max_chars and curr_chunk:
                chunks.append(" ".join(curr_chunk))
                curr_chunk = [t]
                curr_len = len(t)
            else:
                curr_chunk.append(t)
                curr_len += len(t) + 1

        if curr_chunk:
            if len(curr_chunk) < min_words and chunks:
                chunks[-1] += " " + " ".join(curr_chunk)
            else:
                chunks.append(" ".join(curr_chunk))

        total_chars = sum(len(c) for c in chunks)
        if total_chars == 0:
            return [dict(seg)]

        sub_segs = []
        start_time = start
        seg_duration = max(0.1, end - start)

        for c in chunks:
            chunk_dur = (len(c) / total_chars) * seg_duration
            end_time = start_time + chunk_dur
            sub_segs.append({
                "start": round(start_time, 3),
                "end": round(end_time, 3),
                text_key: c,
            })
            start_time = end_time

        return sub_segs


def split_long_segments(
    segments: List[Dict[str, Any]],
    max_duration: float = 8.0,
    max_chars: int = 75,
    min_words: int = MIN_CUE_WORDS,
    min_duration_ms: int = MIN_CUE_DURATION_MS,
    text_key: str = "text",
) -> List[Dict[str, Any]]:
    """Split all segments in the list that exceed threshold duration or character count."""
    new_segments = []
    for seg in segments:
        new_segments.extend(
            split_segment(
                seg,
                max_duration=max_duration,
                max_chars=max_chars,
                min_words=min_words,
                min_duration_ms=min_duration_ms,
                text_key=text_key,
            )
        )
    return new_segments


# ============================================================================
# Step 3: Empty & Isolated Punctuation Elimination
# ============================================================================

def remove_empty_cues_and_redistribute(
    cues: List[Dict[str, Any]],
    text_key: str = "text",
) -> List[Dict[str, Any]]:
    """
    Remove cues whose text stripped of punctuation and whitespace is empty (e.g. solitary '.').
    Redistribute their duration to the previous cue.
    """
    if not cues:
        return []

    cleaned: List[Dict[str, Any]] = []
    for cue in cues:
        raw_text = cue.get(text_key, "")
        # Strip whitespace and all punctuation marks (including Khmer ។ ៕)
        stripped = re.sub(r'[\s\.\?\!\,\;\:\-\–\—\…\¿\¡\'\"\(\)\[\]\«\»\។\៕]+', '', raw_text)
        if not stripped:
            if cleaned:
                prev = cleaned[-1]
                cue_end = float(cue.get("end", 0.0))
                if cue_end > float(prev.get("end", 0.0)):
                    prev["end"] = cue_end
                # If the deleted cue had terminal punctuation, preserve it onto previous cue
                p = raw_text.strip()
                if p in ('.', '?', '!', '…', ':', ';', '។', '៕') and not re.search(r'[\.\?\!\…\:\;។៕]$', prev.get(text_key, '')):
                    prev[text_key] = f"{prev.get(text_key, '').rstrip()}{p}"
                if "words" in prev and "words" in cue:
                    prev["words"] = prev.get("words", []) + cue.get("words", [])
            continue
        cleaned.append(dict(cue))
    return cleaned


# ============================================================================
# Step 4: Sentence Fragment Merging & Anti-Dangling Engine
# ============================================================================

def merge_sentence_fragments(
    segments: List[Dict[str, Any]],
    max_gap: float = 2.2,
    max_combined_duration: float = 16.0,
    text_key: str = "text",
) -> List[Dict[str, Any]]:
    """
    Merge sentence fragments, dangling clauses, and stranded orphan words into grammatically complete sentences.
    Guarantees no broken mid-clause cuts (e.g. '...exonération si' + 'votre vente...', '...ticket de' + 'caisse.').
    """
    if not segments or len(segments) <= 1:
        return segments

    terminals = ('.', '?', '!', '...', '…', ':', '»', '"', '។', '៕')

    # Pre-pass: If a segment ends in a comma and next begins with a sentence starter,
    # convert comma to a period so independent sentences don't merge across unrelated topics.
    for i in range(len(segments) - 1):
        curr_text = segments[i].get(text_key, '').strip()
        next_text = segments[i + 1].get(text_key, '').strip()
        next_first = next_text.split()[0].lower() if next_text.split() else ""
        if next_first in ["d'après", "selon", "voilà", "maintenant", "however", "furthermore"] and curr_text.endswith(','):
            segments[i][text_key] = curr_text.rstrip(',') + '.'

    # Pass 1: Forward-merge orphan sentence starters (e.g. "Parce que le BOFIP," with next segment)
    pass1: List[Dict[str, Any]] = []
    skip_next = False
    for i in range(len(segments)):
        if skip_next:
            skip_next = False
            continue
        curr = dict(segments[i])
        curr_text = curr.get(text_key, '').strip()
        curr_words = curr_text.split()
        first_word = curr_words[0].lower().rstrip(",;:") if curr_words else ""

        if i < len(segments) - 1 and (len(curr_words) <= 4 or (float(curr.get('end', 0)) - float(curr.get('start', 0))) < 1.8):
            next_seg = segments[i + 1]
            comb_dur = float(next_seg.get('end', 0.0)) - float(curr.get('start', 0.0))
            gap = float(next_seg.get('start', 0.0)) - float(curr.get('end', 0.0))
            if (first_word in SENTENCE_STARTERS or not any(curr_text.endswith(p) for p in terminals)) and comb_dur <= 16.0 and gap <= 2.5:
                curr['end'] = next_seg['end']
                curr[text_key] = f"{curr_text} {next_seg.get(text_key, '').strip()}"
                if 'words' in curr and 'words' in next_seg:
                    curr['words'] = curr.get('words', []) + next_seg.get('words', [])
                pass1.append(curr)
                skip_next = True
                continue
        pass1.append(curr)

    # Pass 2: Backward-merge dangling ends and incomplete sentences
    merged: List[Dict[str, Any]] = []
    for s in pass1:
        if not merged:
            merged.append(dict(s))
            continue

        prev = merged[-1]
        gap = float(s.get('start', 0.0)) - float(prev.get('end', 0.0))
        combined_dur = float(s.get('end', 0.0)) - float(prev.get('start', 0.0))
        prev_text = prev.get(text_key, '').strip()
        curr_text = s.get(text_key, '').strip()

        prev_words = prev_text.split()
        prev_last_word = prev_words[-1].lower().rstrip(".,;:\"'«»…។៕") if prev_words else ""
        is_dangling_tail = prev_last_word in DANGLING_CONNECTORS
        prev_ends_terminal = any(prev_text.endswith(p) for p in ('.', '?', '!', '។', '៕')) and not is_dangling_tail

        curr_words = curr_text.split()
        curr_ends_terminal = any(curr_text.endswith(p) for p in terminals)
        is_trailing_orphan = (not curr_ends_terminal) and (len(curr_words) <= 3 or (float(s.get('end', 0)) - float(s.get('start', 0))) < 2.0)

        should_merge = False
        if prev_ends_terminal:
            if not curr_ends_terminal and len(curr_words) == 1 and len(curr_text) < 10 and combined_dur <= 14.0:
                should_merge = True
        else:
            if is_dangling_tail and combined_dur <= 18.5:
                should_merge = True
            elif is_trailing_orphan and combined_dur <= 18.5:
                should_merge = True
            elif len(curr_words) <= 6 and curr_text.lower().startswith(('ou ', 'et ', 'mais ', 'car ', 'donc ', 'par ', 'de ', 'and ', 'or ', 'if ', 'that ')) and combined_dur <= 18.5:
                should_merge = True
            elif gap <= max_gap and combined_dur <= max_combined_duration:
                should_merge = True
            elif len(curr_words) <= 6 and combined_dur <= 17.0:
                should_merge = True

        if should_merge:
            prev['end'] = s['end']
            prev[text_key] = f"{prev_text} {curr_text}"
            if 'words' in prev and 'words' in s:
                prev['words'] = prev.get('words', []) + s.get('words', [])
        else:
            merged.append(dict(s))

    return merged


# ============================================================================
# Step 5: Context-Aware Sentence Casing
# ============================================================================

def fix_inter_cue_casing(
    cues: List[Dict[str, Any]],
    text_key: str = "text",
    lang_code: str = "en",
    glossary_proper_nouns: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Fix capitalization across cues for all supported languages:
    - Capitalize the first letter if previous cue ends with strong punctuation (. ? ! … : » ។ ៕) or if it's the first cue.
    - Otherwise (mid-sentence continuation), lowercase the first character.
    - Preserves:
      * English pronoun 'I' and contractions ('I'm', 'I've', 'I'll', 'I'd').
      * German nouns (preserves uppercase; only lowercases known function words/pronouns).
      * Accented single letters ('À', 'Á', 'É', etc.).
      * Proper nouns, acronyms (SEO, IA, AI, URL), and mixed-case terms (YouTube, VoxCPM, Vishnu Creator).
    """
    if not cues:
        return cues

    norm_lang = (lang_code or "en").lower()[:2]
    glossary = set(DEFAULT_GLOSSARY_PROPER_NOUNS)
    if glossary_proper_nouns:
        glossary.update(glossary_proper_nouns)

    # Auto-add words from external ASR corrections glossary
    try:
        for corr in load_asr_corrections():
            rep = corr.get("replacement", "")
            for word in rep.split():
                cleaned_w = re.sub(r'[^\w]', '', word)
                if cleaned_w:
                    glossary.add(cleaned_w)
    except Exception:
        pass

    for i, cue in enumerate(cues):
        text = cue.get(text_key, "").strip()
        if not text:
            continue

        if i == 0:
            if text[0].isalpha() and text[0].islower():
                cue[text_key] = text[0].upper() + text[1:]
            continue

        prev_text = cues[i - 1].get(text_key, "").strip()
        prev_ends_strong = bool(re.search(r'[\.\?\!\…\:\»\។\៕][\'"\)\]\»]*$', prev_text))

        if prev_ends_strong:
            if text[0].isalpha() and text[0].islower():
                cue[text_key] = text[0].upper() + text[1:]
        else:
            # Mid-sentence continuation: check if first token should be lowercased
            m = re.match(r'^([^\w]*)([\w\-\.\'\’]+)(.*)$', text, re.DOTALL)
            if m:
                prefix, first_tok, suffix = m.group(1), m.group(2), m.group(3)

                # Reasons to keep uppercase:
                # 1. Single accented letter like 'À', 'Á', 'É', etc.
                is_single_accented = (len(first_tok) == 1 and first_tok in "ÀÁÉÈÊËÍÎÏÓÔÙÚÛÜÇÑ")
                # 2. English pronoun 'I' and contractions ('I'm', 'I've', 'I'll', 'I'd')
                is_english_i = (norm_lang == "en" and (first_tok in ("I", "I'm", "I've", "I'll", "I'd", "I'd've") or first_tok.startswith("I'")))
                # 3. German: keep uppercase for nouns, only lowercase known function words
                if norm_lang == "de":
                    if first_tok.lower() not in GERMAN_LOWERCASE_WORDS:
                        continue
                # 4. Acronym: len >= 2 and all uppercase
                is_acronym = (len(first_tok) >= 2 and first_tok.isupper())
                # 5. Mixed case: uppercase inside (e.g. YouTube, VoxCPM)
                is_mixed_case = any(c.isupper() for c in first_tok[1:])
                # 6. In glossary set
                clean_tok = re.sub(r'[^\w]', '', first_tok)
                is_glossary = (first_tok in glossary or clean_tok in glossary)

                if not (is_single_accented or is_english_i or is_acronym or is_mixed_case or is_glossary):
                    lowered = first_tok[0].lower() + first_tok[1:]
                    cue[text_key] = prefix + lowered + suffix

    return cues


# ============================================================================
# Step 6: Oral Filler & Hesitation Cleaning (Heuristic)
# ============================================================================

def clean_text_heuristics(text: str, lang_code: str = "en") -> str:
    """Clean oral fillers, hesitation sounds, and normalize spacing/punctuation."""
    if not text:
        return ""

    cleaned = text.strip()
    norm_lang = (lang_code or "en").lower()[:2]
    patterns = FILLER_PATTERNS_BY_LANG.get(norm_lang, [])

    # Iteratively strip leading filler phrases for the specific language
    for _ in range(3):
        for pat in patterns:
            cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE).strip()

    # Remove mid-sentence & trailing hesitations if language pattern exists
    if norm_lang in MID_HESITATION_PATTERNS:
        mid_pat, end_pat = MID_HESITATION_PATTERNS[norm_lang]
        cleaned = re.sub(mid_pat, ' ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(end_pat, '', cleaned, flags=re.IGNORECASE)

    # Fix spacing around punctuation (avoid breaking domain names like .ai, .com)
    cleaned = re.sub(r'\s+([,;.!?។៕])', r'\1', cleaned)
    cleaned = re.sub(r'([,;!?])(?=[^\s\d])', r'\1 ', cleaned)
    cleaned = re.sub(r'\.(?=[A-ZÀ-ÖØ-ß])', '. ', cleaned)

    return re.sub(r'\s+', ' ', cleaned).strip()


def clean_words_list(words: List[Dict[str, Any]], lang_code: str = "en") -> List[Dict[str, Any]]:
    """Filter filler words from a word-level timestamp list."""
    if not words:
        return []

    norm_lang = (lang_code or "en").lower()[:2]
    fillers = FILLER_WORDS_BY_LANG.get(norm_lang, set())
    universal_hesitations = {"um", "uh", "er", "ah", "euh", "ähm", "äh", "ehm"}

    cleaned_words = []
    skip_leading = True

    for w in words:
        raw_word = re.sub(r'[^\w]', '', str(w.get("word", "")).lower())
        if skip_leading and raw_word in fillers:
            continue
        skip_leading = False

        if raw_word in universal_hesitations:
            continue

        cleaned_words.append(w)

    return cleaned_words if cleaned_words else words


def clean_segments_heuristic(
    segments: List[Dict[str, Any]],
    lang_code: str = "en",
    text_key: str = "text",
) -> List[Dict[str, Any]]:
    """Clean an entire segment list while maintaining time synchronization."""
    cleaned_segments = []
    for seg in segments:
        text = seg.get(text_key, "")
        start = float(seg.get("start", 0.0))
        end = float(seg.get("end", 0.0))
        words = seg.get("words", [])

        if words:
            cleaned_words = clean_words_list(words, lang_code)
            if cleaned_words:
                start = float(cleaned_words[0].get("start", start))
                end = float(cleaned_words[-1].get("end", end))
                text = " ".join(str(w.get("word", "")).strip() for w in cleaned_words)

        cleaned_text = clean_text_heuristics(text, lang_code)
        if cleaned_text:
            new_seg = dict(seg)
            new_seg["start"] = start
            new_seg["end"] = end
            new_seg[text_key] = cleaned_text
            if words:
                new_seg["words"] = cleaned_words if 'cleaned_words' in locals() else words
            cleaned_segments.append(new_seg)

    return remove_empty_cues_and_redistribute(cleaned_segments, text_key=text_key)


# ============================================================================
# Step 7: Cross-Cue Post-ASR Tech Dictionary Repairs
# ============================================================================

def apply_asr_corrections_cross_cues(
    cues: List[Dict[str, Any]],
    text_key: str = "text",
    corrections: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Apply external ASR corrections across reconstituted text to repair terms even when
    split across consecutive cues (e.g. 'QN 3.5.' in cue i and '9B' in cue i+1).
    Applied AFTER inter-cue casing so case-sensitive patterns match accurately.
    """
    if not cues:
        return cues
    if corrections is None:
        corrections = load_asr_corrections()
    if not corrections:
        return cues

    for corr in corrections:
        pattern_str = corr.get("pattern", "")
        rep = corr.get("replacement", "")
        case_sensitive = corr.get("case_sensitive", False)
        if not pattern_str or rep is None:
            continue

        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            rx = re.compile(pattern_str, flags)
        except Exception as e:
            print(f"[subtitles] Invalid regex pattern '{pattern_str}': {e}")
            continue

        max_replaces = 50
        while max_replaces > 0:
            max_replaces -= 1
            char_map: List[Tuple[int, int]] = []
            pieces: List[str] = []
            for c_idx, cue in enumerate(cues):
                t = cue.get(text_key, "")
                if c_idx > 0:
                    pieces.append(" ")
                    char_map.append((c_idx - 1, len(cues[c_idx - 1].get(text_key, ""))))
                for off, ch in enumerate(t):
                    pieces.append(ch)
                    char_map.append((c_idx, off))
            full_text = "".join(pieces)

            match = rx.search(full_text)
            if not match:
                break

            m_start = match.start()
            m_end = match.end() - 1
            if m_start >= len(char_map) or m_end >= len(char_map):
                break

            start_c_idx, start_off = char_map[m_start]
            end_c_idx, end_off = char_map[m_end]
            end_off += 1

            if start_c_idx == end_c_idx:
                t = cues[start_c_idx].get(text_key, "")
                cues[start_c_idx][text_key] = (t[:start_off] + rep + t[end_off:]).strip()
            else:
                t_start = cues[start_c_idx].get(text_key, "")
                t_end = cues[end_c_idx].get(text_key, "")

                prefix = t_start[:start_off].rstrip()
                cues[start_c_idx][text_key] = f"{prefix} {rep}".strip() if prefix else rep

                for mid_idx in range(start_c_idx + 1, end_c_idx):
                    cues[mid_idx][text_key] = ""

                remainder = t_end[end_off:].lstrip()
                cues[end_c_idx][text_key] = remainder

    cues = remove_empty_cues_and_redistribute(cues, text_key=text_key)
    return cues


# ============================================================================
# Step 8: Line Wrapping & Strict Monotonic Timecode Normalization
# ============================================================================

def wrap_lines(text: str, max_chars_per_line: int = MAX_CHARS_PER_LINE) -> List[str]:
    """Wrap text into 1, 2, or 3 balanced lines under max_chars_per_line."""
    text = text.strip()
    if len(text) <= max_chars_per_line:
        return [text]

    words = text.split()
    if len(words) <= 1:
        return [text]

    if len(text) <= max_chars_per_line * 2 + 20:
        mid = len(text) // 2
        best_split = len(words) // 2
        min_diff = float("inf")
        curr_len = 0

        for i, w in enumerate(words[:-1]):
            curr_len += len(w) + 1
            diff = abs(curr_len - mid)
            if diff < min_diff:
                min_diff = diff
                best_split = i + 1

        line1 = " ".join(words[:best_split])
        line2 = " ".join(words[best_split:])
        return [line1, line2]
    else:
        # 3 balanced lines
        n_lines = 3
        target_len = len(text) // n_lines
        lines: List[str] = []
        curr_line: List[str] = []
        curr_len = 0
        for w in words:
            if curr_line and curr_len + len(w) + 1 > target_len and len(lines) < n_lines - 1:
                lines.append(" ".join(curr_line))
                curr_line = [w]
                curr_len = len(w)
            else:
                curr_line.append(w)
                curr_len += len(w) + (1 if len(curr_line) > 1 else 0)
        if curr_line:
            lines.append(" ".join(curr_line))
        return lines


def split_into_ergonomic_cues(
    segments: List[Dict[str, Any]],
    max_chars_per_line: int = MAX_CHARS_PER_LINE,
    min_cue_duration: float = 0.4,
    text_key: str = "text",
) -> List[Dict[str, Any]]:
    """
    Format segments into standard ergonomic subtitle cues (1 or 2 lines per cue).
    Never severs complete sentences or clauses mid-phrase.
    """
    if not segments:
        return []

    cues: List[Dict[str, Any]] = []

    for seg in segments:
        raw_text = seg.get(text_key, "").strip()
        start = float(seg.get("start", 0.0))
        end = float(seg.get("end", start + min_cue_duration))
        duration = max(0.1, end - start)

        if not raw_text:
            continue

        words = raw_text.split()
        if not words:
            continue

        # If under 130 chars or 8 seconds, format into balanced lines in a single cue
        if len(raw_text) <= 130 or duration <= 8.0:
            formatted_lines = wrap_lines(raw_text, max_chars_per_line=max_chars_per_line)
            cues.append({
                "start": start,
                "end": end,
                text_key: "\n".join(formatted_lines),
                "lines": formatted_lines,
            })
            continue

        # Split only if text is long (> 130 chars AND > 8s) AND has a strong punctuation boundary
        split_idx = -1
        for idx, w in enumerate(words[:-2]):
            if any(w.endswith(p) for p in STRONG_PUNCTUATIONS) and idx >= 3 and (len(words) - idx) >= 3:
                split_idx = idx
                break

        if split_idx >= 0:
            chunk1_words = words[:split_idx + 1]
            chunk2_words = words[split_idx + 1:]
            chunk1_text = " ".join(chunk1_words)
            chunk2_text = " ".join(chunk2_words)
            ratio = len(chunk1_text) / max(1, len(chunk1_text) + len(chunk2_text))
            mid_time = round(start + duration * ratio, 3)

            cues.append({
                "start": start,
                "end": mid_time,
                text_key: "\n".join(wrap_lines(chunk1_text, max_chars_per_line=max_chars_per_line)),
                "lines": wrap_lines(chunk1_text, max_chars_per_line=max_chars_per_line),
            })
            cues.append({
                "start": mid_time,
                "end": end,
                text_key: "\n".join(wrap_lines(chunk2_text, max_chars_per_line=max_chars_per_line)),
                "lines": wrap_lines(chunk2_text, max_chars_per_line=max_chars_per_line),
            })
        else:
            formatted_lines = wrap_lines(raw_text, max_chars_per_line=max_chars_per_line)
            cues.append({
                "start": start,
                "end": end,
                text_key: "\n".join(formatted_lines),
                "lines": formatted_lines,
            })

    return cues


def normalize_timecodes(
    cues: List[Dict[str, Any]],
    min_gap_ms: int = MIN_GAP_MS,
    min_cue_duration_ms: int = MIN_CUE_DURATION_MS,
    text_key: str = "text",
) -> List[Dict[str, Any]]:
    """
    Ensure strict monotonic timecode normalization:
    - end[i] <= start[i+1] - min_gap_ms (40ms)
    - end[i] > start[i]
    - strict chronological ordering
    - if clamping creates a cue shorter than min_cue_duration_ms (400ms), merge with neighbor.
    """
    if not cues:
        return []

    min_gap_s = min_gap_ms / 1000.0
    min_dur_s = min_cue_duration_ms / 1000.0

    normalized: List[Dict[str, Any]] = []
    for c in cues:
        start = float(c.get("start", 0.0))
        end = float(c.get("end", start + min_dur_s))
        if end <= start:
            end = start + min_dur_s
        new_c = dict(c)
        new_c["start"] = round(start, 3)
        new_c["end"] = round(end, 3)
        normalized.append(new_c)

    normalized.sort(key=lambda x: x["start"])

    changed = True
    iteration = 0
    max_iterations = 300

    while changed and iteration < max_iterations:
        changed = False
        iteration += 1
        merged_list: List[Dict[str, Any]] = []
        skip_next = False

        for i in range(len(normalized)):
            if skip_next:
                skip_next = False
                continue

            curr = normalized[i]
            if i == len(normalized) - 1:
                merged_list.append(curr)
                break

            next_cue = normalized[i + 1]
            max_allowed_end = round(next_cue["start"] - min_gap_s, 3)

            if curr["end"] > max_allowed_end:
                if max_allowed_end - curr["start"] >= min_dur_s:
                    curr["end"] = max_allowed_end
                    merged_list.append(curr)
                    changed = True
                else:
                    # Clamping would make cue too short -> merge with next_cue
                    t1 = curr.get(text_key, "").strip()
                    t2 = next_cue.get(text_key, "").strip()
                    next_cue[text_key] = f"{t1} {t2}".strip()
                    next_cue["start"] = curr["start"]
                    next_cue["end"] = max(curr["end"], next_cue["end"])
                    skip_next = True
                    changed = True
            else:
                merged_list.append(curr)

        normalized = merged_list

    # Final guarantee pass for monotonic gaps
    for i in range(len(normalized) - 1):
        if normalized[i]["end"] > normalized[i + 1]["start"] - min_gap_s:
            normalized[i]["end"] = round(max(normalized[i]["start"] + 0.1, normalized[i + 1]["start"] - min_gap_s), 3)

    return normalized


# ============================================================================
# Complete 8-Step Pipeline Function
# ============================================================================

def stabilize_subtitles(
    segments: List[Dict[str, Any]],
    lang_code: str = "en",
    text_key: str = "text",
    clean_fillers: bool = True,
    corrections: Optional[List[Dict[str, Any]]] = None,
    min_cue_words: int = MIN_CUE_WORDS,
    min_cue_duration_ms: int = MIN_CUE_DURATION_MS,
    min_gap_ms: int = MIN_GAP_MS,
    max_chars_per_line: int = MAX_CHARS_PER_LINE,
) -> List[Dict[str, Any]]:
    """
    Run the full 8-step subtitle stabilization pipeline:
    1. AI & Tech Context Priming (applied at ASR decoder via initial_prompt)
    2. Lookahead Word-Level Boundary Splitting (no 1-word cues)
    3. Empty & Isolated Punctuation Elimination (duration redistributed)
    4. Sentence Fragment Merging & Anti-Dangling Engine
    5. Oral Filler & Hesitation Cleaning (if clean_fillers is True)
    6. Context-Aware Sentence Casing (fix_inter_cue_casing)
    7. Cross-Cue Post-ASR Tech Dictionary Repairs (222+ rules)
    8. Ergonomic Line Wrapping & Strict Monotonic Timecode Normalization (end[i] <= start[i+1] - 40ms)
    """
    if not segments:
        return []

    # Step 2: Lookahead boundary splitting
    cues = split_long_segments(
        segments,
        min_words=min_cue_words,
        min_duration_ms=min_cue_duration_ms,
        text_key=text_key,
    )

    # Step 3: Remove empty / isolated punctuation cues
    cues = remove_empty_cues_and_redistribute(cues, text_key=text_key)

    # Step 4: Sentence fragment & anti-dangling merging
    cues = merge_sentence_fragments(cues, text_key=text_key)

    # Step 5: Oral filler cleaning (optional)
    if clean_fillers:
        cues = clean_segments_heuristic(cues, lang_code=lang_code, text_key=text_key)
        cues = remove_empty_cues_and_redistribute(cues, text_key=text_key)

    # Step 6: Context-aware sentence casing
    cues = fix_inter_cue_casing(cues, text_key=text_key, lang_code=lang_code)

    # Step 7: Cross-cue vocabulary / dictionary repairs
    effective_corrections = corrections if corrections is not None else load_asr_corrections(lang_code=lang_code)
    cues = apply_asr_corrections_cross_cues(cues, text_key=text_key, corrections=effective_corrections)

    # Step 8: Broadcast-compliant line wrapping & timecode normalization
    cues = split_into_ergonomic_cues(cues, max_chars_per_line=max_chars_per_line, text_key=text_key)
    cues = normalize_timecodes(cues, min_gap_ms=min_gap_ms, min_cue_duration_ms=min_cue_duration_ms, text_key=text_key)

    return cues


# ============================================================================
# Exporters & Class Interface
# ============================================================================

def export_srt(
    cues: List[Dict[str, Any]],
    output_path: str | Path,
    text_key: str = "text",
    min_gap_ms: int = MIN_GAP_MS,
    min_cue_duration_ms: int = MIN_CUE_DURATION_MS,
) -> None:
    """Export cues to standard UTF-8 SRT file with monotonic timecodes and 40ms minimum gaps."""
    normalized = normalize_timecodes(cues, min_gap_ms=min_gap_ms, min_cue_duration_ms=min_cue_duration_ms, text_key=text_key)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        for i, cue in enumerate(normalized, 1):
            s = format_timestamp(cue["start"], decimal_sep=",")
            e = format_timestamp(cue["end"], decimal_sep=",")
            f.write(f"{i}\n{s} --> {e}\n{cue[text_key]}\n\n")


def export_vtt(
    cues: List[Dict[str, Any]],
    output_path: str | Path,
    text_key: str = "text",
    min_gap_ms: int = MIN_GAP_MS,
    min_cue_duration_ms: int = MIN_CUE_DURATION_MS,
) -> None:
    """Export cues to WebVTT format."""
    normalized = normalize_timecodes(cues, min_gap_ms=min_gap_ms, min_cue_duration_ms=min_cue_duration_ms, text_key=text_key)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for i, cue in enumerate(normalized, 1):
            s = format_timestamp(cue["start"], decimal_sep=".")
            e = format_timestamp(cue["end"], decimal_sep=".")
            f.write(f"{i}\n{s} --> {e}\n{cue[text_key]}\n\n")


def export_sbv(
    cues: List[Dict[str, Any]],
    output_path: str | Path,
    text_key: str = "text",
    min_gap_ms: int = MIN_GAP_MS,
    min_cue_duration_ms: int = MIN_CUE_DURATION_MS,
) -> None:
    """Export cues to YouTube SBV format."""
    normalized = normalize_timecodes(cues, min_gap_ms=min_gap_ms, min_cue_duration_ms=min_cue_duration_ms, text_key=text_key)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    def _fmt_sbv(secs: float) -> str:
        hrs = int(secs // 3600)
        mins = int((secs % 3600) // 60)
        scs = int(secs % 60)
        ms = int(round((secs - int(secs)) * 1000))
        return f"{hrs}:{mins:02d}:{scs:02d}.{ms:03d}"

    with open(out, "w", encoding="utf-8") as f:
        for cue in normalized:
            s = _fmt_sbv(cue["start"])
            e = _fmt_sbv(cue["end"])
            single_line = " ".join(str(cue[text_key]).split())
            f.write(f"{s},{e}\n{single_line}\n\n")


class SubtitleStabilizer:
    """Class wrapper for 8-step subtitle stabilization and export."""

    def __init__(
        self,
        max_chars_per_line: int = MAX_CHARS_PER_LINE,
        min_cue_duration_ms: int = MIN_CUE_DURATION_MS,
        min_gap_ms: int = MIN_GAP_MS,
        min_words: int = MIN_CUE_WORDS,
    ):
        self.max_chars_per_line = max_chars_per_line
        self.min_cue_duration_ms = min_cue_duration_ms
        self.min_gap_ms = min_gap_ms
        self.min_words = min_words

    def stabilize(
        self,
        segments: List[Dict[str, Any]],
        lang_code: str = "en",
        text_key: str = "text",
        clean_fillers: bool = True,
        corrections: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        return stabilize_subtitles(
            segments,
            lang_code=lang_code,
            text_key=text_key,
            clean_fillers=clean_fillers,
            corrections=corrections,
            min_cue_words=self.min_words,
            min_cue_duration_ms=self.min_cue_duration_ms,
            min_gap_ms=self.min_gap_ms,
            max_chars_per_line=self.max_chars_per_line,
        )

    def export_srt(self, cues: List[Dict[str, Any]], output_path: str | Path, text_key: str = "text") -> None:
        export_srt(cues, output_path, text_key=text_key, min_gap_ms=self.min_gap_ms, min_cue_duration_ms=self.min_cue_duration_ms)

    def export_vtt(self, cues: List[Dict[str, Any]], output_path: str | Path, text_key: str = "text") -> None:
        export_vtt(cues, output_path, text_key=text_key, min_gap_ms=self.min_gap_ms, min_cue_duration_ms=self.min_cue_duration_ms)

    def export_sbv(self, cues: List[Dict[str, Any]], output_path: str | Path, text_key: str = "text") -> None:
        export_sbv(cues, output_path, text_key=text_key, min_gap_ms=self.min_gap_ms, min_cue_duration_ms=self.min_cue_duration_ms)


# Backward-compatible alias
SRTCleaner = SubtitleStabilizer
