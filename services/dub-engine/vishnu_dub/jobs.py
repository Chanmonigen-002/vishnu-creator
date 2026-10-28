"""Vishnu Dub Engine — job management with checkpointing."""

import asyncio
import json
import shutil
import subprocess
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse

from vishnu_dub.config import Settings, resolve_ffmpeg_path, resolve_ytdlp_path
from vishnu_dub.timesync import DEFAULT_MAX_SPEEDUP, build_synced_track, summarize


class JobStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class JobProgress:
    stage: str = ""
    percent: float = 0.0
    message: str = ""
    current_step: int = 0
    total_steps: int = 0

    def model_dump_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class Job:
    job_id: str
    source_url: str
    source_language: str
    target_language: str
    tts_provider: str
    tts_voice_id: Optional[str] = None
    tts_style: Optional[str] = None
    tts_speed: float = 1.0
    separate_vocals: bool = True
    bilingual_subtitles: bool = True
    compose_video: bool = True
    auto_clone_speaker: bool = False
    llm_base_url: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None

    status: JobStatus = JobStatus.PENDING
    progress: JobProgress = field(default_factory=JobProgress)
    error: Optional[str] = None
    result_path: Optional[str] = None
    srt_path: Optional[str] = None
    km_srt_path: Optional[str] = None
    vocals_path: Optional[str] = None
    music_path: Optional[str] = None
    reference_audio_path: Optional[str] = None

    # Timing
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None

    # Benchmark timing
    asr_time: float = 0.0
    translation_time: float = 0.0
    tts_time: float = 0.0
    separation_time: float = 0.0
    total_time: float = 0.0

    # Paths
    work_dir: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "source_url": self.source_url,
            "source_language": self.source_language,
            "target_language": self.target_language,
            "tts_provider": self.tts_provider,
            "tts_voice_id": self.tts_voice_id,
            "tts_style": self.tts_style,
            "tts_speed": self.tts_speed,
            "separate_vocals": self.separate_vocals,
            "bilingual_subtitles": self.bilingual_subtitles,
            "compose_video": self.compose_video,
            "status": self.status.value,
            "progress": {
                "stage": self.progress.stage,
                "percent": self.progress.percent,
                "message": self.progress.message,
                "current_step": self.progress.current_step,
                "total_steps": self.progress.total_steps,
            },
            "error": self.error,
            "result_path": self.result_path,
            "srt_path": self.srt_path,
            "km_srt_path": self.km_srt_path,
            "vocals_path": self.vocals_path,
            "music_path": self.music_path,
            "reference_audio_path": self.reference_audio_path,
            "auto_clone_speaker": self.auto_clone_speaker,
            "llm_base_url": self.llm_base_url,
            "llm_api_key": self.llm_api_key,
            "llm_model": self.llm_model,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "asr_time": self.asr_time,
            "translation_time": self.translation_time,
            "tts_time": self.tts_time,
            "separation_time": self.separation_time,
            "total_time": self.total_time,
            "work_dir": self.work_dir,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Job":
        job = cls(
            job_id=data["job_id"],
            source_url=data["source_url"],
            source_language=data["source_language"],
            target_language=data["target_language"],
            tts_provider=data["tts_provider"],
            tts_voice_id=data.get("tts_voice_id"),
            tts_style=data.get("tts_style"),
            tts_speed=data.get("tts_speed", 1.0),
            separate_vocals=data.get("separate_vocals", True),
            bilingual_subtitles=data.get("bilingual_subtitles", True),
            compose_video=data.get("compose_video", True),
            auto_clone_speaker=data.get("auto_clone_speaker", False),
            llm_base_url=data.get("llm_base_url"),
            llm_api_key=data.get("llm_api_key"),
            llm_model=data.get("llm_model"),
        )
        job.status = JobStatus(data["status"])
        job.progress = JobProgress(**data.get("progress", {}))
        job.error = data.get("error")
        job.result_path = data.get("result_path")
        job.srt_path = data.get("srt_path")
        job.km_srt_path = data.get("km_srt_path")
        job.vocals_path = data.get("vocals_path")
        job.music_path = data.get("music_path")
        job.created_at = data.get("created_at", 0)
        job.started_at = data.get("started_at")
        job.completed_at = data.get("completed_at")
        job.asr_time = data.get("asr_time", 0.0)
        job.translation_time = data.get("translation_time", 0.0)
        job.tts_time = data.get("tts_time", 0.0)
        job.separation_time = data.get("separation_time", 0.0)
        job.total_time = data.get("total_time", 0.0)
        job.work_dir = data.get("work_dir")
        job.reference_audio_path = data.get("reference_audio_path")
        job.auto_clone_speaker = data.get("auto_clone_speaker", False)
        return job


class JobManager:
    def __init__(self, settings: Any):
        self.settings = settings
        self.jobs: Dict[str, Any] = {}
        self._running = False
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def start(self):
        self.settings.jobs_path.mkdir(parents=True, exist_ok=True)
        await self._load_jobs()
        self._running = True
        self._worker_task = asyncio.create_task(self._worker())

    async def stop(self):
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    def _get_job_path(self, job_id: str) -> Path:
        return self.settings.jobs_path / f"{job_id}.json"

    async def _load_jobs(self):
        if not self.settings.jobs_path.exists():
            return
        for job_file in self.settings.jobs_path.glob("*.json"):
            try:
                with open(job_file, encoding="utf-8") as f:
                    data = json.load(f)
                job = Job.from_dict(data)
                if not job.work_dir:
                    job.work_dir = str(self.settings.jobs_path / job.job_id)
                self.jobs[job.job_id] = job
            except Exception as e:
                print(f"Failed to load job {job_file}: {e}")

    async def _save_job(self, job: "Job"):
        self.settings.jobs_path.mkdir(parents=True, exist_ok=True)
        path = self._get_job_path(job.job_id)
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(job.to_dict(), f, indent=2)
        tmp.replace(path)

    async def create_job(
        self,
        job_id: str,
        source_url: str,
        source_language: str,
        target_language: str,
        tts_provider: str,
        tts_voice_id: Optional[str] = None,
        tts_style: Optional[str] = None,
        tts_speed: float = 1.0,
        separate_vocals: bool = True,
        bilingual_subtitles: bool = True,
        compose_video: bool = True,
        llm_base_url: Optional[str] = None,
        llm_api_key: Optional[str] = None,
        llm_model: Optional[str] = None,
        auto_clone_speaker: bool = False,
    ) -> "Job":
        async with self._lock:
            job = Job(
                job_id=job_id,
                source_url=source_url,
                source_language=source_language,
                target_language=target_language,
                tts_provider=tts_provider,
                tts_voice_id=tts_voice_id,
                tts_style=tts_style,
                tts_speed=tts_speed,
                separate_vocals=separate_vocals,
                bilingual_subtitles=bilingual_subtitles,
                compose_video=compose_video,
                llm_base_url=llm_base_url,
                llm_api_key=llm_api_key,
                llm_model=llm_model,
                auto_clone_speaker=auto_clone_speaker,
            )
            job.work_dir = str(self.settings.jobs_path / job_id)
            Path(job.work_dir).mkdir(parents=True, exist_ok=True)
            self.jobs[job_id] = job
            await self._save_job(job)
            return job

    async def get_job(self, job_id: str) -> Optional["Job"]:
        return self.jobs.get(job_id)

    async def update_job(self, job_id: str, **updates) -> Optional["Job"]:
        job = self.jobs.get(job_id)
        if not job:
            return None

        for key, value in updates.items():
            if hasattr(job, key):
                setattr(job, key, value)

        if "status" in updates and updates["status"] == "running" and job.started_at is None:
            job.started_at = time.time()
        if "status" in updates and updates["status"] in ("completed", "failed", "cancelled"):
            job.completed_at = time.time()
            if job.started_at:
                job.total_time = job.completed_at - job.started_at

        await self._save_job(job)
        return job

    async def _worker(self):
        while self._running:
            try:
                await asyncio.sleep(0.2)
                for job in list(self.jobs.values()):
                    if job.status == JobStatus.PENDING:
                        await self._run_job(job)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Worker error: {e}")
                await asyncio.sleep(2)

    def _fmt_srt(self, seconds: float) -> str:
        """Format seconds as SRT timestamp (HH:MM:SS,mmm)."""
        total_ms = int(round(seconds * 1000))
        hours = total_ms // 3_600_000
        minutes = (total_ms % 3_600_000) // 60_000
        secs = (total_ms % 60_000) // 1_000
        millis = total_ms % 1_000
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    def _write_srt(self, path: Path, segments: List[Dict[str, Any]], bilingual_source: Optional[List[Dict[str, Any]]] = None) -> None:
        from vishnu_dub.subtitles import normalize_timecodes
        normalized = normalize_timecodes(segments, min_gap_ms=40, min_cue_duration_ms=400, text_key="text")
        with open(path, "w", encoding="utf-8") as f:
            for i, seg in enumerate(normalized, 1):
                f.write(f"{i}\n")
                f.write(f"{self._fmt_srt(float(seg['start']))} --> {self._fmt_srt(float(seg['end']))}\n")
                if bilingual_source and i - 1 < len(bilingual_source):
                    src_text = bilingual_source[i - 1].get("text", "").strip()
                    if src_text and src_text != seg["text"].strip():
                        f.write(f"{seg['text']}\n{src_text}\n\n")
                        continue
                f.write(f"{seg['text']}\n\n")

    async def _prepare_source(self, job: "Job", work_dir: Path, ffmpeg_bin: str) -> tuple[Path, Path]:
        source_video = work_dir / "source_video.mp4"
        source_audio = work_dir / "source_audio.wav"

        if not source_video.exists() or source_video.stat().st_size == 0:
            raw_url = (job.source_url or "").strip()
            if not raw_url:
                raise ValueError("source_url is required")

            local_candidate: Optional[Path] = None
            if raw_url.startswith("file://"):
                parsed = urlparse(raw_url)
                file_path = unquote(parsed.path)
                if file_path.startswith("/") and len(file_path) > 2 and file_path[2] == ":":
                    file_path = file_path[1:]
                local_candidate = Path(file_path)
            elif not raw_url.startswith(("http://", "https://")):
                local_candidate = Path(raw_url)

            if local_candidate is not None:
                if not local_candidate.exists() or not local_candidate.is_file():
                    raise FileNotFoundError(f"Local source media not found: {local_candidate}")
                shutil.copy2(local_candidate, source_video)
            else:
                ytdlp_bin = resolve_ytdlp_path()
                proc = await asyncio.create_subprocess_exec(
                    ytdlp_bin,
                    "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                    "--merge-output-format", "mp4",
                    "-o", str(source_video),
                    raw_url,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr = await proc.communicate()
                if proc.returncode != 0 or not source_video.exists():
                    raise RuntimeError(f"Failed to download source media from {raw_url}: {stderr.decode(errors='replace')}")

        if not source_audio.exists() or source_audio.stat().st_size == 0:
            proc = await asyncio.create_subprocess_exec(
                ffmpeg_bin, "-y",
                "-i", str(source_video),
                "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                str(source_audio),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0 or not source_audio.exists():
                raise RuntimeError(f"Failed to extract audio with ffmpeg: {stderr.decode(errors='replace')}")

        return source_video, source_audio

    async def _extract_reference_audio(self, job: "Job", work_dir: Path, ffmpeg_bin: str, source_audio: Path, max_duration: float = 30.0) -> Optional[Path]:
        """Extract a reference audio segment (up to max_duration seconds) from source audio for voice cloning."""
        if not job.auto_clone_speaker:
            return None
        
        reference_audio = work_dir / "reference_audio.wav"
        reference_audio.parent.mkdir(parents=True, exist_ok=True)
        
        # Extract first 30 seconds of audio for voice cloning reference
        proc = await asyncio.create_subprocess_exec(
            ffmpeg_bin, "-y",
            "-i", str(source_audio),
            "-t", str(max_duration),
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            str(reference_audio),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        
        if proc.returncode != 0 or not reference_audio.exists() or reference_audio.stat().st_size == 0:
            print(f"Warning: Failed to extract reference audio: {stderr.decode(errors='replace')}")
            return None
        
        return reference_audio

    async def _run_job(self, job: "Job"):
        """Run the full dubbing pipeline with stage and segment checkpointing."""
        from vishnu_dub.asr import get_asr_backend
        from vishnu_dub.mixer import AudioMixer, VideoAssembler
        from vishnu_dub.separation import SeparationBackend
        from vishnu_dub.translation import get_translation_backend
        from vishnu_dub.tts import get_tts_backend

        job.status = JobStatus.RUNNING
        if job.started_at is None:
            job.started_at = time.time()
        job.progress = JobProgress(stage="initializing", percent=5, message="Initializing...")
        await self._save_job(job)

        work_dir = Path(job.work_dir or (self.settings.jobs_path / job.job_id))
        work_dir.mkdir(parents=True, exist_ok=True)
        ffmpeg_bin = resolve_ffmpeg_path(getattr(self.settings, "ffmpeg_path", None))

        try:
            checkpoint_file = work_dir / "checkpoint.json"

            def write_checkpoint(stage: str, completed_tts_segments: int = 0) -> None:
                with open(checkpoint_file, "w", encoding="utf-8") as cf:
                    json.dump(
                        {
                            "job_id": job.job_id,
                            "stage": stage,
                            "completed_tts_segments": completed_tts_segments,
                            "updated_at": time.time(),
                        },
                        cf,
                        indent=2,
                    )

            # Stage 1: Download / Prepare source media & extract 16kHz audio
            job.progress = JobProgress(stage="download", percent=10, message="Preparing source media...")
            await self._save_job(job)
            source_video, source_audio = await self._prepare_source(job, work_dir, ffmpeg_bin)
            write_checkpoint("download")

            # Stage 2: ASR / Transcription (checkpointed via segments.json)
            job.progress = JobProgress(stage="asr", percent=25, message="Transcribing audio...")
            await self._save_job(job)
            segments_json = work_dir / "segments.json"
            source_srt = work_dir / "source.srt"

            if segments_json.exists() and source_srt.exists():
                with open(segments_json, encoding="utf-8") as f:
                    source_segments = json.load(f)
            else:
                asr_start = time.time()
                asr_backend = get_asr_backend(self.settings)
                lang = None if job.source_language in ("", "auto") else job.source_language
                asr_result = await asr_backend.transcribe(source_audio, language=lang)
                raw_segments = [
                    {
                        "start": float(seg.start),
                        "end": float(seg.end),
                        "text": seg.text.strip(),
                        "words": getattr(seg, "words", None),
                    }
                    for seg in asr_result.segments
                    if seg.text.strip()
                ]
                if not raw_segments:
                    raise RuntimeError("ASR produced no speech segments from source audio")

                from vishnu_dub.subtitles import stabilize_subtitles
                source_segments = stabilize_subtitles(
                    raw_segments,
                    lang_code=asr_result.language or job.source_language or "en",
                    text_key="text",
                )
                if not source_segments:
                    source_segments = raw_segments

                with open(segments_json, "w", encoding="utf-8") as f:
                    json.dump(source_segments, f, ensure_ascii=False, indent=2)
                self._write_srt(source_srt, source_segments)
                job.asr_time = time.time() - asr_start
                if hasattr(asr_backend, "unload"):
                    asr_backend.unload()
                from vishnu_dub.models import ModelManager
                ModelManager.get_instance().release_current_model()

            job.srt_path = str(source_srt)
            write_checkpoint("asr")
            await self._save_job(job)

            # Stage 3: Translation to target language (checkpointed via km_segments.json)
            job.progress = JobProgress(stage="translation", percent=45, message="Translating subtitles...")
            await self._save_job(job)
            km_segments_json = work_dir / "km_segments.json"
            km_srt = work_dir / "km.srt"
            translated_srt = work_dir / "translated.srt"

            if km_segments_json.exists() and km_srt.exists():
                with open(km_segments_json, encoding="utf-8") as f:
                    km_segments = json.load(f)
            else:
                trans_start = time.time()
                if job.llm_api_key:
                    from vishnu_dub.translation import LLMTranslationBackend
                    from vishnu_dub.config import LLMConfig
                    translation_backend = LLMTranslationBackend(LLMConfig(
                        base_url=job.llm_base_url or self.settings.llm.base_url,
                        api_key=job.llm_api_key,
                        model=job.llm_model or self.settings.llm.model or "gpt-4o-mini",
                    ))
                else:
                    translation_backend = get_translation_backend(self.settings)
                translated = await translation_backend.translate(
                    source_segments,
                    job.source_language,
                    job.target_language,
                )
                raw_km_segments = []
                for seg in translated:
                    seg_start = float(seg["start"] if isinstance(seg, dict) else seg.start)
                    seg_end = float(seg["end"] if isinstance(seg, dict) else seg.end)
                    seg_text = str(seg["text"] if isinstance(seg, dict) else seg.text).strip()
                    if seg_text:
                        raw_km_segments.append({"start": seg_start, "end": seg_end, "text": seg_text})
                if not raw_km_segments:
                    raise RuntimeError("Translation produced no subtitle segments")

                from vishnu_dub.subtitles import stabilize_subtitles
                km_segments = stabilize_subtitles(
                    raw_km_segments,
                    lang_code=job.target_language or "km",
                    text_key="text",
                    clean_fillers=False,
                )
                if not km_segments:
                    km_segments = raw_km_segments

                with open(km_segments_json, "w", encoding="utf-8") as f:
                    json.dump(km_segments, f, ensure_ascii=False, indent=2)
                bilingual_src = source_segments if job.bilingual_subtitles else None
                self._write_srt(km_srt, km_segments, bilingual_source=bilingual_src)
                self._write_srt(translated_srt, km_segments, bilingual_source=bilingual_src)
                job.translation_time = time.time() - trans_start

            job.km_srt_path = str(km_srt)
            write_checkpoint("translation")
            await self._save_job(job)

            # Extract reference audio for voice cloning (if auto_clone_speaker enabled)
            if job.auto_clone_speaker:
                job.progress = JobProgress(stage="reference_audio", percent=55, message="Extracting reference audio for voice cloning...")
                await self._save_job(job)
                reference_audio = await self._extract_reference_audio(job, work_dir, ffmpeg_bin, source_audio)
                if reference_audio:
                    job.reference_audio_path = str(reference_audio)
                    await self._save_job(job)
                write_checkpoint("reference_audio")

            # Stage 4: TTS — synthesize per-segment audio with checkpoint resume
            job.progress = JobProgress(
                stage="tts",
                percent=60,
                message="Generating speech...",
                current_step=0,
                total_steps=len(km_segments),
            )
            await self._save_job(job)

            tts_dir = work_dir / "tts_segments"
            tts_dir.mkdir(parents=True, exist_ok=True)
            tts_backend = get_tts_backend(
                job.tts_provider,
                {
                    "api_key": getattr(self.settings, "llm_api_key", None),
                    "base_url": getattr(self.settings, "llm_base_url", None),
                },
            )
            voice_id = job.tts_voice_id or "km-KH-SreymomNeural"
            tts_start = time.time()
            segment_files: List[Path] = []
            synthesized_any = False

            for idx, seg in enumerate(km_segments):
                seg_path = tts_dir / f"seg_{idx:04d}.mp3"
                if not seg_path.exists() or seg_path.stat().st_size == 0:
                    # Only cloning backends (VoxCPM2) accept reference_audio; the
                    # TTSBackend contract and the Edge/OpenAI backends do not.
                    clone_kwargs = (
                        {"reference_audio": Path(job.reference_audio_path)}
                        if job.reference_audio_path
                        else {}
                    )
                    await tts_backend.synthesize(
                        seg["text"],
                        voice_id=voice_id,
                        output_path=seg_path,
                        speed=job.tts_speed,
                        **clone_kwargs,
                    )
                    synthesized_any = True
                segment_files.append(seg_path)
                write_checkpoint("tts", completed_tts_segments=idx + 1)
                job.progress = JobProgress(
                    stage="tts",
                    percent=60 + round(15 * (idx + 1) / max(1, len(km_segments)), 1),
                    message=f"Synthesized {idx + 1}/{len(km_segments)} segments",
                    current_step=idx + 1,
                    total_steps=len(km_segments),
                )
                await self._save_job(job)

            tts_track_wav = work_dir / "tts_track.wav"
            if synthesized_any or not tts_track_wav.exists() or tts_track_wav.stat().st_size == 0:
                # Place each segment at its subtitle time (T4.5) instead of
                # concatenating them back to back, which drifted from the video.
                job.progress = JobProgress(stage="tts", percent=76, message="Aligning speech to subtitle timing...")
                await self._save_job(job)
                placements = await build_synced_track(
                    ffmpeg_bin, km_segments, segment_files, tts_track_wav, work_dir,
                    max_speedup=float(getattr(self.settings, "timesync_max_speedup", DEFAULT_MAX_SPEEDUP)),
                )
                timing = summarize(placements)
                job.progress = JobProgress(
                    stage="tts",
                    percent=78,
                    message=(f"Aligned {timing['segments']} segments: {timing['fit']} fit, "
                             f"{timing['sped_up']} sped up (max {timing['max_tempo']}x), "
                             f"{timing['overflow']} too long for their slot"),
                )
                await self._save_job(job)

            job.tts_time = time.time() - tts_start
            if hasattr(tts_backend, "unload"):
                tts_backend.unload()
            from vishnu_dub.models import ModelManager
            ModelManager.get_instance().release_current_model()

            # Stage 5: Vocal / BGM separation (when enabled and Demucs is available)
            instrumental_path: Optional[Path] = None
            if job.separate_vocals:
                job.progress = JobProgress(stage="separation", percent=80, message="Separating vocals...")
                await self._save_job(job)
                sep_backend = SeparationBackend()
                if sep_backend.is_available():
                    sep_start = time.time()
                    sep_result = await sep_backend.separate(source_audio, work_dir / "stems")
                    job.vocals_path = str(sep_result.vocals_path)
                    job.music_path = str(sep_result.instrumental_path)
                    instrumental_path = sep_result.instrumental_path
                    job.separation_time = time.time() - sep_start
                    ModelManager.get_instance().release_current_model()
                write_checkpoint("separation", completed_tts_segments=len(km_segments))

            # Stage 6: Audio Mixing & Video Assembly
            job.progress = JobProgress(stage="assembly", percent=90, message="Assembling final output...")
            await self._save_job(job)

            mixed_audio = work_dir / "mixed_audio.m4a"
            await AudioMixer.mix(
                vocals_path=tts_track_wav,
                output_path=mixed_audio,
                instrumental_path=instrumental_path,
                ffmpeg_path=ffmpeg_bin,
            )

            if job.compose_video:
                output_mp4 = work_dir / "output.mp4"
                await VideoAssembler.assemble(
                    video_path=source_video,
                    audio_path=mixed_audio,
                    output_path=output_mp4,
                    subtitle_path=km_srt,
                    ffmpeg_path=ffmpeg_bin,
                )
                job.result_path = str(output_mp4)
            else:
                job.result_path = str(mixed_audio)

            from vishnu_dub.quality import write_quality_report
            write_quality_report(work_dir, km_segments, target_language=job.target_language)

            write_checkpoint("completed", completed_tts_segments=len(km_segments))
            job.status = JobStatus.COMPLETED
            job.completed_at = time.time()
            job.total_time = job.completed_at - (job.started_at or job.created_at)
            job.progress = JobProgress(stage="completed", percent=100, message="Completed")

        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            job.completed_at = time.time()
            job.progress = JobProgress(
                stage=job.progress.stage or "failed",
                percent=job.progress.percent,
                message=f"Failed: {e}",
            )

        await self._save_job(job)

    async def run_benchmark(self, duration_seconds: int = 10, tts_sentences: int = 3):
        """Run the real engine benchmark against configured backends."""
        from vishnu_dub.benchmark import run_benchmark as _run_real_benchmark

        return await _run_real_benchmark(
            duration_seconds=duration_seconds,
            tts_sentences=tts_sentences,
            settings=self.settings,
        )

    def get_all_jobs(self) -> List[Any]:
        return list(self.jobs.values())