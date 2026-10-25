"""Test configuration and basic imports."""

import pytest
from vishnu_dub.config import Settings, ASRConfig, TTSConfig, LLMConfig


def test_settings_defaults():
    """Test that settings can be created with defaults."""
    settings = Settings()
    assert settings.proxy == ""
    assert settings.llm is not None
    assert settings.transcription is not None
    assert settings.tts is not None


def test_asr_config():
    """Test ASR config creation."""
    config = ASRConfig(provider="faster-whisper")
    assert config.provider == "faster-whisper"
    assert config.enable_gpu is True


def test_tts_config():
    """Test TTS config creation."""
    config = TTSConfig(provider="edge-tts")
    assert config.provider == "edge-tts"


def test_llm_config():
    """Test LLM config creation."""
    config = LLMConfig(
        base_url="https://api.openai.com/v1",
        api_key="test-key",
        model="gpt-4o-mini",
    )
    assert config.base_url == "https://api.openai.com/v1"
    assert config.api_key == "test-key"
    assert config.model == "gpt-4o-mini"