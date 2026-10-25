"""Vishnu Dub Engine — ASR / Transcription backends."""

import asyncio
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel
from vishnu_dub.config import Settings, ASRConfig


class TranscriptionSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: Optional[str] = None


class TranscriptionResult(BaseModel):
    segments: List[TranscriptionSegment]
    language: str
    duration: float


class ASRBackend(ABC):
    """Abstract base for ASR backends."""

    @abstractmethod
    async def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        word_timestamps: bool = True,
    ) -> TranscriptionResult:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass


class FasterWhisperBackend(ASRBackend):
    def __init__(self, config: ASRConfig, settings: Settings):
        self.config = config
        self.settings = settings
        self._model = None

    def is_available(self) -> bool:
        try:
            import faster_whisper
            return True
        except ImportError:
            return False

    @property
    def name(self) -> str:
        return "faster-whisper"

    async def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        word_timestamps: bool = True,
    ) -> TranscriptionResult:
        if not self.is_available():
            raise RuntimeError("faster-whisper not installed")

        from faster_whisper import WhisperModel

        if self._model is None:
            device = "cuda" if self.config.enable_gpu else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            self._model = WhisperModel(
                self.config.whisper_cpp_model,
                device=device,
                compute_type=compute_type,
            )

        segments, info = self._model.transcribe(
            str(audio_path),
            language=language,
            word_timestamps=word_timestamps,
            vad_filter=True,
        )

        segments_list = []
        for seg in segments:
            segments_list.append(TranscriptionSegment(
                start=seg.start,
                end=seg.end,
                text=seg.text.strip(),
            ))

        return TranscriptionResult(
            segments=segments_list,
            language=info.language,
            duration=info.duration,
        )


class WhisperXBackend(ASRBackend):
    def __init__(self, config: ASRConfig, settings: Settings):
        self.config = config
        self.settings = settings

    def is_available(self) -> bool:
        try:
            import whisperx
            return True
        except ImportError:
            return False

    @property
    def name(self) -> str:
        return "whisperx"

    async def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        word_timestamps: bool = True,
    ) -> TranscriptionResult:
        if not self.is_available():
            raise RuntimeError("whisperx not installed")

        import whisperx

        device = "cuda" if self.config.enable_gpu else "cpu"
        model = whisperx.load_model("large-v3", device=device, compute_type="float16")
        audio = whisperx.load_audio(str(audio_path))
        result = model.transcribe(audio, language=language)

        # Align
        model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=device)
        result = whisperx.align(result["segments"], model_a, metadata, audio, device)

        segments_list = []
        for seg in result["segments"]:
            segments_list.append(TranscriptionSegment(
                start=seg["start"],
                end=seg["end"],
                text=seg["text"].strip(),
                speaker=seg.get("speaker"),
            ))

        return TranscriptionResult(
            segments=segments_list,
            language=result["language"],
            duration=sum(seg.end - seg.start for seg in segments_list),
        )


class OpenAIWhisperBackend(ASRBackend):
    def __init__(self, config: ASRConfig, settings: Settings):
        self.config = config
        self.settings = settings

    def is_available(self) -> bool:
        return bool(self.config.openai_api_key)

    @property
    def name(self) -> str:
        return "openai-whisper"

    async def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        word_timestamps: bool = True,
    ) -> TranscriptionResult:
        if not self.is_available():
            raise RuntimeError("OpenAI API key not configured")

        import httpx

        with open(audio_path, "rb") as f:
            files = {"file": (audio_path.name, f, "audio/mpeg")}
            data = {
                "model": self.config.openai_model,
                "response_format": "verbose_json",
                "timestamp_granularities": ["word"] if word_timestamps else ["segment"],
            }
            if language:
                data["language"] = language

            async with httpx.AsyncClient(timeout=300) as client:
                response = await client.post(
                    f"{self.config.openai_base_url}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {self.config.openai_api_key}"},
                    files=files,
                    data=data,
                )
                response.raise_for_status()
                data = response.json()

        segments_list = []
        for seg in data.get("segments", []):
            segments_list.append(TranscriptionSegment(
                start=seg["start"],
                end=seg["end"],
                text=seg["text"].strip(),
            ))

        return TranscriptionResult(
            segments=segments_list,
            language=data.get("language", "en"),
            duration=data.get("duration", 0),
        )


def get_asr_backend(config: Settings) -> ASRBackend:
    """Factory to get the configured ASR backend."""
    provider = config.transcription.provider

    if provider == "faster-whisper":
        return FasterWhisperBackend(config.transcription.faster_whisper or ASRConfig(), config)
    elif provider == "whisperx":
        return WhisperXBackend(config.transcription.whisper_kit or ASRConfig(), config)
    elif provider == "openai":
        return OpenAIWhisperBackend(config.transcription.openai or ASRConfig(), config)
    else:
        # Default to faster-whisper
        return FasterWhisperBackend(config.transcription.faster_whisper or ASRConfig(), config)