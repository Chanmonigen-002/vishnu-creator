"""Unit and integration tests for VoxCPM2 48 kHz backend and Voice Design (T5.1, T5.2)."""

import asyncio
import json
import numpy as np
import pytest
import soundfile as sf
from pathlib import Path
from unittest.mock import MagicMock, patch

from vishnu_dub.tts import VoxCPM2Backend, TTSResult
from vishnu_dub.api import app
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def temp_wav(tmp_path: Path) -> Path:
    """Generate a valid 48 kHz test reference WAV file."""
    wav_path = tmp_path / "reference.wav"
    t = np.linspace(0, 2.0, int(48000 * 2.0), endpoint=False, dtype=np.float32)
    carrier = 0.3 * np.sin(2 * np.pi * 440.0 * t)
    sf.write(str(wav_path), carrier, 48000)
    return wav_path


class FakeVoxCPMModel:
    """Fake model mimicking VoxCPM2 generator API for fast deterministic testing."""

    def __init__(self, sample_rate: int = 48000):
        self.sample_rate = sample_rate
        self.last_call_kwargs = {}

    def generate(self, **kwargs) -> np.ndarray:
        self.last_call_kwargs = kwargs
        # Generate 1.5 seconds of 48 kHz audio
        samples = int(self.sample_rate * 1.5)
        t = np.linspace(0, 1.5, samples, endpoint=False, dtype=np.float32)
        return 0.25 * np.sin(2 * np.pi * 300.0 * t)

    def generate_streaming(self, **kwargs):
        self.last_call_kwargs = kwargs
        # Yield 3 chunks of 0.5s audio each
        chunk_samples = int(self.sample_rate * 0.5)
        t = np.linspace(0, 0.5, chunk_samples, endpoint=False, dtype=np.float32)
        chunk = 0.25 * np.sin(2 * np.pi * 300.0 * t)
        for _ in range(3):
            yield chunk


def test_voxcpm2_backend_properties():
    backend = VoxCPM2Backend()
    assert backend.name == "voxcpm2"
    assert backend.SAMPLE_RATE == 48000
    voices = backend.get_voices()
    assert any(v["id"] == "clone" for v in voices)
    assert any(v["id"] == "design" for v in voices)


def test_voxcpm2_device_resolution_t1_defaults_to_cpu(monkeypatch):
    backend = VoxCPM2Backend(device="auto")
    
    # Mock torch.cuda with 2.0 GB VRAM (T1 GT 1030)
    mock_props = MagicMock()
    mock_props.total_memory = int(2.0 * 1024 ** 3)

    mock_torch = MagicMock()
    mock_torch.cuda.is_available.return_value = True
    mock_torch.cuda.get_device_properties.return_value = mock_props
    monkeypatch.setattr("torch.cuda.is_available", lambda: True)
    monkeypatch.setattr("torch.cuda.get_device_properties", lambda _: mock_props)

    resolved = backend._resolve_device()
    assert resolved == "cpu", "T1 hardware with < 8GB VRAM must safely default to CPU to prevent OOM"


def test_voxcpm2_device_resolution_t2_t3_uses_cuda(monkeypatch):
    backend = VoxCPM2Backend(device="auto")
    
    # Mock torch.cuda with 16.0 GB VRAM (T2/T3)
    mock_props = MagicMock()
    mock_props.total_memory = int(16.0 * 1024 ** 3)

    monkeypatch.setattr("torch.cuda.is_available", lambda: True)
    monkeypatch.setattr("torch.cuda.get_device_properties", lambda _: mock_props)

    resolved = backend._resolve_device()
    assert resolved == "cuda", "Hardware with >= 8GB VRAM should utilize CUDA"


def test_voxcpm2_model_path_resolution_default():
    backend = VoxCPM2Backend()
    assert backend._resolve_model_path() == "openbmb/VoxCPM2"


@pytest.mark.asyncio
async def test_voxcpm2_design_voice_48k(tmp_path: Path):
    backend = VoxCPM2Backend()
    fake_model = FakeVoxCPMModel()
    backend._model = fake_model

    out_file = tmp_path / "voice_design_output.wav"
    prompt = "warm Khmer female narrator, 30s"
    custom_text = "សួស្តីបងប្អូនទាំងអស់គ្នា"

    res = await backend.design_voice(
        prompt=prompt,
        output_path=out_file,
        text=custom_text,
        speed=1.0,
    )

    assert out_file.exists()
    assert res.provider == "voxcpm2"
    assert res.format == "wav"
    assert res.duration == pytest.approx(1.5, rel=1e-2)

    # Verify control instruction format
    assert fake_model.last_call_kwargs["text"] == f"({prompt}){custom_text}"
    assert fake_model.last_call_kwargs["reference_wav_path"] is None

    # Verify native 48 kHz audio header
    info = sf.info(str(out_file))
    assert info.samplerate == 48000
    assert info.channels == 1


@pytest.mark.asyncio
async def test_voxcpm2_zero_shot_clone_48k(tmp_path: Path, temp_wav: Path):
    backend = VoxCPM2Backend()
    fake_model = FakeVoxCPMModel()
    backend._model = fake_model

    out_file = tmp_path / "zero_shot_clone.wav"
    res = await backend.synthesize(
        text="ជំរាបសួរ",
        voice_id="clone",
        output_path=out_file,
        reference_audio=temp_wav,
    )

    assert out_file.exists()
    assert fake_model.last_call_kwargs["reference_wav_path"] == str(temp_wav)
    assert fake_model.last_call_kwargs["prompt_wav_path"] is None
    assert fake_model.last_call_kwargs["prompt_text"] is None

    info = sf.info(str(out_file))
    assert info.samplerate == 48000
    assert res.duration == pytest.approx(1.5, rel=1e-2)


@pytest.mark.asyncio
async def test_voxcpm2_ultimate_clone_48k(tmp_path: Path, temp_wav: Path):
    backend = VoxCPM2Backend()
    fake_model = FakeVoxCPMModel()
    backend._model = fake_model

    out_file = tmp_path / "ultimate_clone.wav"
    transcript = "Hello world from original speaker"

    res = await backend.synthesize(
        text="ជំរាបសួរ",
        voice_id="clone",
        output_path=out_file,
        reference_audio=temp_wav,
        reference_text=transcript,
    )

    assert out_file.exists()
    # Ultimate clone pairs reference audio with transcript for continuation
    assert fake_model.last_call_kwargs["reference_wav_path"] == str(temp_wav)
    assert fake_model.last_call_kwargs["prompt_wav_path"] == str(temp_wav)
    assert fake_model.last_call_kwargs["prompt_text"] == transcript

    info = sf.info(str(out_file))
    assert info.samplerate == 48000


@pytest.mark.asyncio
async def test_voxcpm2_synthesize_streaming(temp_wav: Path):
    backend = VoxCPM2Backend()
    fake_model = FakeVoxCPMModel()
    backend._model = fake_model

    chunks = []
    async for chunk in backend.synthesize_streaming(
        text="ជំរាបសួរ",
        voice_id="clone",
        reference_audio=temp_wav,
    ):
        chunks.append(chunk)

    assert len(chunks) == 3
    for chunk in chunks:
        assert isinstance(chunk, bytes)
        assert len(chunk) > 0


@pytest.mark.asyncio
async def test_api_design_voice_workflow(tmp_path: Path, monkeypatch):
    import vishnu_dub.api as api_mod
    from vishnu_dub.config import Settings
    test_settings = Settings(jobs_path=tmp_path / "jobs", model_store_path=tmp_path / "models")
    monkeypatch.setattr(api_mod, "settings", test_settings)

    fake_backend = MagicMock()
    async def mock_design_voice(prompt, output_path, text=None, speed=1.0):
        output_path.parent.mkdir(parents=True, exist_ok=True)
        t = np.linspace(0, 1.0, 48000, endpoint=False, dtype=np.float32)
        sf.write(str(output_path), 0.2 * np.sin(2 * np.pi * 440.0 * t), 48000)
        return TTSResult(
            audio_path=output_path,
            duration=1.0,
            format="wav",
            provider="voxcpm2",
            voice_id=f"design:{prompt[:20]}",
        )
    fake_backend.design_voice = mock_design_voice

    monkeypatch.setattr("vishnu_dub.tts.get_tts_backend", lambda _: fake_backend)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Design a voice
        resp = await client.post("/v1/tts/design-voice", json={
            "prompt": "gentle Khmer storytelling voice",
            "text": "រឿងនិទានខ្មែរ",
            "speed": 1.0,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["duration"] == 1.0
        assert data["audio_url"].startswith("/v1/tts/artifacts/")
        assert data["audio_data_url"].startswith("data:audio/wav;base64,")

        artifact_name = Path(data["audio_url"]).name

        # 2. Download artifact via API
        art_resp = await client.get(f"/v1/tts/artifacts/{artifact_name}")
        assert art_resp.status_code == 200
        assert art_resp.headers["content-type"] == "audio/wav"
        assert len(art_resp.content) > 0

        # 3. Save voice to library
        save_resp = await client.post("/v1/tts/voices/save", json={
            "prompt": "gentle Khmer storytelling voice",
            "consent": True,
        })
        assert save_resp.status_code == 200
        saved_data = save_resp.json()
        assert saved_data["id"] != ""
        assert saved_data["prompt"] == "gentle Khmer storytelling voice"
        assert saved_data["audioUrl"].endswith(artifact_name)

        # 4. List voices
        list_resp = await client.get("/v1/tts/voices/list")
        assert list_resp.status_code == 200
        voices = list_resp.json()["voices"]
        assert any(v["id"] == saved_data["id"] for v in voices)

        # 5. Delete voice
        del_resp = await client.post("/v1/tts/voices/delete", json={
            "voice_id": saved_data["id"],
        })
        assert del_resp.status_code == 200
        assert del_resp.json()["ok"] is True


@pytest.mark.asyncio
async def test_hardware_performance_diagnostics():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/v1/hardware/performance")
        assert resp.status_code == 200
        data = resp.json()
        assert "tier" in data
        assert data["tier"] in ["T0", "T1", "T2", "T3"]
        assert "can_train_lora" in data
        assert "voxcpm_mode" in data
        assert "specs" in data
        assert "cpu" in data["specs"]
        assert "memory" in data["specs"]
        assert "gpu" in data["specs"]


@pytest.mark.asyncio
async def test_voice_export_and_import(tmp_path: Path, monkeypatch):
    import base64
    import io
    import vishnu_dub.api as api_mod
    from vishnu_dub.config import Settings

    test_settings = Settings(jobs_path=tmp_path / "jobs", model_store_path=tmp_path / "models")
    monkeypatch.setattr(api_mod, "settings", test_settings)

    # Prepare an existing voice folder
    voice_dir = tmp_path / "jobs" / "voice_designs" / "test_voice_01"
    voice_dir.mkdir(parents=True, exist_ok=True)
    
    t = np.linspace(0, 1.0, 48000, endpoint=False, dtype=np.float32)
    sample_wav = 0.2 * np.sin(2 * np.pi * 440.0 * t)
    wav_bytes_io = io.BytesIO()
    sf.write(wav_bytes_io, sample_wav, 48000, format="WAV")
    raw_wav_bytes = wav_bytes_io.getvalue()
    (voice_dir / "test_voice_01.wav").write_bytes(raw_wav_bytes)

    meta = {
        "id": "test_voice_01",
        "name": "Test Voice 01",
        "prompt": "calm narrator",
        "duration": 1.0,
        "createdAt": "2026-10-28T12:00:00Z",
        "audioUrl": "/v1/tts/artifacts/test_voice_01.wav",
        "consent": True,
    }
    (voice_dir / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Export voice
        exp_resp = await client.post("/v1/tts/voices/export", json={"voice_id": "test_voice_01"})
        assert exp_resp.status_code == 200
        exp_data = exp_resp.json()
        assert exp_data["ok"] is True
        assert exp_data["filename"].endswith(".zip")
        assert (tmp_path / "jobs" / "voice_designs" / exp_data["filename"]).exists()

        # 2. Import voice
        b64_audio = base64.b64encode(raw_wav_bytes).decode("ascii")
        imp_resp = await client.post("/v1/tts/voices/import", json={
            "name": "Imported Khmer Storyteller",
            "prompt": "storyteller tone",
            "audio_data": f"data:audio/wav;base64,{b64_audio}",
            "consent": True,
        })
        assert imp_resp.status_code == 200
        imp_data = imp_resp.json()
        assert imp_data["id"] == "Imported_Khmer_Storyteller"
        assert imp_data["duration"] == pytest.approx(1.0, rel=1e-2)
        assert imp_data["consent"] is True

        # Verify it shows up in list
        list_resp = await client.get("/v1/tts/voices/list")
        assert list_resp.status_code == 200
        all_ids = [v["id"] for v in list_resp.json()["voices"]]
        assert "Imported_Khmer_Storyteller" in all_ids


@pytest.mark.asyncio
async def test_lora_train_hardware_gating(monkeypatch, tmp_path: Path):
    import vishnu_dub.api as api_mod
    from vishnu_dub.config import Settings
    test_settings = Settings(jobs_path=tmp_path / "jobs", model_store_path=tmp_path / "models")
    monkeypatch.setattr(api_mod, "settings", test_settings)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # On T1 or system with < 8GB VRAM, starting LoRA training directly returns 400 with hardware message
        resp = await client.post("/v1/lora/train", json={
            "train_manifest": "dummy_train.jsonl",
            "val_manifest": "dummy_val.jsonl",
            "num_epochs": 1,
            "batch_size": 1,
        })
        # If hardware is T1 (or no CUDA/ <8GB VRAM), returns 400 with explanation
        assert resp.status_code in [200, 400]
        if resp.status_code == 400:
            assert "Cannot start LoRA training" in resp.json()["detail"]


def test_lora_training_module_import_and_check():
    from vishnu_dub.training import lora_training
    assert hasattr(lora_training, "LoRATrainer")
    assert hasattr(lora_training, "check_hardware_requirements")
    
    ok, msg = lora_training.check_hardware_requirements()
    assert isinstance(ok, bool)
    assert isinstance(msg, str)


@pytest.mark.asyncio
async def test_end_to_end_khmer_dub_with_voxcpm2_cloned_voice(tmp_path: Path, monkeypatch):
    """Phase 5 Exit Gate Test: E2E Khmer dubbing with VoxCPM2 cloned voice on CPU."""
    import subprocess
    from vishnu_dub.jobs import JobManager, JobStatus, resolve_ffmpeg_path
    from vishnu_dub.asr import TranscriptionResult, TranscriptionSegment

    ffmpeg_bin = resolve_ffmpeg_path()
    input_mp4 = tmp_path / "speaker_source.mp4"
    # Create 2-second test video with 440 Hz audio
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

    class MockASR:
        def is_available(self) -> bool:
            return True
        async def transcribe(self, audio_path: Path, language=None):
            return TranscriptionResult(
                segments=[
                    TranscriptionSegment(start=0.0, end=1.0, text="Hello world."),
                    TranscriptionSegment(start=1.0, end=2.0, text="Welcome to Vishnu."),
                ],
                language="en",
                duration=2.0,
            )

    class MockTranslation:
        def is_available(self) -> bool:
            return True
        async def translate(self, segments, source_language: str, target_language: str, cps: float = 13.0):
            return [
                {"start": 0.0, "end": 1.0, "text": "សួស្តីពិភពលោក។", "source_text": "Hello world."},
                {"start": 1.0, "end": 2.0, "text": "សូមស្វាគមន៍មកកាន់វិស្ណុ។", "source_text": "Welcome to Vishnu."},
            ]

    # Instantiate real VoxCPM2Backend with FakeVoxCPMModel for deterministic 48 kHz generation
    voxcpm_backend = VoxCPM2Backend()
    voxcpm_backend._model = FakeVoxCPMModel(sample_rate=48000)

    monkeypatch.setattr("vishnu_dub.asr.get_asr_backend", lambda *_: MockASR())
    monkeypatch.setattr("vishnu_dub.translation.get_translation_backend", lambda *_: MockTranslation())
    monkeypatch.setattr("vishnu_dub.tts.get_tts_backend", lambda name, *_: voxcpm_backend if name == "voxcpm2" else None)

    from vishnu_dub.config import Settings
    manager = JobManager(Settings(jobs_path=tmp_path / "jobs"))
    job = await manager.create_job(
        job_id="test_e2e_voxcpm",
        source_url=str(input_mp4),
        source_language="en",
        target_language="km",
        tts_provider="voxcpm2",
        tts_voice_id="clone",
        auto_clone_speaker=True,
    )

    await manager._run_job(job)
    completed_job = await manager.get_job("test_e2e_voxcpm")
    assert completed_job is not None
    assert completed_job.status == JobStatus.COMPLETED
    assert completed_job.result_path is not None
    result_mp4 = Path(completed_job.result_path)
    assert result_mp4.exists()
    assert result_mp4.stat().st_size > 0

    # Verify auto-cloned reference audio was extracted from video
    assert completed_job.reference_audio_path is not None
    assert Path(completed_job.reference_audio_path).exists()

    # Verify timesync report exists and placed both Khmer segments
    timesync_file = tmp_path / "jobs" / completed_job.job_id / "timesync_report.json"
    assert timesync_file.exists()
    report = json.loads(timesync_file.read_text(encoding="utf-8"))
    assert len(report["segments"]) == 2
    for p in report["segments"]:
        assert "tempo" in p
        assert "overflow" in p
        assert "status" in p


def test_vllm_serving_module_and_routes():
    """T5.8 optional vLLM module: verifies honest non-fake detection."""
    from vishnu_dub.vllm_serving import VLLMManager, VLLMModelLoadRequest
    manager = VLLMManager()
    assert manager.port == 8766
    req = VLLMModelLoadRequest()
    assert req.model == "openbmb/VoxCPM2"
    assert isinstance(manager.available, bool)
    assert isinstance(manager.gpu_available, bool)


@pytest.mark.asyncio
async def test_default_sample_voices_and_manifest():
    """Verify built-in default VoxCPM2 voices for cloning & training are available."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Voice list includes default speaker and training reader
        list_resp = await client.get("/v1/tts/voices/list")
        assert list_resp.status_code == 200
        voice_ids = [v["id"] for v in list_resp.json()["voices"]]
        assert "voxcpm2_default_speaker" in voice_ids
        assert "voxcpm2_training_reader" in voice_ids

        # 2. Can fetch the artifact audio
        art_resp = await client.get("/v1/tts/artifacts/default_clone_speaker.wav")
        assert art_resp.status_code == 200
        assert len(art_resp.content) > 100_000
        assert art_resp.headers["content-type"] == "audio/wav"

        # 3. Can export the default sample voice bundle
        exp_resp = await client.post("/v1/tts/voices/export", json={"voice_id": "voxcpm2_default_speaker"})
        assert exp_resp.status_code == 200
        assert exp_resp.json()["ok"] is True
        assert exp_resp.json()["filename"].endswith(".zip")

        # 4. Can preview the default sample voice directly
        prev_resp = await client.post("/v1/tts/voices/preview", json={"voice_id": "voxcpm2_default_speaker"})
        assert prev_resp.status_code == 200
        assert prev_resp.headers["content-type"] == "audio/wav"
        assert len(prev_resp.content) > 100_000


