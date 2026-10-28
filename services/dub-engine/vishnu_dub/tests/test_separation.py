"""Tests for Demucs vocal / music separation (T4.4)."""

import asyncio
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from vishnu_dub.separation import SeparationBackend


def _write_audio_fixture(path: Path, seconds: float = 1.0, sr: int = 44100) -> None:
    t = np.arange(int(seconds * sr)) / sr
    # Mix a 440 Hz tone and a 1200 Hz tone
    signal = 0.4 * np.sin(2 * np.pi * 440 * t) + 0.3 * np.sin(2 * np.pi * 1200 * t)
    # Demucs expects stereo or mono audio
    stereo = np.column_stack([signal, signal]).astype(np.float32)
    sf.write(str(path), stereo, sr, subtype="PCM_16")


def test_separation_backend_availability():
    backend = SeparationBackend()
    assert backend.is_available() is True


@pytest.mark.asyncio
async def test_separation_backend_missing_file(tmp_path):
    backend = SeparationBackend()
    with pytest.raises(Exception):
        await backend.separate(tmp_path / "non_existent.wav", tmp_path / "stems")


@pytest.mark.asyncio
async def test_separation_backend_separates_audio(tmp_path):
    backend = SeparationBackend(device="cpu")
    input_wav = tmp_path / "input_track.wav"
    _write_audio_fixture(input_wav, seconds=1.0)

    stems_dir = tmp_path / "stems"
    result = await backend.separate(input_wav, stems_dir)

    assert result.vocals_path.exists()
    assert result.instrumental_path.exists()
    assert result.vocals_path.stat().st_size > 100
    assert result.instrumental_path.stat().st_size > 100
    assert result.duration > 0.5
