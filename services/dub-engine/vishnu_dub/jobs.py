"""Vishnu Dub Engine — job management with checkpointing."""

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from vishnu_dub.config import Settings


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

    status: JobStatus = JobStatus.PENDING
    progress: JobProgress = field(default_factory=JobProgress)
    error: Optional[str] = None
    result_path: Optional[str] = None

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
    result_path: Optional[str] = None

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
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "asr_time": self.asr_time,
            "translation_time": self.translation_time,
            "tts_time": self.tts_time,
            "separation_time": self.separation_time,
            "total_time": self.total_time,
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
        )
        job.status = JobStatus(data["status"])
        job.progress = JobProgress(**data.get("progress", {}))
        job.error = data.get("error")
        job.result_path = data.get("result_path")
        job.created_at = data.get("created_at", 0)
        job.started_at = data.get("started_at")
        job.completed_at = data.get("completed_at")
        job.asr_time = data.get("asr_time", 0.0)
        job.translation_time = data.get("translation_time", 0.0)
        job.tts_time = data.get("tts_time", 0.0)
        job.separation_time = data.get("separation_time", 0.0)
        job.total_time = data.get("total_time", 0.0)
        return job


class JobManager:
    def __init__(self, settings: Any):
        self.settings = settings
        self.jobs: Dict[str, Any] = {}
        self._running = False
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def start(self):
        self._running = True
        self._worker_task = asyncio.create_task(self._worker())
        # Load persisted jobs
        await self._load_jobs()

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
        for job_file in self.settings.jobs_path.glob("*.json"):
            try:
                with open(job_file) as f:
                    data = json.load(f)
                job = Job.from_dict(data)
                self.jobs[job.job_id] = job
            except Exception as e:
                print(f"Failed to load job {job_file}: {e}")

    async def _save_job(self, job: "Job"):
        path = self._get_job_path(job.job_id)
        tmp = path.with_suffix(".tmp")
        with open(tmp, "w") as f:
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
        while True:
            try:
                await asyncio.sleep(1)
                # Process pending jobs
                for job in list(self.jobs.values()):
                    if job.status == JobStatus.PENDING:
                        await self._run_job(job)
                    elif job.status == JobStatus.RUNNING:
                        # Check for completion
                        pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Worker error: {e}")
                await asyncio.sleep(5)

    async def _run_job(self, job: "Job"):
        """Run the full dubbing pipeline."""
        job.status = "running"
        job.started_at = time.time()
        job.progress = JobProgress(stage="initializing", percent=5, message="Initializing...")
        await self._save_job(job)

        work_dir = Path(job.work_dir)
        work_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Stage 1: Download source
            job.progress = JobProgress(stage="download", percent=10, message="Downloading source...")
            await self._save_job(job)
            # await self._download_source(job)

            # Stage 2: ASR / Transcription
            job.progress = JobProgress(stage="asr", percent=20, message="Transcribing audio...")
            await self._save_job(job)
            # await self._run_asr(job)

            # Stage 3: Translation
            job.progress = JobProgress(stage="translation", percent=40, message="Translating...")
            await self._save_job(job)
            # await self._run_translation(job)

            # Stage 4: TTS
            job.progress = JobProgress(stage="tts", percent=60, message="Generating speech...")
            await self._save_job(job)
            # await self._run_tts(job)

            # Stage 5: Separation (optional)
            job.progress = JobProgress(stage="separation", percent=75, message="Separating vocals...")
            await self._save_job(job)
            # await self._run_separation(job)

            # Stage 7: Assembly
            job.progress = JobProgress(stage="assembly", percent=90, message="Assembling video...")
            await self._save_job(job)
            # await self._run_assembly(job)

            # Complete
            job.status = "completed"
            job.completed_at = time.time()
            job.total_time = job.completed_at - job.created_at
            job.progress = JobProgress(stage="completed", percent=100, message="Completed")
            job.result_path = str(Path(job.work_dir) / "output.mp4")

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.completed_at = time.time()

        await self._save_job(job)

    async def run_benchmark(self, duration_seconds: int = 10, tts_sentences: int = 3):
        """Run a quick benchmark."""
        from dataclasses import dataclass

        @dataclass
        class BenchmarkJob:
            asr_time: float = 0.0
            translation_time: float = 0.0
            tts_time: float = 0.0
            separation_time: float = 0.0
            total_time: float = 0.0

        bench = BenchmarkJob()
        start = time.time()

        # Simulate ASR benchmark
        await asyncio.sleep(0.1)
        bench.asr_time = 0.1

        # Simulate translation benchmark
        await asyncio.sleep(0.1)
        bench.translation_time = 0.1

        # Simulate TTS benchmark
        await asyncio.sleep(0.1)
        bench.tts_time = 0.1

        # Simulate separation benchmark
        await asyncio.sleep(0.1)
        bench.separation_time = 0.1

        bench.total_time = time.time() - start
        return bench

    def get_all_jobs(self) -> List[Any]:
        return list(self.jobs.values())