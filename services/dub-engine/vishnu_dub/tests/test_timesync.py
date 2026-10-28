"""Tests for subtitle-timed placement of dubbed speech (T4.5)."""

import asyncio
import json
import subprocess
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from vishnu_dub.config import resolve_ffmpeg_path
from vishnu_dub.timesync import SAMPLE_RATE, build_synced_track, plan_placements, summarize


def seg(start, end):
    return {"start": start, "end": end, "text": "x"}


def test_short_segment_keeps_natural_speed_and_starts_on_time():
    [p] = plan_placements([seg(2.0, 5.0)], [1.5])
    assert (p.tempo, p.placed_start, p.placed_end, p.status) == (1.0, 2.0, 3.5, "fit")


def test_long_segment_uses_the_gap_before_the_next_subtitle_first():
    placements = plan_placements([seg(0.0, 2.0), seg(3.0, 4.0)], [2.8, 0.5])
    assert placements[0].tempo == 1.0
    assert placements[0].status == "fit"
    assert placements[0].placed_end == 2.8
    assert placements[1].placed_start == 3.0


def test_segment_longer_than_its_room_is_sped_up_to_fit():
    placements = plan_placements([seg(0.0, 2.0), seg(2.0, 3.0)], [2.4, 0.5])
    assert placements[0].tempo == pytest.approx(1.2)
    assert placements[0].status == "sped_up"
    assert placements[0].placed_end == pytest.approx(2.0)
    assert placements[1].placed_start == 2.0


def test_speedup_is_capped_and_overflow_delays_the_next_segment_without_overlap():
    placements = plan_placements([seg(0.0, 2.0), seg(2.0, 3.0), seg(5.0, 6.0)], [4.0, 0.5, 0.5], max_speedup=1.25)
    first, second, third = placements
    assert first.tempo == 1.25
    assert first.placed_end == pytest.approx(3.2)
    assert first.status == "overflow"
    assert first.overflow == pytest.approx(1.2)
    assert second.placed_start == pytest.approx(3.2)
    assert second.placed_start >= first.placed_end
    assert third.placed_start == 5.0
    summary = summarize(placements)
    assert summary["overflow"] == 1
    assert summary["max_drift"] == pytest.approx(1.2)


def test_last_segment_may_run_past_its_end_without_being_flagged():
    [p] = plan_placements([seg(0.0, 1.0)], [3.0], max_speedup=1.5)
    assert p.tempo == 1.5
    assert p.placed_end == pytest.approx(2.0)
    assert p.status == "sped_up"
    assert p.overflow == 0.0


def test_rejects_mismatched_inputs_and_invalid_speedup():
    with pytest.raises(ValueError):
        plan_placements([seg(0, 1)], [])
    with pytest.raises(ValueError):
        plan_placements([seg(0, 1)], [1.0], max_speedup=0.9)


def _write_tone_fixture(path: Path, seconds: float, frequency: float) -> None:
    """Test fixture input only: a short tone so placement can be measured exactly."""
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    sf.write(str(path), (0.5 * np.sin(2 * np.pi * frequency * t)).astype(np.float32), SAMPLE_RATE, subtype="PCM_16")


def _loud_regions(audio: np.ndarray, threshold: float = 0.05, frame: int = SAMPLE_RATE // 100):
    """Start/end seconds of non-silent stretches, using RMS over 10 ms frames."""
    frames = len(audio) // frame
    rms = np.sqrt(np.mean(audio[: frames * frame].reshape(frames, frame) ** 2, axis=1))
    loud = rms > threshold
    edges = np.flatnonzero(np.diff(loud.astype(np.int8))) + 1
    bounds = np.concatenate([[0] if loud[0] else [], edges, [frames] if loud[-1] else []]).astype(int)
    return [(bounds[i] * frame / SAMPLE_RATE, bounds[i + 1] * frame / SAMPLE_RATE) for i in range(0, len(bounds), 2)]


def test_build_synced_track_places_real_audio_on_the_timeline(tmp_path):
    ffmpeg = resolve_ffmpeg_path()
    if subprocess.run([ffmpeg, "-version"], capture_output=True).returncode != 0:
        pytest.skip("ffmpeg not available")
    files = []
    for index, (seconds, freq) in enumerate([(1.0, 440.0), (2.4, 660.0), (0.5, 880.0)]):
        path = tmp_path / f"seg_{index}.wav"
        _write_tone_fixture(path, seconds, freq)
        files.append(path)
    segments = [seg(1.0, 2.5), seg(3.0, 5.0), seg(5.0, 6.0)]
    output = tmp_path / "track.wav"

    placements = asyncio.run(build_synced_track(ffmpeg, segments, files, output, tmp_path))

    assert [p.status for p in placements] == ["fit", "sped_up", "fit"]
    assert placements[1].tempo == pytest.approx(1.2)
    audio, rate = sf.read(str(output), dtype="float32")
    assert rate == SAMPLE_RATE
    regions = _loud_regions(audio)
    # The sped-up second segment ends exactly where the third starts (5.0 s),
    # so they form one continuous sound from 3.0 to 5.5 s.
    assert len(regions) == 2
    expected = [(1.0, 2.0), (3.0, 5.5)]
    for (start, end), (want_start, want_end) in zip(regions, expected):
        assert start == pytest.approx(want_start, abs=0.03)
        assert end == pytest.approx(want_end, abs=0.03)
    report = json.loads((tmp_path / "timesync_report.json").read_text(encoding="utf-8"))
    assert report["summary"] == {"segments": 3, "fit": 2, "sped_up": 1, "overflow": 0, "max_tempo": 1.2, "max_drift": 0.0}
