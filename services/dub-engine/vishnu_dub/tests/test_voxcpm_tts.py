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

