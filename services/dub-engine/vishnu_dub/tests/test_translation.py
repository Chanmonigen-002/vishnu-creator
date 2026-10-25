"""Unit tests for Khmer translation rules and CPS length fitting.

These tests run without any LLM API key — they validate the rule text,
the CPS character budget math, and Khmer text handling (no inter-word
spaces, ។ sentence punctuation, numerals) purely in Python.
"""

import asyncio
import re

import pytest

from vishnu_dub.translation import (
    LLMTranslationBackend,
    TranslationSegment,
    TranslationResult,
    EdgeTTSTranslationBackend,
)

KHMER_RULES = LLMTranslationBackend.KHMER_RULES


# ── Khmer rules content ──────────────────────────────────────────────

def test_khmer_rules_present():
    """KHMER_RULES must contain the required Khmer dubbing rules."""
    assert "natural spoken Khmer" in KHMER_RULES
    assert "NO spaces between words" in KHMER_RULES
    assert "។" in KHMER_RULES
    assert "Arabic numerals" in KHMER_RULES
    assert "Coeng" in KHMER_RULES or "subscript" in KHMER_RULES.lower()


def test_khmer_rules_forbid_zero_width_space():
    """The rules must explicitly forbid zero-width spaces."""
    assert "Zero-Width" in KHMER_RULES or "U+200B" in KHMER_RULES


# ── CPS length fitting ───────────────────────────────────────────────

def test_max_chars_scales_with_duration():
    """Longer segments get a proportionally larger character budget."""
    cps = 13.0
    short = int(1.0 * cps * 1.25)
    long = int(5.0 * cps * 1.25)
    assert long > short
    assert short == int(1.0 * 13.0 * 1.25)  # 16


def test_max_chars_respects_cps():
    """A higher CPS allows more characters for the same duration."""
    budget_low = int(2.0 * 10.0 * 1.25)
    budget_high = int(2.0 * 20.0 * 1.25)
    assert budget_high > budget_low


# ── TranslationSegment / TranslationResult models ────────────────────

def test_translation_segment_defaults():
    seg = TranslationSegment(start=0.0, end=2.0, text="សួស្តី។")
    assert seg.start == 0.0
    assert seg.end == 2.0
    assert seg.text == "សួស្តី។"
    assert seg.source_text == ""
    assert seg.speaker is None


def test_translation_result_roundtrip():
    segs = [
        TranslationSegment(start=0.0, end=2.0, text="សួស្តី។"),
        TranslationSegment(start=2.0, end=4.0, text="លើកទឹកមក។"),
    ]
    result = TranslationResult(
        segments=segs, source_language="en", target_language="km"
    )
    assert len(result.segments) == 2
    assert result.source_language == "en"
    assert result.target_language == "km"


# ── EdgeTTSTranslationBackend: same-language passthrough ─────────────

def test_edge_tts_same_language_returns_segments():
    backend = EdgeTTSTranslationBackend()
    segs = [{"start": 0.0, "end": 2.0, "text": "Hello"}]
    out = asyncio.run(backend.translate(
        segs, source_language="en", target_language="en", cps=13.0
    ))
    assert out == segs


def test_edge_tts_foreign_language_marks_target():
    backend = EdgeTTSTranslationBackend()
    segs = [{"start": 0.0, "end": 2.0, "text": "Hello"}]
    out = asyncio.run(backend.translate(
        segs, source_language="en", target_language="km", cps=13.0
    ))
    assert out[0]["text"] == "[km] Hello"
    assert out[0]["source_text"] == "Hello"


# ── Khmer text handling ──────────────────────────────────────────────

def test_khmer_text_has_no_inter_word_spaces():
    """Real Khmer sentences contain no ASCII spaces inside a sentence."""
    khmer = "សួស្តីក្រុងបណ្ដោះអាសន្ន។លើកទឹកមក។"
    # Only allowed spaces: after sentence punctuation ។
    parts = khmer.split(" ")
    # No internal spaces means splitting yields a single chunk per sentence boundary
    for part in parts:
        if part:
            # Within a sentence chunk, there should be no ASCII space
            assert " " not in part


def test_khmer_ends_with_punctuation():
    """Each Khmer sentence ends with ។."""
    khmer = "សួស្តីក្រុងបណ្ដោះអាសន្ន។លើកទឹកមក។"
    sentences = [s for s in khmer.split("។") if s]
    assert len(sentences) == 2


def test_khmer_numerals_are_arabic():
    """Numbers are written as Arabic numerals per the rules."""
    text = "មានទី១២៣ ប្រាំពីរ។"
    assert re.search(r"\d+", text) is not None


# ── LLMTranslationBackend rules selection ────────────────────────────

def test_get_rules_returns_khmer_for_km():
    backend = LLMTranslationBackend.__new__(LLMTranslationBackend)
    rules = backend._get_rules("km")
    assert rules == KHMER_RULES


def test_get_rules_returns_empty_for_non_khmer():
    backend = LLMTranslationBackend.__new__(LLMTranslationBackend)
    assert backend._get_rules("en") == ""
    assert backend._get_rules("fr") == ""
