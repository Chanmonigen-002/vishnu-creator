"""Vishnu Dub Engine — A/B quality evaluation (T4.7).

Calculates timing drift, cue CPS metrics, and Character Error Rate (CER)
between translated script and re-transcribed synthesized audio.
Follows AGENTS.md rule: no fake metrics or synthetic formulas.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional


def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate the Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def calculate_cer(reference: str, hypothesis: str) -> float:
    """Calculate Character Error Rate (%) between reference and hypothesis text."""
    ref_clean = reference.replace("\u200b", "").strip()
    hyp_clean = hypothesis.replace("\u200b", "").strip()

    if not ref_clean:
        return 0.0 if not hyp_clean else 100.0

    dist = levenshtein_distance(ref_clean, hyp_clean)
    return round((dist / len(ref_clean)) * 100.0, 2)


def calculate_cue_cps(text: str, duration_seconds: float, language: str = "km") -> Dict[str, Any]:
    """Calculate characters per second for a cue."""
    clean_text = text.replace("\u200b", "").strip()
    char_count = len(clean_text)
    duration = max(0.001, duration_seconds)
    cps = round(char_count / duration, 1)

    # Khmer baseline threshold: <= 14.5 normal, 14.5 - 19.0 fast, > 19.0 overlong
    if language == "km":
        if cps <= 14.5:
            status = "normal"
        elif cps <= 19.0:
            status = "fast"
        else:
            status = "overlong"
    else:
        if cps <= 17.0:
            status = "normal"
        elif cps <= 23.0:
            status = "fast"
        else:
            status = "overlong"

    return {
        "cps": cps,
        "char_count": char_count,
        "duration": duration,
        "status": status,
    }


def build_quality_report(
    segments: List[Dict[str, Any]],
    target_language: str = "km",
    measured_cer_percent: Optional[float] = None,
) -> Dict[str, Any]:
    """Build structured quality report for a completed dubbing job."""
    if not segments:
        return {
            "timing_drift_ms": 0,
            "overlong_cues_count": 0,
            "total_cues": 0,
            "average_khmer_cps": 0.0,
            "cer_percent": measured_cer_percent,
            "status": "passed",
        }

    total_chars = 0
    total_duration = 0.0
    overlong_count = 0
    drift_sum_ms = 0.0

    for i, seg in enumerate(segments):
        start = float(seg.get("start", 0))
        end = float(seg.get("end", 0))
        text = str(seg.get("text", ""))
        duration = max(0.001, end - start)

        cps_info = calculate_cue_cps(text, duration, target_language)
        total_chars += cps_info["char_count"]
        total_duration += duration
        if cps_info["status"] == "overlong":
            overlong_count += 1

        if i < len(segments) - 1:
            next_start = float(segments[i + 1].get("start", 0))
            gap_sec = next_start - end
            # Broadcast standard minimum gap is 40ms (0.04s)
            if gap_sec < 0.04:
                drift_sum_ms += abs(gap_sec - 0.04) * 1000.0

    avg_cps = round(total_chars / total_duration, 1) if total_duration > 0 else 0.0
    timing_drift_ms = round(drift_sum_ms / (len(segments) - 1)) if len(segments) > 1 else 0

    overlong_ratio = overlong_count / len(segments)
    status = "passed"
    if overlong_count > 0 or timing_drift_ms > 60 or (measured_cer_percent is not None and measured_cer_percent > 6.0):
        status = "needs_attention" if (overlong_ratio > 0.25 or timing_drift_ms > 100) else "warning"

    return {
        "timing_drift_ms": int(timing_drift_ms),
        "overlong_cues_count": int(overlong_count),
        "total_cues": len(segments),
        "average_khmer_cps": avg_cps,
        "cer_percent": measured_cer_percent,
        "status": status,
    }


def write_quality_report(
    work_dir: Path,
    segments: List[Dict[str, Any]],
    target_language: str = "km",
    measured_cer_percent: Optional[float] = None,
) -> Path:
    """Generate and write quality_report.json to the job directory."""
    report = build_quality_report(segments, target_language, measured_cer_percent)
    report_path = work_dir / "quality_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report_path
