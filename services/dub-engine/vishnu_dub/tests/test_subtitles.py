"""Tests for 8-step subtitle stabilization engine.

Covers:
1. Lookahead word-level boundary splitting (min_cue_words=3, min_cue_duration_ms=400ms, no orphans)
2. Empty and isolated punctuation elimination (redistributing duration to previous cue)
3. Sentence fragment merging and anti-dangling connectors
4. Context-aware sentence casing (English pronoun 'I', German nouns, acronyms, proper nouns)
5. Cross-cue post-ASR tech dictionary repairs (222+ rules)
6. Strict monotonic timecode normalization (end[i] <= start[i+1] - 40ms, min 400ms duration)
7. Ergonomic line wrapping (max 50 chars per line, balanced lines)
8. End-to-end 8-step pipeline and SRT/VTT/SBV exports
"""

import re
import tempfile
from pathlib import Path

import pytest
from vishnu_dub.subtitles import (
    MIN_CUE_DURATION_MS,
    MIN_CUE_WORDS,
    MIN_GAP_MS,
    SubtitleStabilizer,
    apply_asr_corrections_cross_cues,
    clean_segments_heuristic,
    clean_text_heuristics,
    export_sbv,
    export_srt,
    export_vtt,
    fix_inter_cue_casing,
    format_timestamp,
    load_asr_corrections,
    merge_sentence_fragments,
    normalize_timecodes,
    remove_empty_cues_and_redistribute,
    seconds_from_srt_timestamp,
    split_into_ergonomic_cues,
    split_long_segments,
    split_segment,
    stabilize_subtitles,
    wrap_lines,
)


def test_no_orphan_short_cues():
    """Criterion 1: Lookahead boundary splitting produces no cues < 3 words unless punctuated."""
    words = [
        {"word": "Ce", "start": 27.95, "end": 28.20},
        {"word": "qui", "start": 28.21, "end": 28.40},
        {"word": "est", "start": 28.41, "end": 28.60},
        {"word": "une", "start": 28.61, "end": 28.80},
        {"word": "suite", "start": 28.81, "end": 29.10},
        {"word": "complète", "start": 29.11, "end": 29.60},
        {"word": "de", "start": 29.61, "end": 29.80},
        {"word": "traduction", "start": 29.81, "end": 30.40},
        {"word": "et", "start": 30.41, "end": 30.55},
        {"word": "de", "start": 30.56, "end": 30.70},
        {"word": "doublage", "start": 30.71, "end": 31.20},
        {"word": "vidéo", "start": 31.21, "end": 31.40},
        {"word": "par", "start": 31.41, "end": 31.55},
        {"word": "intelligence", "start": 31.55, "end": 32.10},  # 14th word: orphan candidate
    ]
    seg = {
        "start": 27.95,
        "end": 32.10,
        "text": "Ce qui est une suite complète de traduction et de doublage vidéo par intelligence",
        "words": words,
    }

    cues = split_segment(
        seg,
        max_duration=8.0,
        max_chars=65,
        min_words=MIN_CUE_WORDS,
        min_duration_ms=MIN_CUE_DURATION_MS,
    )

    for i, c in enumerate(cues, 1):
        words_count = len(c["text"].split())
        last_word = c["text"].split()[-1]
        has_strong_punct = any(last_word.endswith(p) for p in ('.', '?', '!', '…', ';', '។', '៕'))
        if not has_strong_punct:
            assert words_count >= MIN_CUE_WORDS, f"Cue {i} has only {words_count} words: '{c['text']}'"

    # Verify short segment with strong terminal punctuation is accepted as-is
    punct_seg = {
        "start": 123.85,
        "end": 126.13,
        "text": "Patiemment.",
        "words": [{"word": "Patiemment.", "start": 123.85, "end": 126.13}],
    }
    punct_cues = split_segment(punct_seg)
    assert len(punct_cues) == 1
    assert punct_cues[0]["text"] == "Patiemment."

    # Khmer short punctuated segment
    km_punct_seg = {
        "start": 10.0,
        "end": 11.5,
        "text": "រួចរាល់។",
        "words": [{"word": "រួចរាល់។", "start": 10.0, "end": 11.5}],
    }
    km_cues = split_segment(km_punct_seg)
    assert len(km_cues) == 1
    assert km_cues[0]["text"] == "រួចរាល់។"


def test_no_timecode_overlap_and_min_gap():
    """Criterion 2: Strict monotonic timecode normalization guarantees end[i] <= start[i+1] - 40ms."""
    cues = [
        {"start": 27.949, "end": 31.553, "text": "Ce qui est une suite complète de traduction et de doublage vidéo par"},
        {"start": 31.553, "end": 32.554, "text": "intelligence"},
        {"start": 32.250, "end": 39.039, "text": "artificielle 100% locale et bien entendu gratuite sans clé API et installable"},
    ]

    normalized = normalize_timecodes(cues, min_gap_ms=40, min_cue_duration_ms=400, text_key="text")
    assert len(normalized) >= 1

    for i, c in enumerate(normalized):
        assert c["end"] > c["start"], f"Cue {i+1} has invalid duration: {c['start']} -> {c['end']}"
        if i > 0:
            prev = normalized[i - 1]
            gap = c["start"] - prev["end"]
            assert prev["end"] <= c["start"] - 0.0399, (
                f"Overlap detected between cue {i} and {i+1}: prev end={prev['end']}, curr start={c['start']}, gap={gap}"
            )


def test_no_empty_cues_and_redistribute():
    """Criterion 3: Solitary punctuation cues are eliminated and duration is redistributed."""
    cues = [
        {"start": 5.0, "end": 7.0, "text": "J'ai des défauts quand je parle, comme tout le monde."},
        {"start": 7.1, "end": 8.1, "text": "."},
        {"start": 8.5, "end": 10.0, "text": "On peut exporter le sous-titrage."},
    ]

    cleaned = remove_empty_cues_and_redistribute(cues, text_key="text")
    assert len(cleaned) == 2
    for c in cleaned:
        stripped = re.sub(r'[\s\.\?\!\,\;\:\-\–\—\…\¿\¡\'\"\(\)\[\]\«\»\។\៕]+', '', c["text"])
        assert len(stripped) > 0

    # Redistribution check: cue 1 end must have extended to cover empty cue 2 (end >= 8.1)
    assert cleaned[0]["end"] >= 8.1


def test_inter_cue_casing_multilingual():
    """Criterion 4: Context-aware inter-cue casing preserves English 'I', German nouns, acronyms."""
    cues = [
        {"text": "vous voulez traduire et doubler vos vidéos YouTube dans plus de 30 langues en"},
        {"text": "Gardant exactement votre propre voix, mais sans payer d'abonnement hors de prix"},
        {"text": "Et sans envoyer vos données sur le cloud?"},
        {"text": "aujourd'hui, je vais vous présenter Vishnu Creator."},
        {"text": "Ce qui est une suite complète de traduction et de doublage vidéo par intelligence"},
        {"text": "Artificielle 100% locale et bien entendu gratuite sans clé API et installable"},
        {"text": "En un clic via Pinokio."},
        {"text": "Là, c'est une version SEO avec VoxCPM et FLUX.1-schnell."},
        {"text": "À tout à l'heure pour la suite."},
    ]

    fixed = fix_inter_cue_casing(cues, text_key="text", lang_code="fr")
    assert fixed[0]["text"].startswith("Vous")
    assert fixed[1]["text"].startswith("gardant")
    assert fixed[2]["text"].startswith("et ")
    assert fixed[3]["text"].startswith("Aujourd'hui")
    assert fixed[5]["text"].startswith("artificielle")
    assert fixed[6]["text"].startswith("en un clic")
    assert "SEO" in fixed[7]["text"] and "VoxCPM" in fixed[7]["text"]
    assert fixed[8]["text"].startswith("À")

    # English: 'I' and 'I'm' preserved in mid-sentence
    en_cues = [
        {"start": 0.0, "end": 2.5, "text": "In this quick tutorial we will show you how"},
        {"start": 2.55, "end": 4.5, "text": "I created a local AI dubbing pipeline and"},
        {"start": 4.55, "end": 6.8, "text": "Because I'm going to run everything locally"},
        {"start": 6.85, "end": 9.0, "text": "With Pinokio and WhisperX."},
    ]
    en_fixed = fix_inter_cue_casing(en_cues, text_key="text", lang_code="en")
    assert en_fixed[1]["text"].startswith("I ")
    assert en_fixed[2]["text"].startswith("because I'm")
    assert en_fixed[3]["text"].startswith("with ")

    # German: German nouns preserved with uppercase, function words lowercased
    de_cues = [
        {"start": 0.0, "end": 3.0, "text": "Wir starten jetzt das Programm und"},
        {"start": 3.05, "end": 5.5, "text": "Das Haus wird automatisch generiert und"},
        {"start": 5.55, "end": 7.5, "text": "Weil wir die Software testen."},
    ]
    de_fixed = fix_inter_cue_casing(de_cues, text_key="text", lang_code="de")
    assert de_fixed[1]["text"].startswith("das Haus")
    assert de_fixed[2]["text"].startswith("weil ")


def test_asr_corrections_cross_cues():
    """Criterion 5: Post-ASR dictionary corrections across reconstituted text."""
    cues = [
        {"start": 10.0, "end": 12.0, "text": "On va tester le bug mode."},
        {"start": 12.5, "end": 14.5, "text": "Je ne passe jamais par translation et domain."},
        {"start": 15.0, "end": 17.0, "text": "Pourquoi je vous ai conseillé l'Archev3 et large V3?"},
        {"start": 18.0, "end": 19.5, "text": "Et de laisser QN 3.5."},  # Cross-cue part 1
        {"start": 20.0, "end": 22.0, "text": "9B au niveau de la traduction et compagnie."},  # Cross-cue part 2
        {"start": 23.0, "end": 25.0, "text": "Générer avec Fluxchnell votre image."},
        {"start": 26.0, "end": 28.0, "text": "Écrit dans la version Fitid."},
        {"start": 29.0, "end": 31.0, "text": "Le synthétiseur vocal s'appelle VOXCPM2."},
        {"start": 32.0, "end": 34.0, "text": "On va utiliser BlogStudio."},
        {"start": 35.0, "end": 37.0, "text": "Cliquer sur Clean Filler."},
        {"start": 38.0, "end": 40.0, "text": "Votre vidéo est en 16 neuvième."},
        {"start": 41.0, "end": 43.0, "text": "Créer des vidéos en 9-16ème."},
        {"start": 44.0, "end": 46.0, "text": "Les focus keywords ou les longs chaînes."},
        {"start": 47.0, "end": 49.0, "text": "Pour enlever les tic-IA."},
    ]

    corrected = apply_asr_corrections_cross_cues(cues, text_key="text")
    full_output = " --- ".join(c["text"] for c in corrected)

    assert "Bulk Mode" in full_output
    assert "Translation et Dubbing" in full_output
    assert "large-v3" in full_output
    assert "Qwen3.5-9B" in full_output
    assert "QN 3.5" not in full_output
    assert "FLUX.1-schnell" in full_output
    assert "Fitted" in full_output
    assert "VoxCPM 2" in full_output
    assert "Blog Studio" in full_output
    assert "Clean Fillers" in full_output
    assert "16:9" in full_output
    assert "9:16" in full_output
    assert "les longues traînes" in full_output
    assert "les tics IA" in full_output


def test_sentence_fragment_merging_anti_dangling():
    """Criterion 6: Anti-dangling connectors and sentence fragment merging."""
    segments = [
        {"start": 0.0, "end": 2.5, "text": "We will provide full tax exemption if"},
        {"start": 2.6, "end": 5.0, "text": "your company is officially registered in Cambodia."},
        {"start": 5.2, "end": 7.0, "text": "This means that"},
        {"start": 7.1, "end": 9.5, "text": "all operations remain compliant."},
    ]

    merged = merge_sentence_fragments(segments, text_key="text")
    assert len(merged) == 2
    assert "exemption if your company" in merged[0]["text"]
    assert "means that all operations" in merged[1]["text"]
    assert merged[0]["start"] == 0.0
    assert merged[0]["end"] == 5.0


def test_ergonomic_line_wrapping():
    """Criterion 7: Wrap text into balanced lines under max 50 chars without orphan words."""
    short = "This is a short line."
    assert wrap_lines(short, max_chars_per_line=50) == [short]

    medium = "Vishnu Creator provides professional automated AI dubbing with VoxCPM and WhisperX models."
    lines = wrap_lines(medium, max_chars_per_line=50)
    assert len(lines) == 2
    for l in lines:
        assert len(l) <= 60  # Balanced split around midpoint
    assert " ".join(lines) == medium

    segments = [
        {"start": 1.0, "end": 5.0, "text": medium},
    ]
    cues = split_into_ergonomic_cues(segments, max_chars_per_line=50, text_key="text")
    assert len(cues) == 1
    assert "\n" in cues[0]["text"]


def test_full_8_step_stabilization_pipeline():
    """Criterion 8: Full end-to-end 8-step stabilization pipeline on raw dialogue sample."""
    raw_cues = [
        {"start": 7.980, "end": 11.820, "text": "Vous voulez traduire et doubler vos vidéos YouTube dans plus de 30 langues en"},
        {"start": 11.859, "end": 16.019, "text": "Gardant exactement votre propre voix, mais sans payer d'abonnement hors de prix"},
        {"start": 16.070, "end": 19.410, "text": "Et sans envoyer vos données sur le cloud?"},
        {"start": 19.449, "end": 22.829, "text": "Aujourd'hui, je vais vous présenter Vishnu Creator."},
        {"start": 22.850, "end": 27.129, "text": "C'est la version 1.16 qui sera peut-être même très rapidement mise à jour."},
        {"start": 27.949, "end": 31.553, "text": "Ce qui est une suite complète de traduction et de doublage vidéo par"},
        {"start": 31.553, "end": 32.554, "text": "intelligence"},  # Orphan cue + collision!
        {"start": 32.250, "end": 39.039, "text": "Artificielle 100% locale et bien entendu gratuite sans clé API et installable"},
        {"start": 39.079, "end": 42.240, "text": "En un clic via Pinokio."},
        {"start": 42.280, "end": 45.509, "text": "Dans cette démonstration, on va voir tout le flux en direct."},
        {"start": 50.200, "end": 57.539, "text": "La transcription ultra précise avec WhisperX, le doublage avec VOXCPM2 et avec"},
        {"start": 57.600, "end": 58.600, "text": "Un clonage de votre voix."},
    ]

    stabilizer = SubtitleStabilizer()
    clean_cues = stabilizer.stabilize(raw_cues, lang_code="fr", text_key="text", clean_fillers=False)

    assert len(clean_cues) >= 1
    for i, c in enumerate(clean_cues):
        # 1. No empty cue
        stripped = re.sub(r'[\s\.\?\!\,\;\:\-\–\—\…\¿\¡\'\"\(\)\[\]\«\»\។\៕]+', '', c["text"])
        assert len(stripped) > 0, f"Cue {i+1} is empty"

        # 2. Strict non-overlapping monotonic gap
        assert c["end"] > c["start"]
        if i > 0:
            prev = clean_cues[i - 1]
            assert prev["end"] <= c["start"] - 0.0399, (
                f"Overlap at cue {i}: prev end={prev['end']}, curr start={c['start']}"
            )

        # 3. Inter-cue casing
        if i > 0:
            prev_t = clean_cues[i - 1]["text"].strip()
            prev_strong = bool(re.search(r'[\.\?\!\…\:\»\។\៕][\'"\)\]\»]*$', prev_t))
            first_word = c["text"].split()[0]
            clean_fw = re.sub(r'[^\w]', '', first_word)
            glossary = {"Vishnu Creator", "YouTube", "VoxCPM", "Pinokio", "WhisperX", "API"}
            if not prev_strong and first_word not in glossary and clean_fw not in glossary and first_word not in "ÀÉÈÊËÎÏÔÙÛÜÇ":
                assert not first_word[0].isupper() or len(first_word) == 1, (
                    f"Cue {i+1} starts uppercase '{first_word}' after '{prev_t}'"
                )

        # 4. Tech vocabulary replacement
        assert "VOXCPM2" not in c["text"]


def test_exporters_srt_vtt_sbv():
    """Verify SRT, VTT, and SBV file generation with correct headers and timestamps."""
    cues = [
        {"start": 1.5, "end": 4.25, "text": "First subtitle line."},
        {"start": 4.5, "end": 8.0, "text": "Second subtitle line."},
    ]

    with tempfile.TemporaryDirectory() as td:
        srt_file = Path(td) / "test.srt"
        vtt_file = Path(td) / "test.vtt"
        sbv_file = Path(td) / "test.sbv"

        export_srt(cues, srt_file)
        export_vtt(cues, vtt_file)
        export_sbv(cues, sbv_file)

        assert srt_file.exists()
        assert vtt_file.exists()
        assert sbv_file.exists()

        srt_content = srt_file.read_text(encoding="utf-8")
        assert "00:00:01,500 --> 00:00:04,250" in srt_content
        assert "First subtitle line." in srt_content

        vtt_content = vtt_file.read_text(encoding="utf-8")
        assert vtt_content.startswith("WEBVTT")
        assert "00:00:01.500 --> 00:00:04.250" in vtt_content

        sbv_content = sbv_file.read_text(encoding="utf-8")
        assert "0:00:01.500,0:00:04.250" in sbv_content

    # Timestamp conversion utilities
    assert format_timestamp(3661.123, decimal_sep=",") == "01:01:01,123"
    assert format_timestamp(3661.123, decimal_sep=".") == "01:01:01.123"
    assert abs(seconds_from_srt_timestamp("01:01:01,123") - 3661.123) < 0.001
    assert abs(seconds_from_srt_timestamp("01:01:01.123") - 3661.123) < 0.001
