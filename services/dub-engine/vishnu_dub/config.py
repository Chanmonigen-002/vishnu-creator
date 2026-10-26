"""Vishnu Dub Engine — configuration management."""

import os
import platform
import shutil
import sys
from pathlib import Path
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _vendor_runtime_dir() -> Path:
    plat = "win32" if sys.platform == "win32" else ("darwin" if sys.platform == "darwin" else "linux")
    machine = platform.machine().lower()
    arch = "arm64" if ("arm" in machine or "aarch64" in machine) else "x64"
    return _repo_root() / ".runtime" / "vendor" / "creator-runtime" / f"{plat}-{arch}"


def resolve_ffmpeg_path(configured: Optional[str] = None) -> str:
    if configured:
        if Path(configured).exists() or shutil.which(configured):
            return configured
    found = shutil.which("ffmpeg")
    if found:
        return found
    exe = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    bundled = _vendor_runtime_dir() / exe
    if bundled.exists():
        return str(bundled)
    return "ffmpeg"


def resolve_ffprobe_path(configured: Optional[str] = None) -> str:
    if configured:
        probe_candidate = Path(configured).with_name("ffprobe.exe" if sys.platform == "win32" else "ffprobe")
        if probe_candidate.exists():
            return str(probe_candidate)
    found = shutil.which("ffprobe")
    if found:
        return found
    exe = "ffprobe.exe" if sys.platform == "win32" else "ffprobe"
    bundled = _vendor_runtime_dir() / exe
    if bundled.exists():
        return str(bundled)
    return "ffprobe"


def resolve_ytdlp_path(configured: Optional[str] = None) -> str:
    if configured and (Path(configured).exists() or shutil.which(configured)):
        return configured
    found = shutil.which("yt-dlp")
    if found:
        return found
    exe = "yt-dlp.exe" if sys.platform == "win32" else "yt-dlp"
    bundled = _vendor_runtime_dir() / exe
    if bundled.exists():
        return str(bundled)
    return "yt-dlp"


class ASRConfig(BaseSettings):
    provider: str = "faster-whisper"
    enable_gpu: bool = True
    whisper_cpp_model: str = "large-v3-turbo"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = ""
    openai_model: str = "whisper-1"
    whisper_kit_model: str = "large-v3-turbo"
    funasr_base_url: str = ""
    funasr_api_key: str = ""
    funasr_model: str = "paraformer-zh"
    volcengine_app_id: str = ""
    volcengine_access_token: str = ""
    volcengine_resource_id: str = ""
    volcengine_base_url: str = ""


class TTSConfig(BaseSettings):
    provider: str = "edge-tts"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini-tts"
    openai_default_voice_id: str = "alloy"
    minimax_base_url: str = "https://api.minimax.chat"
    minimax_api_key: str = ""
    minimax_model: str = "speech-01"
    minimax_default_voice_id: str = "default"
    aliyun_base_url: str = ""
    aliyun_api_key: str = ""
    aliyun_model: str = "cosyvoice-v1"
    aliyun_default_voice_id: str = "default"
    volcengine_app_id: str = ""
    volcengine_access_token: str = ""
    volcengine_cluster: str = "volcengine"
    volcengine_default_voice_id: str = "default"
    volcengine_base_url: str = ""


class LLMConfig(BaseSettings):
    source: str = "codex"
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    model: str = "gpt-4o-mini"
    json_mode: bool = False


class TranscriptionConfig(BaseSettings):
    provider: str = "faster-whisper"
    enable_gpu_acceleration: bool = True
    openai: Optional[ASRConfig] = None
    faster_whisper: Optional[ASRConfig] = None
    whisper_kit: Optional[ASRConfig] = None
    whisper_cpp: Optional[ASRConfig] = None
    aliyun: Optional[ASRConfig] = None
    funasr: Optional[ASRConfig] = None
    volcengine: Optional[ASRConfig] = None


class ImageConfig(BaseSettings):
    provider: str = "openai"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = ""
    openai_model: str = "gpt-image-1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    proxy: str = ""
    llm: LLMConfig = Field(default_factory=LLMConfig)
    transcription: TranscriptionConfig = Field(default_factory=TranscriptionConfig)
    tts: TTSConfig = Field(default_factory=TTSConfig)
    image: ImageConfig = Field(default_factory=ImageConfig)

    # Model store path (defaults to largest free drive)
    model_store_path: Path = Path.cwd() / "models"

    # Job store path
    jobs_path: Path = Path.cwd() / "jobs"

    # FFmpeg path (auto-detected if not set)
    ffmpeg_path: Optional[str] = Field(default_factory=resolve_ffmpeg_path)


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    global _settings
    _settings = None