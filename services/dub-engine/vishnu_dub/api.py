"""Vishnu Dub Engine — FastAPI application with versioned routes."""

import asyncio
import json
import logging
import os
import platform
import re
import subprocess
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import psutil
from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from vishnu_dub.config import get_settings, Settings
from vishnu_dub.jobs import JobManager, JobStatus, JobProgress

logger = logging.getLogger("vishnu_dub.api")


# ─── Models ──────────────────────────────────────────────────────────────


class HardwareProfile(BaseModel):
    cpu_cores: int
    cpu_threads: int
    cpu_avx2: bool
    cpu_avx512: bool
    ram_total_gb: float
    ram_free_gb: float
    gpu_name: Optional[str] = None
    gpu_vram_gb: Optional[float] = None
    cuda_version: Optional[str] = None
    gpu_compute_capability: Optional[str] = None
    disk_free_gb: Dict[str, float] = Field(default_factory=dict)
    tier: str = "T0"
    tier_description: str = ""
    recommended_tts: str = "edge-tts"
    recommended_whisper: str = "faster-whisper-small-int8"
    can_train_lora: bool = False
    voxcpm_mode: str = "cpu"
    recommended_batch_size: int = 1


class DubRequest(BaseModel):
    source_url: str
    source_language: str = "en"
    target_language: str = "km"
    tts_provider: str = "edge-tts"
    tts_voice_id: Optional[str] = None
    tts_style: Optional[str] = None
    tts_speed: float = 1.0
    separate_vocals: bool = True
    bilingual_subtitles: bool = True
    compose_video: bool = True
    llm_base_url: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    auto_clone_speaker: bool = False


class DubResponse(BaseModel):
    job_id: str
    status: str
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: Optional[JobProgress] = None
    result_url: Optional[str] = None
    srt_url: Optional[str] = None
    km_srt_url: Optional[str] = None
    vocals_url: Optional[str] = None
    music_url: Optional[str] = None
    error: Optional[str] = None


class BenchmarkRequest(BaseModel):
    duration_seconds: int = 10
    tts_sentences: int = 3


class BenchmarkResponse(BaseModel):
    asr_time_seconds: float
    translation_time_seconds: float
    tts_time_seconds: float
    separation_time_seconds: float
    total_time_seconds: float
    tier: str


class ResynthesizeSegmentRequest(BaseModel):
    job_id: Optional[str] = None
    segment_index: int = 0
    text: str
    voice_id: Optional[str] = None
    provider: str = "edge-tts"
    speed: float = 1.0
    target_language: str = "km"


class ResynthesizeSegmentResponse(BaseModel):
    ok: bool
    segment_index: int
    audio_url: str
    audio_data_url: Optional[str] = None
    duration: float
    text: str


class VoiceDesignRequest(BaseModel):
    prompt: str
    text: Optional[str] = None
    speed: float = 1.0


class VoiceDesignResponse(BaseModel):
    ok: bool
    audio_url: str
    audio_data_url: Optional[str] = None
    duration: float
    prompt: str


class LoRATrainingRequest(BaseModel):
    train_manifest: str
    val_manifest: Optional[str] = None
    base_model: str = "Mariya987/VoxCPM2"
    lora_rank: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.05
    learning_rate: float = 1e-4
    num_epochs: int = 3
    batch_size: int = 1
    gradient_accumulation_steps: int = 8
    max_length: int = 2048
    save_steps: int = 500
    eval_steps: int = 500
    logging_steps: int = 10
    warmup_steps: int = 100
    output_dir: Optional[str] = None
    seed: int = 42
    amp: bool = True
    use_ref_audio: bool = True


class LoRATrainingResponse(BaseModel):
    ok: bool
    training_id: str
    message: str


class LoRATrainingStatusResponse(BaseModel):
    training_id: str
    status: str
    progress: float
    current_epoch: int
    total_epochs: int
    current_step: int
    total_steps: int
    loss: Optional[float] = None
    eval_loss: Optional[float] = None
    learning_rate: Optional[float] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None


class LoRATrainingListResponse(BaseModel):
    trainings: List[Dict[str, Any]]


class TTSStreamingRequest(BaseModel):
    text: str
    voice_id: str
    provider: Optional[str] = None
    speed: float = 1.0
    reference_audio: Optional[str] = None
    reference_text: Optional[str] = None


class TTSStreamingResponse(BaseModel):
    ok: bool
    message: str


# ─── App State ───────────────────────────────────────────────────────────


settings: Optional[Settings] = None
job_manager: Optional[JobManager] = None


def detect_hardware() -> HardwareProfile:
    """Detect hardware capabilities and assign tier."""
    cpu_cores = psutil.cpu_count(logical=False) or 1
    cpu_threads = psutil.cpu_count(logical=True) or 1
    ram = psutil.virtual_memory()
    ram_total_gb = ram.total / (1024**3)
    ram_free_gb = ram.available / (1024**3)

    # CPU features
    cpu_avx2 = False
    cpu_avx512 = False
    try:
        import cpuinfo
        info = cpuinfo.get_cpu_info()
        flags = info.get("flags", [])
        cpu_avx2 = "avx2" in flags
        cpu_avx512 = any(f.startswith("avx512") for f in flags)
    except Exception:
        pass

    # GPU detection
    gpu_name = None
    gpu_vram_gb = None
    cuda_version = None
    gpu_compute_capability = None

    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            gpu_vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            cuda_version = torch.version.cuda
            gpu_compute_capability = f"{torch.cuda.get_device_properties(0).major}.{torch.cuda.get_device_properties(0).minor}"
    except Exception:
        pass

    if gpu_name is None:
        try:
            import subprocess
            smi = subprocess.run(
                [
                    "nvidia-smi",
                    "--query-gpu=name,memory.total,compute_cap",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if smi.returncode == 0 and smi.stdout.strip():
                first_line = smi.stdout.strip().splitlines()[0]
                parts = [p.strip() for p in first_line.split(",")]
                if len(parts) >= 2:
                    gpu_name = parts[0]
                    gpu_vram_gb = float(parts[1]) / 1024.0
                if len(parts) >= 3 and parts[2]:
                    gpu_compute_capability = parts[2]
        except Exception:
            pass

    # Disk space
    disk_free_gb = {}
    for partition in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            disk_free_gb[partition.device] = usage.free / (1024**3)
        except Exception:
            pass

    # Tier assignment (per ADR-0003 & master-plan §2A)
    tier = "T0"
    tier_description = "Minimal - API-only mode, no local models"
    recommended_tts = "edge-tts"
    recommended_whisper = "openai-whisper-api"
    can_train_lora = False
    voxcpm_mode = "cpu"
    recommended_batch_size = 1

    if gpu_vram_gb is not None and gpu_vram_gb >= 12:
        tier = "T3"
        tier_description = "High - GPU >= 12 GB VRAM, all local models + LoRA training"
        recommended_tts = "voxcpm2"
        recommended_whisper = "faster-whisper-large-v3-turbo-fp16"
        can_train_lora = True
        voxcpm_mode = "cuda"
        recommended_batch_size = 2
    elif gpu_vram_gb is not None and gpu_vram_gb >= 8:
        tier = "T2"
        tier_description = "Mid - GPU 8-12 GB VRAM, local inference + LoRA training"
        recommended_tts = "voxcpm2"
        recommended_whisper = "faster-whisper-large-v3-turbo-int8"
        can_train_lora = True
        voxcpm_mode = "cuda"
        recommended_batch_size = 1
    elif ram_total_gb >= 16:
        tier = "T1"
        tier_description = "Low - GPU < 8 GB or CPU only, RAM >= 16 GB; VoxCPM2 runs on CPU; LoRA training requires T2/T3 GPU >= 8 GB"
        recommended_tts = "edge-tts"
        recommended_whisper = "faster-whisper-small-int8"
        can_train_lora = False
        voxcpm_mode = "cpu"
        recommended_batch_size = 1
    else:
        tier = "T0"
        tier_description = "Minimal - RAM < 16 GB, API-only mode"
        recommended_tts = "edge-tts"
        recommended_whisper = "openai-whisper-api"
        can_train_lora = False
        voxcpm_mode = "remote_only"
        recommended_batch_size = 1

    return HardwareProfile(
        cpu_cores=cpu_cores,
        cpu_threads=cpu_threads,
        cpu_avx2=cpu_avx2,
        cpu_avx512=cpu_avx512,
        ram_total_gb=round(ram_total_gb, 1),
        ram_free_gb=round(ram_free_gb, 1),
        gpu_name=gpu_name,
        gpu_vram_gb=round(gpu_vram_gb, 1) if gpu_vram_gb else None,
        cuda_version=cuda_version,
        gpu_compute_capability=gpu_compute_capability,
        disk_free_gb={k: round(v, 1) for k, v in disk_free_gb.items()},
        tier=tier,
        tier_description=tier_description,
        recommended_tts=recommended_tts,
        recommended_whisper=recommended_whisper,
        can_train_lora=can_train_lora,
        voxcpm_mode=voxcpm_mode,
        recommended_batch_size=recommended_batch_size,
    )


# ─── App Lifecycle ───────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    global settings, job_manager

    settings = Settings()
    get_settings.__globals__["_settings"] = settings

    # Ensure directories exist
    settings.model_store_path.mkdir(parents=True, exist_ok=True)
    settings.jobs_path.mkdir(parents=True, exist_ok=True)

    job_manager = JobManager(settings)
    await job_manager.start()

    yield

    if job_manager:
        await job_manager.stop()


app = FastAPI(
    title="Vishnu Dub Engine",
    version="0.1.0",
    lifespan=lifespan,
)


# ─── Routes ──────────────────────────────────────────────────────────────


@app.get("/v1/hardware", response_model=HardwareProfile)
async def get_hardware():
    """Return hardware profile and assigned tier."""
    return detect_hardware()


@app.get("/v1/hardware/performance")
async def get_hardware_performance():
    """Return detailed hardware diagnostics and performance tier capabilities."""
    profile = detect_hardware()
    return {
        "tier": profile.tier,
        "description": profile.tier_description,
        "can_train_lora": profile.can_train_lora,
        "voxcpm_mode": profile.voxcpm_mode,
        "recommended_batch_size": profile.recommended_batch_size,
        "recommended_tts": profile.recommended_tts,
        "recommended_whisper": profile.recommended_whisper,
        "specs": {
            "cpu": {
                "cores": profile.cpu_cores,
                "threads": profile.cpu_threads,
                "avx2": profile.cpu_avx2,
                "avx512": profile.cpu_avx512,
            },
            "memory": {
                "total_gb": profile.ram_total_gb,
                "free_gb": profile.ram_free_gb,
            },
            "gpu": {
                "name": profile.gpu_name,
                "vram_gb": profile.gpu_vram_gb,
                "compute_capability": profile.gpu_compute_capability,
                "cuda_version": profile.cuda_version,
            },
            "disk": profile.disk_free_gb,
        },
    }


@app.post("/v1/dub", response_model=DubResponse)
async def create_dub_job(request: DubRequest):
    """Submit a new dubbing job."""
    if not job_manager:
        raise HTTPException(503, "Job manager not initialized")

    job_id = str(uuid.uuid4())[:8]
    job = await job_manager.create_job(
        job_id=job_id,
        source_url=request.source_url,
        source_language=request.source_language,
        target_language=request.target_language,
        tts_provider=request.tts_provider,
        tts_voice_id=request.tts_voice_id,
        tts_style=request.tts_style,
        tts_speed=request.tts_speed,
        separate_vocals=request.separate_vocals,
        bilingual_subtitles=request.bilingual_subtitles,
        compose_video=request.compose_video,
        llm_base_url=request.llm_base_url,
        llm_api_key=request.llm_api_key,
        llm_model=request.llm_model,
        auto_clone_speaker=request.auto_clone_speaker,
    )

    return DubResponse(
        job_id=job_id,
        status=job.status.value,
        message="Job created successfully",
    )


@app.get("/v1/dub/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get job status and progress."""
    if not job_manager:
        raise HTTPException(503, "Job manager not initialized")

    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    result_url = None
    srt_url = None
    km_srt_url = None
    vocals_url = None
    music_url = None
    if job.status == JobStatus.COMPLETED:
        if job.result_path:
            result_url = f"/v1/dub/{job_id}/download"
        if job.srt_path:
            srt_url = f"/v1/dub/{job_id}/artifacts/source.srt"
        if job.km_srt_path:
            km_srt_url = f"/v1/dub/{job_id}/artifacts/km.srt"
        if job.vocals_path:
            vocals_url = f"/v1/dub/{job_id}/artifacts/vocals.wav"
        if job.music_path:
            music_url = f"/v1/dub/{job_id}/artifacts/music.wav"

    return JobStatusResponse(
        job_id=job_id,
        status=job.status.value,
        progress=job.progress,
        result_url=result_url,
        srt_url=srt_url,
        km_srt_url=km_srt_url,
        vocals_url=vocals_url,
        music_url=music_url,
        error=job.error,
    )


@app.get("/v1/dub/{job_id}/progress")
async def get_job_progress(job_id: str, request: Request):
    """SSE endpoint for real-time job progress."""
    if not job_manager:
        raise HTTPException(503, "Job manager not initialized")

    job = await job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    async def event_generator():
        last_progress = None
        while True:
            job = await job_manager.get_job(job_id)
            if not job:
                break

            if job.progress != last_progress:
                yield f"data: {job.progress.model_dump_json()}\n\n"
                last_progress = job.progress

            if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/v1/benchmark", response_model=BenchmarkResponse)
async def run_benchmark(request: BenchmarkRequest):
    """Run a quick benchmark: 10s ASR + 3 TTS sentences."""
    if not job_manager:
        raise HTTPException(503, "Job manager not initialized")

    hardware = detect_hardware()
    benchmark_job = await job_manager.run_benchmark(
        duration_seconds=request.duration_seconds,
        tts_sentences=request.tts_sentences,
    )

    return BenchmarkResponse(
        asr_time_seconds=benchmark_job.asr_time,
        translation_time_seconds=benchmark_job.translation_time,
        tts_time_seconds=benchmark_job.tts_time,
        separation_time_seconds=benchmark_job.separation_time,
        total_time_seconds=benchmark_job.total_time,
        tier=hardware.tier,
    )


@app.post("/v1/dub/resynthesize-segment", response_model=ResynthesizeSegmentResponse)
@app.post("/v1/dub/{job_id}/resynthesize-segment", response_model=ResynthesizeSegmentResponse)
async def resynthesize_segment(request: ResynthesizeSegmentRequest, job_id: Optional[str] = None):
    """Re-synthesize speech for a single segment (per-segment dub review editor)."""
    target_job_id = job_id or request.job_id
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(400, "Text is required for re-synthesis")

    from vishnu_dub.tts import get_tts_backend

    tts_backend = get_tts_backend(request.provider)
    voice = request.voice_id
    if not voice:
        lang_lower = (request.target_language or "km").strip().lower()
        is_khmer = (
            lang_lower.startswith("km")
            or "khmer" in lang_lower
            or "高棉" in lang_lower
            or any("\u1780" <= c <= "\u17ff" for c in text)
        )
        voice = "km-KH-PisethNeural" if is_khmer else "en-US-AndrewMultilingualNeural"

    safe_job_id = Path(target_job_id).name if target_job_id else "segment_cache"
    cache_dir = Path(settings.jobs_path if settings else "jobs") / safe_job_id
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_file = cache_dir / f"seg_{request.segment_index}_{uuid.uuid4().hex[:8]}.mp3"

    tts_result = await tts_backend.synthesize(
        text=text,
        voice_id=voice,
        output_path=out_file,
        speed=request.speed,
    )

    audio_data_url = None
    if out_file.exists():
        import base64
        audio_bytes = out_file.read_bytes()
        audio_data_url = f"data:audio/mp3;base64,{base64.b64encode(audio_bytes).decode('ascii')}"

    audio_url = f"/v1/dub/{safe_job_id}/artifacts/{out_file.name}"

    return ResynthesizeSegmentResponse(
        ok=True,
        segment_index=request.segment_index,
        audio_url=audio_url,
        audio_data_url=audio_data_url,
        duration=tts_result.duration,
        text=text,
    )


@app.post("/v1/tts/design-voice", response_model=VoiceDesignResponse)
async def design_voice(request: VoiceDesignRequest):
    """Design a voice from a text description (zero-shot voice design)."""
    prompt = (request.prompt or "").strip()
    if not prompt:
        raise HTTPException(400, "Prompt is required for voice design")

    from vishnu_dub.tts import get_tts_backend

    tts_backend = get_tts_backend("voxcpm2")
    if not hasattr(tts_backend, "design_voice"):
        raise HTTPException(501, "Voice design not supported by this TTS backend")

    safe_prompt = re.sub(r'[^\w\s-]', '_', prompt).strip()[:40] or "voice"
    cache_dir = Path(settings.jobs_path if settings else "jobs") / "voice_designs" / safe_prompt
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_file = cache_dir / f"design_{uuid.uuid4().hex[:8]}.wav"

    tts_result = await tts_backend.design_voice(
        prompt=prompt,
        output_path=out_file,
        text=request.text,
        speed=request.speed,
    )

    audio_data_url = None
    if out_file.exists():
        import base64
        audio_bytes = out_file.read_bytes()
        audio_data_url = f"data:audio/wav;base64,{base64.b64encode(audio_bytes).decode('ascii')}"

    audio_url = f"/v1/tts/artifacts/{out_file.name}"

    # Auto-write metadata.json in voice design folder
    meta = {
        "id": safe_prompt,
        "name": prompt,
        "prompt": prompt,
        "duration": tts_result.duration,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "audioUrl": audio_url,
        "consent": True,
    }
    (cache_dir / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    return VoiceDesignResponse(
        ok=True,
        audio_url=audio_url,
        audio_data_url=audio_data_url,
        duration=tts_result.duration,
        prompt=prompt,
    )


@app.post("/v1/tts/stream", response_class=StreamingResponse)
async def stream_tts(request: TTSStreamingRequest):
    """Stream TTS audio chunks as they are generated."""
    if not request.text.strip():
        raise HTTPException(400, "Text is required for streaming TTS")

    from vishnu_dub.tts import get_tts_backend

    provider = (
        request.provider
        or ("voxcpm2" if request.voice_id in ("clone", "design") or request.reference_audio else "edge-tts")
    )
    tts_backend = get_tts_backend(provider)
    if not hasattr(tts_backend, "synthesize_streaming"):
        raise HTTPException(501, f"Streaming TTS not supported by {provider} backend")

    reference_audio = Path(request.reference_audio) if request.reference_audio else None
    reference_text = request.reference_text

    async def audio_generator():
        async for chunk in tts_backend.synthesize_streaming(
            text=request.text,
            voice_id=request.voice_id,
            speed=request.speed,
            reference_audio=reference_audio,
            reference_text=reference_text,
        ):
            yield chunk

    media_type = "audio/mpeg" if provider in ("edge-tts", "openai") else "audio/wav"
    ext = "mp3" if media_type == "audio/mpeg" else "wav"
    return StreamingResponse(
        audio_generator(),
        media_type=media_type,
        headers={
            "Content-Disposition": f"inline; filename=stream.{ext}",
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/v1/tts/voices/list")
async def list_voice_designs():
    """List all saved voice designs."""
    base_jobs_dir = Path(settings.jobs_path if settings else "jobs").resolve()
    voice_designs_dir = base_jobs_dir / "voice_designs"
    
    voices = []
    if voice_designs_dir.exists():
        for design_dir in voice_designs_dir.iterdir():
            if not design_dir.is_dir():
                continue

            meta_file = design_dir / "metadata.json"
            if meta_file.exists():
                try:
                    loaded = json.loads(meta_file.read_text(encoding="utf-8"))
                    if isinstance(loaded, dict) and loaded.get("id"):
                        voices.append(loaded)
                        continue
                except Exception:
                    pass
            
            # Find audio file
            audio_file = None
            for f in design_dir.iterdir():
                if f.suffix in ('.wav', '.mp3'):
                    audio_file = f
                    break
            
            if not audio_file:
                continue
            
            metadata = {
                "id": design_dir.name,
                "name": design_dir.name,
                "prompt": design_dir.name,
                "duration": 0.0,
                "createdAt": datetime.fromtimestamp(design_dir.stat().st_ctime, tz=timezone.utc).isoformat(),
                "audioUrl": f"/v1/tts/artifacts/{audio_file.name}",
                "consent": True,
            }
            
            try:
                import soundfile as sf
                info = sf.info(str(audio_file))
                metadata["duration"] = info.duration
            except Exception:
                pass
            
            voices.append(metadata)

    # Include built-in sample/default voices if not already overridden by custom voices
    existing_ids = {v["id"] for v in voices}
    sample_dir = Path(__file__).resolve().parent / "data" / "sample_voices"
    if sample_dir.exists():
        for sub_dir in sample_dir.iterdir():
            if sub_dir.is_dir() and sub_dir.name not in existing_ids:
                meta_path = sub_dir / "metadata.json"
                if meta_path.exists():
                    try:
                        s_meta = json.loads(meta_path.read_text(encoding="utf-8"))
                        if isinstance(s_meta, dict) and s_meta.get("id"):
                            voices.append(s_meta)
                    except Exception:
                        pass
    
    return {"voices": voices}


@app.post("/v1/tts/voices/save")
async def save_voice_design(prompt: str = Body(...), consent: bool = Body(...)):
    """Save a voice design to the library."""
    if not consent:
        raise HTTPException(400, "Consent is required to save voice design")
    
    clean_prompt = prompt.strip()
    safe_prompt = re.sub(r'[^\w\s-]', '_', clean_prompt).strip()[:40] or "voice"
    base_jobs_dir = Path(settings.jobs_path if settings else "jobs").resolve()
    cache_dir = base_jobs_dir / "voice_designs" / safe_prompt
    cache_dir.mkdir(parents=True, exist_ok=True)

    audio_file = None
    for f in cache_dir.iterdir():
        if f.suffix in ('.wav', '.mp3'):
            audio_file = f
            break

    duration = 0.0
    if audio_file:
        try:
            import soundfile as sf
            info = sf.info(str(audio_file))
            duration = info.duration
        except Exception:
            pass

    created_at = datetime.now(timezone.utc).isoformat()
    audio_url = f"/v1/tts/artifacts/{audio_file.name}" if audio_file else ""
    metadata = {
        "id": safe_prompt,
        "name": clean_prompt,
        "prompt": clean_prompt,
        "duration": duration,
        "createdAt": created_at,
        "audioUrl": audio_url,
        "consent": True,
    }

    meta_file = cache_dir / "metadata.json"
    meta_file.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    return metadata


@app.post("/v1/tts/voices/delete")
async def delete_voice_design(voice_id: str = Body(..., embed=True)):
    """Delete a voice design from the library."""
    base_jobs_dir = Path(settings.jobs_path if settings else "jobs").resolve()
    voice_dir = (base_jobs_dir / "voice_designs" / voice_id).resolve()
    
    try:
        if voice_dir.is_relative_to(base_jobs_dir / "voice_designs") and voice_dir.exists():
            import shutil
            shutil.rmtree(voice_dir)
            return {"ok": True}
        else:
            raise HTTPException(404, "Voice design not found")
    except (ValueError, RuntimeError):
        raise HTTPException(404, "Voice design not found")


@app.post("/v1/tts/voices/preview")
async def preview_voice_design(voice_id: str = Body(..., embed=True)):
    """Preview a saved voice design."""
    base_jobs_dir = Path(settings.jobs_path if settings else "jobs").resolve()
    voice_dir = (base_jobs_dir / "voice_designs" / voice_id).resolve()
    
    found_dir = None
    try:
        if voice_dir.is_relative_to(base_jobs_dir / "voice_designs") and voice_dir.exists() and voice_dir.is_dir():
            found_dir = voice_dir
    except (ValueError, RuntimeError):
        pass

    if not found_dir:
        sample_dir = (Path(__file__).resolve().parent / "data" / "sample_voices" / voice_id).resolve()
        if sample_dir.exists() and sample_dir.is_dir():
            found_dir = sample_dir

    if not found_dir:
        raise HTTPException(404, "Voice design not found")
    
    # Find audio file
    audio_file = None
    for f in found_dir.iterdir():
        if f.suffix in ('.wav', '.mp3'):
            audio_file = f
            break
    
    if not audio_file:
        raise HTTPException(404, "Voice design audio not found")
    
    media_type = "audio/mpeg" if audio_file.suffix == ".mp3" else "audio/wav"
    return FileResponse(
        audio_file,
        media_type=media_type,
        filename=audio_file.name,
    )


class VoiceImportRequest(BaseModel):
    name: str
    prompt: Optional[str] = None
    audio_data: str  # Base64 encoded audio
    consent: bool = True
    lora_weights_base64: Optional[str] = None


@app.post("/v1/tts/voices/export")
async def export_voice_design(voice_id: str = Body(..., embed=True)):
    """Export a voice design bundle as a portable zip archive."""
    base_jobs_dir = Path(settings.jobs_path if settings else "jobs").resolve()
    voice_dir = (base_jobs_dir / "voice_designs" / voice_id).resolve()

    found_dir = None
    try:
        if voice_dir.is_relative_to(base_jobs_dir / "voice_designs") and voice_dir.exists() and voice_dir.is_dir():
            found_dir = voice_dir
    except (ValueError, RuntimeError):
        pass

    if not found_dir:
        sample_dir = (Path(__file__).resolve().parent / "data" / "sample_voices" / voice_id).resolve()
        if sample_dir.exists() and sample_dir.is_dir():
            found_dir = sample_dir

    if not found_dir:
        raise HTTPException(404, f"Voice design '{voice_id}' not found")

    import zipfile
    export_filename = f"voice_export_{voice_id}.zip"
    (base_jobs_dir / "voice_designs").mkdir(parents=True, exist_ok=True)
    export_path = base_jobs_dir / "voice_designs" / export_filename

    with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for item in found_dir.rglob("*"):
            if item.is_file():
                zf.write(item, arcname=item.relative_to(found_dir))

    return {
        "ok": True,
        "voice_id": voice_id,
        "filename": export_filename,
        "export_url": f"/v1/tts/artifacts/{export_filename}",
    }


@app.post("/v1/tts/voices/import")
async def import_voice_design(request: VoiceImportRequest):
    """Import a voice design bundle into the voice library."""
    if not request.consent:
        raise HTTPException(400, "Consent is required to import voice design")

    import base64
    import io
    import soundfile as sf

    clean_name = request.name.strip()
    if not clean_name:
        raise HTTPException(400, "Voice name is required")

    safe_id = re.sub(r'[\s\W]+', '_', clean_name).strip('_')[:40] or f"voice_{uuid.uuid4().hex[:6]}"
    base_jobs_dir = Path(settings.jobs_path if settings else "jobs").resolve()
    dest_dir = base_jobs_dir / "voice_designs" / safe_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    try:
        audio_bytes = base64.b64decode(request.audio_data.split(",")[-1])
    except Exception as e:
        raise HTTPException(400, f"Invalid base64 audio data: {e}")

    try:
        with io.BytesIO(audio_bytes) as bio:
            info = sf.info(bio)
            duration = float(info.duration)
    except Exception as e:
        raise HTTPException(400, f"Invalid audio stream: {e}")

    audio_file = dest_dir / f"{safe_id}.wav"
    audio_file.write_bytes(audio_bytes)

    if request.lora_weights_base64:
        try:
            lora_bytes = base64.b64decode(request.lora_weights_base64.split(",")[-1])
            (dest_dir / "lora_weights.ckpt").write_bytes(lora_bytes)
        except Exception:
            pass

    created_at = datetime.now(timezone.utc).isoformat()
    metadata = {
        "id": safe_id,
        "name": clean_name,
        "prompt": request.prompt or clean_name,
        "duration": duration,
        "createdAt": created_at,
        "audioUrl": f"/v1/tts/artifacts/{audio_file.name}",
        "consent": True,
    }
    (dest_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    return metadata


@app.get("/v1/dub/{job_id}/download")
async def download_result(job_id: str):
    """Download the completed dubbing result (MP4)."""
    if not job_manager:
        raise HTTPException(503, "Job manager not initialized")

    job = await job_manager.get_job(job_id)
    if not job or job.status != JobStatus.COMPLETED or not job.result_path:
        raise HTTPException(404, "Result not found")

    return FileResponse(
        job.result_path,
        media_type="video/mp4",
        filename=f"dub_{job_id}.mp4",
    )


@app.get("/v1/dub/{job_id}/artifacts/{filename}")
async def download_artifact(job_id: str, filename: str):
    """Download a specific artifact (SRT, stems, resynthesized audio, etc.)."""
    safe_job_id = Path(job_id).name
    safe_filename = Path(filename).name

    path = None
    if job_manager:
        job = await job_manager.get_job(safe_job_id)
        if job:
            artifact_map = {
                "source.srt": job.srt_path,
                "km.srt": job.km_srt_path,
                "vocals.wav": job.vocals_path,
                "music.wav": job.music_path,
            }
            path = artifact_map.get(safe_filename)

    if not path:
        base_jobs_dir = Path(settings.jobs_path if settings else "jobs").resolve()
        custom_candidate = (base_jobs_dir / safe_job_id / safe_filename).resolve()
        try:
            if custom_candidate.is_relative_to(base_jobs_dir) and custom_candidate.exists() and custom_candidate.is_file():
                path = str(custom_candidate)
        except (ValueError, RuntimeError):
            pass

    if not path:
        raise HTTPException(404, f"Artifact '{safe_filename}' not available for this job")

    if safe_filename.endswith(".srt"):
        media_type = "text/plain; charset=utf-8"
    elif safe_filename.endswith(".mp3"):
        media_type = "audio/mpeg"
    elif safe_filename.endswith(".json"):
        media_type = "application/json"
    else:
        media_type = "audio/wav"

    return FileResponse(
        path,
        media_type=media_type,
        filename=safe_filename,
    )


# ─── LoRA Training Endpoints ──────────────────────────────────────────
# The training package is imported lazily inside the handlers so the engine
# still starts when training dependencies are unavailable (see T5.5).

# In-memory storage for training jobs (in production, use persistent storage)
_training_jobs: Dict[str, Dict[str, Any]] = {}


@app.post("/v1/lora/train", response_model=LoRATrainingResponse)
async def start_lora_training(request: LoRATrainingRequest):
    """Start a LoRA fine-tuning training job."""
    # Enforce hardware tier check before starting (LoRA requires T2/T3 GPU >= 8 GB VRAM)
    try:
        from vishnu_dub.training.lora_training import check_hardware_requirements
        hw_ok, hw_msg = check_hardware_requirements()
        if not hw_ok:
            raise HTTPException(400, f"Cannot start LoRA training: {hw_msg}")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Failed to run hardware check for LoRA training: %s", e)

    import os
    import yaml
    import tempfile
    
    training_id = str(uuid.uuid4())[:8]
    
    # Prepare output directory
    if request.output_dir:
        output_dir = Path(request.output_dir)
    else:
        output_dir = Path(settings.jobs_path if settings else "jobs") / "lora_trainings" / training_id
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Save training config
    config = {
        "train_manifest": request.train_manifest,
        "val_manifest": request.val_manifest,
        "base_model": request.base_model,
        "lora_rank": request.lora_rank,
        "lora_alpha": request.lora_alpha,
        "lora_dropout": request.lora_dropout,
        "learning_rate": request.learning_rate,
        "num_epochs": request.num_epochs,
        "batch_size": request.batch_size,
        "gradient_accumulation_steps": request.gradient_accumulation_steps,
        "max_length": request.max_length,
        "save_steps": request.save_steps,
        "eval_steps": request.eval_steps,
        "logging_steps": request.logging_steps,
        "warmup_steps": request.warmup_steps,
        "seed": request.seed,
        "amp": request.amp,
        "use_ref_audio": request.use_ref_audio,
    }
    config_path = output_dir / "training_config.yml"
    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(config, f)
    
    # Initialize training job record
    _training_jobs[training_id] = {
        "id": training_id,
        "config": config,
        "status": "starting",
        "progress": 0.0,
        "current_epoch": 0,
        "total_epochs": request.num_epochs,
        "current_step": 0,
        "total_steps": 0,
        "loss": None,
        "eval_loss": None,
        "learning_rate": None,
        "started_at": datetime.utcnow().isoformat() + "Z",
        "completed_at": None,
        "error": None,
        "output_dir": str(output_dir),
    }
    
    # Start training in background
    asyncio.create_task(run_lora_training_background(training_id, config, output_dir))
    
    return LoRATrainingResponse(
        ok=True,
        training_id=training_id,
        message=f"LoRA training started. Check status with GET /v1/lora/trainings/{training_id}",
    )


async def run_lora_training_background(training_id: str, config: Dict[str, Any], output_dir: Path):
    """Run LoRA training in background."""
    try:
        _training_jobs[training_id]["status"] = "running"
        
        # Import training module
        from vishnu_dub.training import run_lora_training
        
        # Run training
        await run_lora_training(
            training_id=training_id,
            config=config,
            output_dir=output_dir,
            progress_callback=lambda status: update_training_status(training_id, status),
        )
        
        _training_jobs[training_id]["status"] = "completed"
        _training_jobs[training_id]["progress"] = 100.0
        _training_jobs[training_id]["completed_at"] = datetime.utcnow().isoformat() + "Z"
    except Exception as e:
        _training_jobs[training_id]["status"] = "failed"
        _training_jobs[training_id]["error"] = str(e)
        _training_jobs[training_id]["completed_at"] = datetime.utcnow().isoformat() + "Z"

def update_training_status(training_id: str, status: Dict[str, Any]):
    """Update training job status."""
    if training_id in _training_jobs:
        _training_jobs[training_id].update(status)


@app.get("/v1/lora/trainings", response_model=LoRATrainingListResponse)
async def list_lora_trainings():
    """List all LoRA training jobs."""
    trainings = []
    for training_id, job in _training_jobs.items():
        trainings.append({
            "id": training_id,
            "status": job["status"],
            "progress": job["progress"],
            "current_epoch": job["current_epoch"],
            "total_epochs": job["total_epochs"],
            "current_step": job["current_step"],
            "total_steps": job["total_steps"],
            "loss": job["loss"],
            "eval_loss": job["eval_loss"],
            "learning_rate": job["learning_rate"],
            "started_at": job["started_at"],
            "completed_at": job["completed_at"],
            "error": job["error"],
        })
    return LoRATrainingListResponse(trainings=trainings)


@app.get("/v1/lora/trainings/{training_id}", response_model=LoRATrainingStatusResponse)
async def get_lora_training_status(training_id: str):
    """Get the status of a specific LoRA training job."""
    if training_id not in _training_jobs:
        raise HTTPException(404, f"Training job {training_id} not found")
    
    job = _training_jobs[training_id]
    return LoRATrainingStatusResponse(
        training_id=training_id,
        status=job["status"],
        progress=job["progress"],
        current_epoch=job["current_epoch"],
        total_epochs=job["total_epochs"],
        current_step=job["current_step"],
        total_steps=job["total_steps"],
        loss=job["loss"],
        eval_loss=job["eval_loss"],
        learning_rate=job["learning_rate"],
        started_at=job["started_at"],
        completed_at=job["completed_at"],
        error=job["error"],
    )


@app.delete("/v1/lora/trainings/{training_id}")
async def delete_lora_training(training_id: str):
    """Delete a LoRA training job and its outputs."""
    if training_id not in _training_jobs:
        raise HTTPException(404, f"Training job {training_id} not found")
    
    job = _training_jobs[training_id]
    output_dir = Path(job["output_dir"])
    
    # Remove output directory
    import shutil
    if output_dir.exists():
        shutil.rmtree(output_dir)
    
    del _training_jobs[training_id]
    return {"ok": True, "message": f"Training {training_id} deleted"}


@app.post("/v1/lora/validate-manifest")
async def validate_training_manifest(request: Dict[str, Any]):
    """Validate a training manifest file."""
    try:
        from vishnu_dub.training.validate import validate_manifest
    except ImportError as e:
        raise HTTPException(503, f"LoRA training is unavailable: {e}")

    manifest_path = request.get("manifest_path", "")
    if not manifest_path:
        raise HTTPException(400, "manifest_path is required")
    
    max_samples = request.get("max_samples", 0)
    verbose = request.get("verbose", False)
    
    result = validate_manifest(manifest_path, max_samples=max_samples, verbose=verbose)
    
    return {
        "valid": result.is_valid,
        "total_samples": result.total_samples,
        "valid_samples": result.valid_samples,
        "has_ref_audio": result.has_ref_audio,
        "errors": result.errors,
        "warnings": result.warnings,
        "audio_durations": result.audio_durations,
        "text_lengths": result.text_lengths,
    }


@app.get("/v1/tts/artifacts/{filename}")
async def download_voice_design_artifact(filename: str):
    """Download a voice design artifact."""
    safe_filename = Path(filename).name
    base_jobs_dir = Path(settings.jobs_path if settings else "jobs").resolve()
    voice_designs_dir = base_jobs_dir / "voice_designs"

    path = None
    custom_candidate = (voice_designs_dir / safe_filename).resolve()
    try:
        if custom_candidate.is_relative_to(base_jobs_dir) and custom_candidate.exists() and custom_candidate.is_file():
            path = str(custom_candidate)
        elif voice_designs_dir.exists():
            for sub in voice_designs_dir.iterdir():
                if sub.is_dir():
                    cand = (sub / safe_filename).resolve()
                    if cand.is_relative_to(base_jobs_dir) and cand.exists() and cand.is_file():
                        path = str(cand)
                        break
    except (ValueError, RuntimeError):
        path = None

    if not path:
        # Check built-in sample voices
        sample_voices_dir = (Path(__file__).resolve().parent / "data" / "sample_voices").resolve()
        if sample_voices_dir.exists():
            direct_sample = (sample_voices_dir / safe_filename).resolve()
            try:
                if direct_sample.is_relative_to(sample_voices_dir) and direct_sample.exists() and direct_sample.is_file():
                    path = str(direct_sample)
                else:
                    for sub in sample_voices_dir.iterdir():
                        if sub.is_dir():
                            sub_cand = (sub / safe_filename).resolve()
                            if sub_cand.is_relative_to(sample_voices_dir) and sub_cand.exists() and sub_cand.is_file():
                                path = str(sub_cand)
                                break
            except (ValueError, RuntimeError):
                pass

    if not path:
        raise HTTPException(404, f"Voice design artifact '{safe_filename}' not found")

    media_type = "audio/mpeg" if safe_filename.endswith(".mp3") else ("application/zip" if safe_filename.endswith(".zip") else "audio/wav")
    return FileResponse(
        path,
        media_type=media_type,
        filename=safe_filename,
    )


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}


# ─── Main ────────────────────────────────────────────────────────────────


def main():
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)


if __name__ == "__main__":
    main()