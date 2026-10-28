"""Tests for quality report and CER metrics (T4.7)."""

import json
from pathlib import Path

import pytest

from vishnu_dub.quality import (
    calculate_cer,
    calculate_cue_cps,
    build_quality_report,
    write_quality_report,
    levenshtein_distance,
)


def test_levenshtein_distance_exact_and_mutations():
    assert levenshtein_distance("", "") == 0
    assert levenshtein_distance("hello", "hello") == 0
    assert levenshtein_distance("hello", "hallo") == 1
    assert levenshtein_distance("kitten", "sitting") == 3


def test_calculate_cer_precision():
    ref = "សួស្តី ភ្នំពេញ"
    # Identical
    assert calculate_cer(ref, ref) == 0.0
    # Empty reference
    assert calculate_cer("", "") == 0.0
    assert calculate_cer("", "abc") == 100.0
    # One substitution
    hyp = "សួស្តី កំពត"
    cer = calculate_cer(ref, hyp)
    assert 0.0 < cer < 100.0


def test_calculate_cue_cps_khmer_thresholds():
    # 10 chars over 1 sec = 10 cps (normal)
    info_normal = calculate_cue_cps("សួស្តីពិភពលោក", 1.0, language="km")
    assert info_normal["status"] in ("normal", "fast")

    # Fast / Overlong
    long_text = "សួស្តី" * 10 # 60 chars in 1.5s = 40 cps
    info_overlong = calculate_cue_cps(long_text, 1.5, language="km")
    assert info_overlong["status"] == "overlong"


def test_build_quality_report_and_write(tmp_path):
    segments = [
        {"start": 0.0, "end": 2.0, "text": "សួស្តី ពិភពលោក"},
        {"start": 2.05, "end": 4.0, "text": "នេះគឺជាការសាកល្បង"},
        {"start": 4.1, "end": 6.0, "text": "បញ្ចប់ដោយជោគជ័យ"},
    ]

    report = build_quality_report(segments, target_language="km", measured_cer_percent=2.5)
    assert report["total_cues"] == 3
    assert report["overlong_cues_count"] == 0
    assert report["cer_percent"] == 2.5
    assert report["status"] == "passed"

    path = write_quality_report(tmp_path, segments, target_language="km", measured_cer_percent=2.5)
    assert path.exists()
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["total_cues"] == 3
    assert saved["cer_percent"] == 2.5
