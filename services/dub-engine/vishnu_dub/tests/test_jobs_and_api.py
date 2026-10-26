"""Unit tests for JobManager checkpointing, error handling, and hardware/benchmark APIs."""

import asyncio
import json
from pathlib import Path

from vishnu_dub.api import detect_hardware
from vishnu_dub.config import Settings, resolve_ffmpeg_path
from vishnu_dub.jobs import JobManager, JobProgress, JobStatus


def test_detect_hardware_returns_tier_and_recommendations():
    profile = detect_hardware()
    assert profile.tier in ("T0", "T1", "T2", "T3")
    assert profile.cpu_cores >= 1
    assert profile.cpu_threads >= 1
    assert profile.ram_total_gb > 0
    assert profile.recommended_tts in ("edge-tts", "voxcpm2")
    assert profile.recommended_whisper != ""


def test_resolve_ffmpeg_path_finds_binary():
    ffmpeg_bin = resolve_ffmpeg_path()
    assert ffmpeg_bin
    assert "ffmpeg" in ffmpeg_bin.lower()


def test_job_progress_serializes_for_sse():
    progress = JobProgress(stage="tts", percent=65.0, message="Synthesizing", current_step=2, total_steps=5)
    payload = json.loads(progress.model_dump_json())
    assert payload == {
        "stage": "tts",
        "percent": 65.0,
        "message": "Synthesizing",
        "current_step": 2,
        "total_steps": 5,
    }


def test_job_manager_persists_and_fails_missing_local_source_without_fake_media(tmp_path: Path):
    settings = Settings(jobs_path=tmp_path / "jobs", model_store_path=tmp_path / "models")
    manager = JobManager(settings)

    async def _exercise():
        job = await manager.create_job(
            job_id="missing01",
            source_url=str(tmp_path / "nonexistent_input.mp4"),
            source_language="en",
            target_language="km",
            tts_provider="edge-tts",
        )
        assert (settings.jobs_path / "missing01.json").exists()
        await manager._run_job(job)
        loaded = await manager.get_job("missing01")
        assert loaded is not None
        assert loaded.status == JobStatus.FAILED
        assert loaded.error is not None
        assert "not found" in loaded.error.lower()
        # Must NEVER generate a fake output.mp4 when source media is missing
        assert not (Path(loaded.work_dir) / "output.mp4").exists()

    asyncio.run(_exercise())


def test_job_manager_end_to_end_pipeline_and_checkpoint_resume(tmp_path: Path, monkeypatch):
    import subprocess
    from vishnu_dub.asr import TranscriptionResult, TranscriptionSegment
    from vishnu_dub.tts import TTSBackend, TTSResult
    import vishnu_dub.jobs as jobs_mod

    ffmpeg_bin = resolve_ffmpeg_path()
    input_mp4 = tmp_path / "fixture_input.mp4"
    subprocess.run(
        [
            ffmpeg_bin, "-y",
            "-f", "lavfi", "-i", "color=c=black:s=320x240:d=2",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-shortest",
            str(input_mp4),
        ],
        check=True,
        capture_output=True,
    )

    class MockASRBackend:
        def is_available(self) -> bool:
            return True

        async def transcribe(self, audio_path: Path, language=None) -> TranscriptionResult:
            return TranscriptionResult(
                segments=[
                    TranscriptionSegment(start=0.0, end=1.0, text="Hello everyone."),
                    TranscriptionSegment(start=1.0, end=2.0, text="Thank you for watching."),
                ],
                language="en",
                duration=2.0,
            )

    class MockTranslationBackend:
        def is_available(self) -> bool:
            return True

        async def translate(self, segments, source_language: str, target_language: str, cps: float = 13.0):
            return [
                {"start": 0.0, "end": 1.0, "text": "សួស្តីអ្នកទាំងអស់គ្នា។", "source_text": "Hello everyone."},
                {"start": 1.0, "end": 2.0, "text": "សូមអរគុណសម្រាប់ការទស្សនា។", "source_text": "Thank you for watching."},
            ]

    synthesized_calls = []

    class MockLocalFfmpegTTSBackend(TTSBackend):
        @property
        def name(self) -> str:
            return "mock-ffmpeg-tts"

        def is_available(self) -> bool:
            return True

        def get_voices(self) -> list:
            return [{"id": "km-KH-SreymomNeural", "name": "Sreymom"}]

        async def synthesize(self, text: str, voice_id: str, output_path: Path, speed: float = 1.0) -> TTSResult:
            synthesized_calls.append((text, voice_id, output_path.name, speed))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(
                [
                    ffmpeg_bin, "-y",
                    "-f", "lavfi", "-i", "sine=frequency=520:duration=1",
                    "-c:a", "libmp3lame", "-q:a", "4",
                    str(output_path),
                ],
                check=True,
                capture_output=True,
            )
            return TTSResult(
                audio_path=output_path,
                duration=1.0,
                format="mp3",
                provider="edge-tts",
                voice_id=voice_id,
            )

    import vishnu_dub.asr as asr_mod
    import vishnu_dub.translation as translation_mod
    import vishnu_dub.tts as tts_mod

    monkeypatch.setattr(asr_mod, "get_asr_backend", lambda _settings: MockASRBackend())
    monkeypatch.setattr(translation_mod, "get_translation_backend", lambda _settings: MockTranslationBackend())
    monkeypatch.setattr(tts_mod, "get_tts_backend", lambda _provider, _cfg: MockLocalFfmpegTTSBackend())

    settings = Settings(jobs_path=tmp_path / "jobs", model_store_path=tmp_path / "models")
    manager = JobManager(settings)

    async def _exercise():
        job = await manager.create_job(
            job_id="resume01",
            source_url=str(input_mp4),
            source_language="en",
            target_language="km",
            tts_provider="edge-tts",
            tts_voice_id="km-KH-SreymomNeural",
            tts_speed=1.1,
            bilingual_subtitles=True,
            separate_vocals=False,
            compose_video=True,
        )
        # Pre-populate segment 0 TTS file to verify checkpoint resume skips seg_0000.mp3
        tts_dir = Path(job.work_dir) / "tts_segments"
        tts_dir.mkdir(parents=True, exist_ok=True)
        seg0 = tts_dir / "seg_0000.mp3"
        subprocess.run(
            [
                ffmpeg_bin, "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                "-c:a", "libmp3lame", "-q:a", "4",
                str(seg0),
            ],
            check=True,
            capture_output=True,
        )

        await manager._run_job(job)
        completed = await manager.get_job("resume01")
        assert completed is not None
        assert completed.status == JobStatus.COMPLETED, f"Job failed with: {completed.error}"
        assert completed.result_path is not None
        assert Path(completed.result_path).exists()
        assert Path(completed.result_path).stat().st_size > 1000

        # Verify seg_0000.mp3 was skipped (resumed from checkpoint) and only seg_0001.mp3 was synthesized
        assert len(synthesized_calls) == 1
        assert synthesized_calls[0][2] == "seg_0001.mp3"
        assert synthesized_calls[0][1] == "km-KH-SreymomNeural"

        # Verify checkpoint.json, source.srt, km.srt, translated.srt exist
        work_dir = Path(completed.work_dir)
        assert (work_dir / "checkpoint.json").exists()
        checkpoint_data = json.loads((work_dir / "checkpoint.json").read_text(encoding="utf-8"))
        assert checkpoint_data["stage"] == "completed"
        assert checkpoint_data["completed_tts_segments"] == 2
        assert (work_dir / "source.srt").exists()
        assert (work_dir / "km.srt").exists()
        assert (work_dir / "translated.srt").exists()
        assert "សួស្តីអ្នកទាំងអស់គ្នា។" in (work_dir / "km.srt").read_text(encoding="utf-8")

    asyncio.run(_exercise())


def test_edge_tts_synthesizes_real_khmer_audio_and_benchmark_persists_report(tmp_path: Path, monkeypatch):
    import vishnu_dub.benchmark as bench_mod
    from vishnu_dub.tts import EdgeTTSBackend

    class _NoModelDownloadedASR:
        def is_available(self) -> bool:
            return False

    monkeypatch.setattr(bench_mod, "get_asr_backend", lambda _settings: _NoModelDownloadedASR())

    backend = EdgeTTSBackend()
    assert backend.is_available() is True

    settings = Settings(jobs_path=tmp_path / "jobs", model_store_path=tmp_path / "models")
    manager = JobManager(settings)

    async def _exercise():
        out_mp3 = tmp_path / "khmer_test.mp3"
        res = await backend.synthesize(
            "សួស្តីអ្នកទាំងអស់គ្នា។",
            voice_id="km-KH-SreymomNeural",
            output_path=out_mp3,
            speed=1.05,
        )
        assert out_mp3.exists()
        assert out_mp3.stat().st_size > 1000
        assert res.duration > 0.0

        bench = await manager.run_benchmark(duration_seconds=2, tts_sentences=1)
        assert bench.tier in ("T0", "T1", "T2", "T3")
        assert bench.tts_time > 0.0
        report_file = settings.jobs_path / "benchmark_results.json"
        assert report_file.exists()
        report_json = json.loads(report_file.read_text(encoding="utf-8"))
        assert report_json["tts_time"] > 0.0

    asyncio.run(_exercise())

