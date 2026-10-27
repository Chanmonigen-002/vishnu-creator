"""Test ASR backends."""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from pathlib import Path

from vishnu_dub.asr import (
    ASRBackend,
    FasterWhisperBackend,
    WhisperXBackend,
    OpenAIWhisperBackend,
    TranscriptionResult,
    TranscriptionSegment,
    get_asr_backend,
    get_asr_initial_prompt,
    apply_asr_corrections_to_segments,
)
from vishnu_dub.config import Settings, ASRConfig


def test_transcription_segment():
    """Test TranscriptionSegment model."""
    seg = TranscriptionSegment(start=0.0, end=5.0, text="Hello world")
    assert seg.start == 0.0
    assert seg.end == 5.0
    assert seg.text == "Hello world"


def test_transcription_result():
    """Test TranscriptionResult model."""
    segments = [
        TranscriptionSegment(start=0.0, end=5.0, text="Hello"),
        TranscriptionSegment(start=5.0, end=10.0, text="World"),
    ]
    result = TranscriptionResult(segments=segments, language="en", duration=10.0)
    assert len(result.segments) == 2
    assert result.language == "en"
    assert result.duration == 10.0


def test_faster_whisper_backend_init():
    """Test FasterWhisperBackend initialization."""
    config = ASRConfig()
    settings = Mock(spec=Settings)
    backend = FasterWhisperBackend(config, settings)
    assert backend.config == config
    assert backend.settings == settings


def test_whisperx_backend_init():
    """Test WhisperXBackend initialization."""
    config = ASRConfig()
    settings = Mock(spec=Settings)
    backend = WhisperXBackend(config, settings)
    assert backend.config == config
    assert backend.settings == settings


def test_openai_whisper_backend_init():
    """Test OpenAIWhisperBackend initialization."""
    config = ASRConfig(openai_api_key="test-key")
    settings = Mock(spec=Settings)
    backend = OpenAIWhisperBackend(config, settings)
    assert backend.config == config
    assert backend.settings == settings


def test_openai_whisper_availability():
    """Test OpenAI backend availability check."""
    config = ASRConfig(openai_api_key="")
    settings = Mock(spec=Settings)
    backend = OpenAIWhisperBackend(config, settings)
    assert backend.is_available() is False

    config = ASRConfig(openai_api_key="test-key")
    backend = OpenAIWhisperBackend(config, settings)
    assert backend.is_available() is True


def test_get_asr_backend_faster_whisper():
    """Test ASR backend factory for faster-whisper."""
    settings = Settings()
    settings.transcription.provider = "faster-whisper"
    backend = get_asr_backend(settings)
    assert backend.name == "faster-whisper"


def test_get_asr_backend_whisperx():
    """Test ASR backend factory for whisperx."""
    settings = Settings()
    settings.transcription.provider = "whisperx"
    backend = get_asr_backend(settings)
    assert backend.name == "whisperx"


def test_get_asr_backend_openai():
    """Test ASR backend factory for openai."""
    settings = Settings()
    settings.transcription.provider = "openai"
    settings.transcription.openai = Mock(openai_api_key="test-key")
    backend = get_asr_backend(settings)
    assert backend.name == "openai-whisper"


def test_get_asr_backend_default():
    """Test ASR backend factory defaults to faster-whisper."""
    settings = Settings()
    settings.transcription.provider = "unknown"
    backend = get_asr_backend(settings)
    assert backend.name == "faster-whisper"


def test_asr_prompt_includes_khmer_vocabulary_when_lang_is_km():
    """Verify that ASR prompt builder adds Cambodian provinces and tech loanwords for km."""
    en_prompt = get_asr_initial_prompt(language="en")
    assert "Vishnu Creator" in en_prompt
    assert "ភ្នំពេញ" not in en_prompt

    km_prompt = get_asr_initial_prompt(language="km")
    assert "ភ្នំពេញ" in km_prompt
    assert "សៀមរាប" in km_prompt
    assert "បាត់ដំបង" in km_prompt
    assert "យូធូប" in km_prompt


def test_apply_asr_corrections_to_segments():
    """Verify that transcribed segments are cleaned with phonetic and geographical corrections."""
    segments = [
        TranscriptionSegment(start=0.0, end=2.0, text="ខ្ញុំទៅ ភ្នុំពេញ និង កំពុងចាម"),
        TranscriptionSegment(start=2.0, end=4.0, text="មើល យូធូប នៅលើ កុំព្យូទរ"),
    ]
    corrected = apply_asr_corrections_to_segments(segments, lang_code="km")
    assert corrected[0].text == "ខ្ញុំទៅ ភ្នំពេញ និង កំពង់ចាម"
    assert "YouTube" in corrected[1].text
    assert "កុំព្យូទ័រ" in corrected[1].text