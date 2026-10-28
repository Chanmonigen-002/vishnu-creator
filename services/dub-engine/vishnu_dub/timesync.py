"""Place dubbed speech segments on the subtitle timeline (T4.5).

Each synthesized segment starts at its subtitle start time. A segment that is
longer than its slot is sped up with ffmpeg ``atempo`` up to ``max_speedup``;
it may also use the gap before the next subtitle. If it still does not fit, the
next segment is delayed just enough to avoid overlap and the segment is flagged.
Speech is never cut, and short segments are not slowed down (slowed speech
sounds unnatural); the remaining slot is silence.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Literal, Sequence

import numpy as np
import soundfile as sf

DEFAULT_MAX_SPEEDUP = 1.3
SAMPLE_RATE = 24_000

Status = Literal["fit", "sped_up", "overflow"]


@dataclass
class SegmentPlacement:
    index: int
    target_start: float
    target_end: float
    speech_duration: float
    tempo: float
    placed_start: float
    placed_end: float
    status: Status
    # Seconds by which this segment pushes past the next subtitle's start.
    overflow: float


def plan_placements(
    segments: Sequence[Dict[str, Any]],
    speech_durations: Sequence[float],
    max_speedup: float = DEFAULT_MAX_SPEEDUP,
) -> List[SegmentPlacement]:
    """Decide tempo and start time for each segment. Pure: no audio is touched."""
    if len(segments) != len(speech_durations):
        raise ValueError("Each segment needs exactly one speech duration")
    if max_speedup < 1.0:
        raise ValueError("max_speedup must be at least 1.0")

    placements: List[SegmentPlacement] = []
    previous_end = 0.0
    for index, (segment, duration) in enumerate(zip(segments, speech_durations)):
        start = float(segment["start"])
        end = max(float(segment["end"]), start)
        next_start = float(segments[index + 1]["start"]) if index + 1 < len(segments) else None
        # The segment may use the silence up to the next subtitle, never beyond it.
        limit = max(next_start, end) if next_start is not None else end
        placed_start = max(start, previous_end)
        room = max(limit - placed_start, 0.0)

        tempo = 1.0
        if room > 0 and duration > room:
            tempo = min(duration / room, max_speedup)
        placed_duration = duration / tempo
        placed_end = placed_start + placed_duration

        overflow = max(placed_end - limit, 0.0) if next_start is not None else 0.0
        if overflow > 1e-3 or (room == 0 and duration > 0 and next_start is not None):
            status: Status = "overflow"
        elif tempo > 1.0 + 1e-6:
            status = "sped_up"
        else:
            status = "fit"

        placements.append(SegmentPlacement(
            index=index,
            target_start=round(start, 3),
            target_end=round(end, 3),
            speech_duration=round(duration, 3),
            tempo=round(tempo, 4),
            placed_start=round(placed_start, 3),
            placed_end=round(placed_end, 3),
            status=status,
            overflow=round(overflow, 3),
        ))
        previous_end = placed_end
    return placements


async def _ffmpeg_to_wav(ffmpeg_bin: str, source: Path, target: Path, tempo: float) -> None:
    args = [ffmpeg_bin, "-y", "-i", str(source)]
    if abs(tempo - 1.0) > 1e-6:
        args += ["-filter:a", f"atempo={tempo:.4f}"]
    args += ["-acodec", "pcm_s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", str(target)]
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    _, stderr = await proc.communicate()
    if proc.returncode != 0 or not target.exists():
        raise RuntimeError(f"ffmpeg failed to decode {source.name}: {stderr.decode(errors='replace')[-500:]}")


async def build_synced_track(
    ffmpeg_bin: str,
    segments: Sequence[Dict[str, Any]],
    segment_files: Sequence[Path],
    output_wav: Path,
    work_dir: Path,
    max_speedup: float = DEFAULT_MAX_SPEEDUP,
) -> List[SegmentPlacement]:
    """Render the dubbed track with every segment at its planned time.

    Writes ``output_wav`` (24 kHz mono PCM) and ``timesync_report.json`` in
    ``work_dir``; returns the placements.
    """
    if len(segments) != len(segment_files):
        raise ValueError("Each segment needs exactly one audio file")
    decoded_dir = work_dir / "timesync"
    decoded_dir.mkdir(parents=True, exist_ok=True)

    # Decode once at natural speed to measure real speech length.
    durations: List[float] = []
    for index, source in enumerate(segment_files):
        natural = decoded_dir / f"natural_{index:04d}.wav"
        await _ffmpeg_to_wav(ffmpeg_bin, source, natural, 1.0)
        info = sf.info(str(natural))
        durations.append(info.frames / info.samplerate)

    placements = plan_placements(segments, durations, max_speedup)

    total_seconds = max((p.placed_end for p in placements), default=0.0)
    track = np.zeros(int(np.ceil(total_seconds * SAMPLE_RATE)) + SAMPLE_RATE // 10, dtype=np.float32)
    for placement in placements:
        natural = decoded_dir / f"natural_{placement.index:04d}.wav"
        if placement.tempo != 1.0:
            rendered = decoded_dir / f"tempo_{placement.index:04d}.wav"
            await _ffmpeg_to_wav(ffmpeg_bin, segment_files[placement.index], rendered, placement.tempo)
        else:
            rendered = natural
        audio, rate = sf.read(str(rendered), dtype="float32", always_2d=False)
        if rate != SAMPLE_RATE:
            raise RuntimeError(f"Unexpected sample rate {rate} for segment {placement.index}")
        offset = int(round(placement.placed_start * SAMPLE_RATE))
        needed = offset + len(audio)
        if needed > len(track):
            track = np.concatenate([track, np.zeros(needed - len(track), dtype=np.float32)])
        # Segments never overlap by construction; add anyway so a rounding
        # sample of overlap cannot erase speech.
        track[offset:needed] += audio

    np.clip(track, -1.0, 1.0, out=track)
    sf.write(str(output_wav), track, SAMPLE_RATE, subtype="PCM_16")
    report = {
        "max_speedup": max_speedup,
        "segments": [asdict(p) for p in placements],
        "summary": summarize(placements),
    }
    (work_dir / "timesync_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return placements


def summarize(placements: Sequence[SegmentPlacement]) -> Dict[str, Any]:
    return {
        "segments": len(placements),
        "fit": sum(1 for p in placements if p.status == "fit"),
        "sped_up": sum(1 for p in placements if p.status == "sped_up"),
        "overflow": sum(1 for p in placements if p.status == "overflow"),
        "max_tempo": max((p.tempo for p in placements), default=1.0),
        "max_drift": max((round(p.placed_start - p.target_start, 3) for p in placements), default=0.0),
    }
