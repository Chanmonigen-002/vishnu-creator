"""Tests for voice watermark & consent guard."""

import os
import tempfile
from pathlib import Path
import numpy as np
import pytest
import soundfile as sf

from vishnu_dub.tts import (
    VoxCPM2Backend,
    WATERMARK_SAMPLE_RATE,
)


@pytest.fixture
def tts_backend():
    return VoxCPM2Backend()


def test_watermark_secret_not_hardcoded(tts_backend):
    """Verify that watermark secret is dynamically generated or read from env, never a static fallback."""
    # Test with custom env var
    os.environ["WATERMARK_SECRET"] = "custom-test-secret-value-12345"
    try:
        secret = tts_backend._get_watermark_secret()
        assert secret == b"custom-test-secret-value-12345"
    finally:
        del os.environ["WATERMARK_SECRET"]

    # When env var unset, generates or loads a non-empty 32-byte secret
    secret_default = tts_backend._get_watermark_secret()
    assert isinstance(secret_default, bytes)
    assert len(secret_default) >= 16
    assert secret_default != b"vishnu-default-secret"


def test_watermark_frequencies_below_nyquist(tts_backend):
    """Verify that carrier frequencies never exceed or alias against Nyquist."""
    for sr in [24000, 44100, 48000]:
        f0, f1 = tts_backend._get_watermark_frequencies(sr)
        nyquist = sr / 2.0
        assert f0 < nyquist, f"freq_0 {f0} exceeds Nyquist {nyquist} at sample rate {sr}"
        assert f1 < nyquist, f"freq_1 {f1} exceeds Nyquist {nyquist} at sample rate {sr}"
        assert f0 != f1


def test_watermark_generate_and_encode(tts_backend):
    """Verify watermark payload creation and audio FSK encoding."""
    voice_id = "test_voice"
    user_id = "user_42"
    timestamp = 1700000000

    payload = tts_backend._generate_watermark(voice_id, user_id, timestamp)
    assert len(payload) > 8

    # Encode as audio
    signal = tts_backend._encode_watermark_audio(payload, duration=1.0, sample_rate=48000)
    assert isinstance(signal, np.ndarray)
    assert len(signal) > 0
    assert np.max(np.abs(signal)) <= 0.05


def test_watermark_embed_and_extract(tts_backend):
    """Verify embedding watermark into carrier audio and extracting it back."""
    voice_id = "clone_khmer"
    user_id = "user_test"
    timestamp = 1712345678

    sample_rate = 48000
    payload = tts_backend._generate_watermark(voice_id, user_id, timestamp)
    watermark_signal = tts_backend._encode_watermark_audio(payload, duration=1.0, sample_rate=sample_rate)

    # Carrier audio: 3 seconds of realistic speech simulation (harmonics + noise floor)
    t = np.linspace(0, 3, sample_rate * 3)
    audio = (
        0.3 * np.sin(2 * np.pi * 300 * t)
        + 0.15 * np.sin(2 * np.pi * 1200 * t)
        + 0.001 * np.random.randn(len(t))
    ).astype(np.float32)

    # Embed watermark
    watermarked = tts_backend._embed_watermark(audio, watermark_signal)
    assert len(watermarked) == len(audio)

    # Extract watermark
    extracted = tts_backend._extract_watermark(watermarked, len(payload), sample_rate=sample_rate)
    assert extracted is not None
    assert extracted == payload


def test_watermark_verify_file(tts_backend):
    """Verify watermark end-to-end against a saved WAV file."""
    voice_id = "voice_123"
    user_id = "author_456"
    timestamp = 1710000000
    sample_rate = 48000

    payload = tts_backend._generate_watermark(voice_id, user_id, timestamp)
    watermark_signal = tts_backend._encode_watermark_audio(payload, duration=1.0, sample_rate=sample_rate)

    t = np.linspace(0, 4, sample_rate * 4)
    audio = (
        0.35 * np.sin(2 * np.pi * 250 * t)
        + 0.2 * np.sin(2 * np.pi * 800 * t)
        + 0.001 * np.random.randn(len(t))
    ).astype(np.float32)
    watermarked = tts_backend._embed_watermark(audio, watermark_signal)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        temp_wav = Path(f.name)

    try:
        sf.write(str(temp_wav), watermarked, sample_rate)
        # Should verify successfully with correct metadata
        assert tts_backend.verify_watermark(temp_wav, voice_id, user_id, timestamp) is True
        # Should fail with incorrect voice_id
        assert tts_backend.verify_watermark(temp_wav, "wrong_voice", user_id, timestamp) is False
    finally:
        temp_wav.unlink(missing_ok=True)


def test_require_consent(tts_backend):
    """Verify that voice cloning consent guard rejects unauthorized cloning."""
    # Consent given -> passes without error
    tts_backend.require_consent("voice_abc", user_consent=True, user_id="user_1")

    # Consent not given -> raises RuntimeError
    with pytest.raises(RuntimeError, match="Voice cloning requires explicit user consent"):
        tts_backend.require_consent("voice_abc", user_consent=False, user_id="user_1")
