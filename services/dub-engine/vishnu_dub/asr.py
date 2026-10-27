"""Vishnu Dub Engine — ASR / Transcription backends."""

import asyncio
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel
from vishnu_dub.config import Settings, ASRConfig
from vishnu_dub.subtitles import DEFAULT_INITIAL_PROMPT, load_asr_corrections


KHMER_INITIAL_PROMPT = (
    "Vishnu Creator, ភ្នំពេញ, សៀមរាប, បាត់ដំបង, កំពង់ចាម, កំពង់ធំ, កំពង់ស្ពឺ, "
    "ព្រះសីហនុ, កំពត, កែប, កោះកុង, តាកែវ, ព្រៃវែង, ស្វាយរៀង, ពោធិ៍សាត់, "
    "បន្ទាយមានជ័យ, ប៉ៃលិន, ឧត្តរមានជ័យ, ព្រះវិហារ, ស្ទឹងត្រែង, ក្រចេះ, រតនគិរី, មណ្ឌលគិរី, "
    "អាយធី, អេអាយ, យូធូប, ហ្វេសប៊ុក, ទីកតុក, តេឡេក្រាម, កុំព្យូទ័រ, អ៊ីនធឺណិត, "
    "វីដេអូ, ម៉ូដែល, ឆាតជីភីធី, ChatGPT, Claude, DeepSeek, OpenAI, PyTorch, Python, API"
)


def get_asr_initial_prompt(custom_prompt: Optional[str] = None, language: Optional[str] = None) -> str:
    """Build context-primed prompt for ASR, adding Khmer geographical & tech terms when language is km."""
    norm_lang = (language or "").lower()[:2]
    if custom_prompt:
        base = custom_prompt
    elif norm_lang == "km":
        return f"{DEFAULT_INITIAL_PROMPT}, {KHMER_INITIAL_PROMPT}"
    else:
        return DEFAULT_INITIAL_PROMPT

    if norm_lang == "km" and "ភ្នំពេញ" not in base:
        return f"{base}, {KHMER_INITIAL_PROMPT}"
    return base


def apply_asr_corrections_to_segments(
    segments: List["TranscriptionSegment"],
    lang_code: Optional[str] = None,
) -> List["TranscriptionSegment"]:
    """Apply dictionary corrections (including Khmer corrections list) directly to transcribed segments."""
    import re

    corrections = load_asr_corrections(lang_code=lang_code)
    if not corrections or not segments:
        return segments

    for corr in corrections:
        pattern = corr.get("pattern", "")
        replacement = corr.get("replacement", "")
        case_sensitive = corr.get("case_sensitive", False)
        if not pattern or replacement is None:
            continue

        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            rx = re.compile(pattern, flags)
        except Exception:
            continue

        for seg in segments:
            if seg.text:
                seg.text = rx.sub(replacement, seg.text).strip()
            if seg.words:
                for w in seg.words:
                    if isinstance(w, dict) and "word" in w and isinstance(w["word"], str):
                        w["word"] = rx.sub(replacement, w["word"])

    return segments


class TranscriptionSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: Optional[str] = None
    words: Optional[List[Dict[str, Any]]] = None


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

    def unload(self) -> None:
        if self._model is not None:
            self._model = None
            import gc
            gc.collect()

    async def transcribe(
        self,
        audio_path: Path,
        language: Optional[str] = None,
        word_timestamps: bool = True,
    ) -> TranscriptionResult:
        if not self.is_available():
            raise RuntimeError("faster-whisper not installed")

        from faster_whisper import WhisperModel
        from vishnu_dub.models import select_device_and_threads

        if self._model is None:
            device, cores = select_device_and_threads(enable_gpu=self.config.enable_gpu)
            compute_type = "float16" if device == "cuda" else "int8"
            whisper_dir = self.settings.model_store_path / "whisper"
            whisper_dir.mkdir(parents=True, exist_ok=True)
            self._model = WhisperModel(
                self.config.whisper_cpp_model,
                device=device,
                compute_type=compute_type,
                cpu_threads=cores,
                download_root=str(whisper_dir),
            )

        prompt = get_asr_initial_prompt(self.config.initial_prompt, language=language)
        segments, info = self._model.transcribe(
            str(audio_path),
            language=language,
            word_timestamps=word_timestamps,
            vad_filter=True,
            initial_prompt=prompt,
        )

        segments_list = []
        for seg in segments:
            words_list = None
            if hasattr(seg, "words") and seg.words:
                words_list = [
                    {
                        "word": w.word,
                        "start": w.start,
                        "end": w.end,
                        "probability": getattr(w, "probability", None),
                    }
                    for w in seg.words
                ]
            segments_list.append(TranscriptionSegment(
                start=seg.start,
                end=seg.end,
                text=seg.text.strip(),
                words=words_list,
            ))

        segments_list = apply_asr_corrections_to_segments(segments_list, lang_code=language or info.language)

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
        prompt = get_asr_initial_prompt(self.config.initial_prompt, language=language)
        result = model.transcribe(audio, language=language, asr_options={"initial_prompt": prompt})

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
                words=seg.get("words"),
            ))

        segments_list = apply_asr_corrections_to_segments(segments_list, lang_code=language or result.get("language"))

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

        prompt = get_asr_initial_prompt(self.config.initial_prompt, language=language)
        with open(audio_path, "rb") as f:
            files = {"file": (audio_path.name, f, "audio/mpeg")}
            data = {
                "model": self.config.openai_model,
                "response_format": "verbose_json",
                "timestamp_granularities": ["word"] if word_timestamps else ["segment"],
                "prompt": prompt,
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
                words=seg.get("words"),
            ))

        segments_list = apply_asr_corrections_to_segments(segments_list, lang_code=language or data.get("language"))

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