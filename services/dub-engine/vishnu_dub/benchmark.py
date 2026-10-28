"""Vishnu Dub Engine — Benchmark runner."""

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from vishnu_dub.config import get_settings, resolve_ffmpeg_path
from vishnu_dub.jobs import JobManager, JobStatus
from vishnu_dub.asr import get_asr_backend
from vishnu_dub.translation import get_translation_backend
from vishnu_dub.tts import get_tts_backend, EdgeTTSBackend
from vishnu_dub.separation import SeparationBackend
from vishnu_dub.mixer import AudioMixer, VideoAssembler


@dataclass
class BenchmarkResults:
    asr_time: float = 0.0
    translation_time: float = 0.0
    tts_time: float = 0.0
    separation_time: float = 0.0
    mixing_time: float = 0.0
    assembly_time: float = 0.0
    total_time: float = 0.0
    tier: str = "T0"
    hardware_profile: dict = None


async def run_benchmark(
    duration_seconds: int = 10,
    tts_sentences: int = 3,
    settings: Optional[Any] = None,
) -> "BenchmarkResults":
    """Run a comprehensive benchmark of the dub engine."""
    if settings is None:
        settings = get_settings()

    from vishnu_dub.api import detect_hardware
    hardware = detect_hardware()

    results = BenchmarkResults(
        tier=hardware.tier,
        hardware_profile=hardware.model_dump(),
    )

    # Create a temporary test audio file
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        test_audio = Path(f.name)

    try:
        # Generate test audio (real speech sample for accurate ASR benchmarking)
        import subprocess
        ffmpeg_bin = resolve_ffmpeg_path(getattr(settings, "ffmpeg_path", None))
        tts_for_asr = get_tts_backend("edge-tts", {})
        speech_generated = False
        if tts_for_asr.is_available():
            try:
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tts_tmp:
                    tts_tmp_path = Path(tts_tmp.name)
                await tts_for_asr.synthesize(
                    "Hello and welcome to the Vishnu Creator audio benchmarking test.",
                    "en-US-JennyNeural",
                    tts_tmp_path
                )
                if tts_tmp_path.exists() and tts_tmp_path.stat().st_size > 0:
                    subprocess.run([
                        ffmpeg_bin, "-y", "-i", str(tts_tmp_path),
                        "-t", str(duration_seconds),
                        "-ar", "16000", "-ac", "1", str(test_audio)
                    ], check=True, capture_output=True)
                    speech_generated = True
                tts_tmp_path.unlink(missing_ok=True)
            except Exception:
                speech_generated = False

        if not speech_generated:
            subprocess.run([
                ffmpeg_bin, "-y", "-f", "lavfi", "-i",
                f"sine=frequency=440:duration={duration_seconds}",
                "-ar", "16000", "-ac", "1", str(test_audio)
            ], check=True, capture_output=True)

        # Benchmark ASR
        print("Benchmarking ASR...")
        asr_backend = get_asr_backend(settings)
        start = time.time()
        if asr_backend.is_available():
            result = await asr_backend.transcribe(test_audio)
            results.asr_time = time.time() - start
            print(f"ASR: {results.asr_time:.2f}s, {len(result.segments)} segments")
        else:
            print("ASR backend not available, skipping")
            results.asr_time = 0.0

        # Benchmark Translation
        print("Benchmarking Translation...")
        translation_backend = get_translation_backend(settings)
        test_segments = [
            {"start": i * 2.0, "end": (i + 1) * 2.0, "text": f"Test sentence number {i + 1}."}
            for i in range(3)
        ]
        start = time.time()
        if translation_backend.is_available():
            translated = await translation_backend.translate(
                test_segments, "en", "km", cps=13.0
            )
            results.translation_time = time.time() - start
            print(f"Translation: {results.translation_time:.2f}s, {len(translated)} segments")
        else:
            print("Translation backend not available, skipping")
            results.translation_time = 0.0

        # Benchmark TTS
        print("Benchmarking TTS...")
        tts_backend = get_tts_backend("edge-tts", {})
        sample_sentences = [
            "សួស្តីអ្នកទាំងអស់គ្នា សូមស្វាគមន៍មកកាន់កម្មវិធីបកប្រែវីដេអូ។",
            "ប្រព័ន្ធនេះប្រើប្រាស់បច្ចេកវិទ្យាសំឡេងភាសាខ្មែរដោយស្វ័យប្រវត្តិ។",
            "សូមអរគុណសម្រាប់ការទស្សនាវីដេអូនេះរហូតដល់ចប់។",
        ]
        start = time.time()
        if tts_backend.is_available():
            for idx in range(max(1, tts_sentences)):
                sentence = sample_sentences[idx % len(sample_sentences)]
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                    tts_output = Path(f.name)
                try:
                    await tts_backend.synthesize(
                        sentence, "km-KH-SreymomNeural", tts_output
                    )
                finally:
                    tts_output.unlink(missing_ok=True)
            results.tts_time = time.time() - start
            print(f"TTS ({max(1, tts_sentences)} sentences): {results.tts_time:.2f}s")
        else:
            print("TTS backend not available, skipping")
            results.tts_time = 0.0

        # Benchmark Separation (optional)
        print("Benchmarking Separation...")
        separation_backend = SeparationBackend()
        start = time.time()
        if separation_backend.is_available():
            with tempfile.TemporaryDirectory() as tmpdir:
                result = await separation_backend.separate(
                    test_audio, Path(tmpdir)
                )
            results.separation_time = time.time() - start
            print(f"Separation: {results.separation_time:.2f}s")
        else:
            print("Separation backend not available, skipping")
            results.separation_time = 0.0

    finally:
        test_audio.unlink(missing_ok=True)

    results.total_time = sum([
        results.asr_time,
        results.translation_time,
        results.tts_time,
        results.separation_time,
    ])

    try:
        import json
        out_dir = Path(getattr(settings, "jobs_path", Path.cwd()))
        out_dir.mkdir(parents=True, exist_ok=True)
        report_path = out_dir / "benchmark_results.json"
        with open(report_path, "w", encoding="utf-8") as bf:
            json.dump(
                {
                    "tier": results.tier,
                    "asr_time": round(results.asr_time, 4),
                    "translation_time": round(results.translation_time, 4),
                    "tts_time": round(results.tts_time, 4),
                    "separation_time": round(results.separation_time, 4),
                    "total_time": round(results.total_time, 4),
                    "hardware_profile": results.hardware_profile,
                },
                bf,
                indent=2,
            )
    except Exception:
        pass

    return results


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Vishnu Dub Engine Benchmark")
    parser.add_argument("--duration", type=int, default=10, help="Test audio duration in seconds")
    parser.add_argument("--tts-sentences", type=int, default=3, help="Number of TTS test sentences")
    args = parser.parse_args()

    print("=" * 60)
    print("Vishnu Dub Engine Benchmark")
    print("=" * 60)

    results = await run_benchmark(
        duration_seconds=args.duration,
        tts_sentences=args.tts_sentences,
    )

    print("\n" + "=" * 60)
    print("BENCHMARK RESULTS")
    print("=" * 60)
    print(f"Tier: {results.tier}")
    print(f"ASR Time:          {results.asr_time:.2f}s")
    print(f"Translation Time:  {results.translation_time:.2f}s")
    print(f"TTS Time:          {results.tts_time:.2f}s")
    print(f"Separation Time:   {results.separation_time:.2f}s")
    print(f"Total Time:        {results.total_time:.2f}s")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())