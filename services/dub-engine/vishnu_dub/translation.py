"""Vishnu Dub Engine — Translation with Khmer rules and fitted-CPS."""

import json
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel
from pydantic_settings import BaseSettings

from vishnu_dub.config import Settings, LLMConfig


class TranslationSegment(BaseModel):
    start: float
    end: float
    text: str
    source_text: str = ""
    speaker: Optional[str] = None


class TranslationResult(BaseModel):
    segments: List[TranslationSegment]
    source_language: str
    target_language: str


class TranslationBackend(ABC):
    @abstractmethod
    async def translate(
        self,
        segments: List[dict],
        source_language: str,
        target_language: str,
        cps: float = 13.0,
    ) -> List[dict]:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass


class LLMTranslationBackend(TranslationBackend):
    """LLM-based translation with Khmer rules."""

    KHMER_RULES = """
KHMER DUBBING RULES:
- Write natural spoken Khmer, not stiff literary Khmer.
- Khmer has NO spaces between words: never insert spaces inside a sentence; only space between clauses/sentences and after punctuation (។).
- NEVER insert Zero-Width Spaces (U+200B) or any invisible characters; the TTS engine reads plain continuous script.
- Preserve Coeng (U+17D2) subscript consonants intact: never split a subscript from its base consonant.
- Use standard Khmer punctuation: ។ ends a sentence.
- Write numbers as Arabic numerals (1, 2, 3) - the TTS engine reads them correctly.
- Keep Buddhist/Pali-Sanskrit terms in their standard Khmer forms.
- Keep Latin brand names as-is when no common Khmer form exists.
- Avoid abbreviations the TTS engine cannot read.
"""

    def __init__(self, config: LLMConfig):
        self.config = config
        self._client = None

    def is_available(self) -> bool:
        return bool(self.config.api_key and self.config.base_url)

    @property
    def name(self) -> str:
        return "llm-translation"

    def _get_rules(self, target_language: str) -> str:
        if target_language.lower() in ("km", "khmer"):
            return self.KHMER_RULES
        return ""

    async def translate(
        self,
        segments: List[dict],
        source_language: str,
        target_language: str,
        cps: float = 13.0,
    ) -> List[dict]:
        if not self.is_available():
            raise RuntimeError("LLM translation not configured")

        import httpx

        rules = self._get_rules(target_language)
        results = []

        for seg in segments:
            text = seg.get("text", "").strip()
            if not text:
                continue

            duration = seg.get("end", 0) - seg.get("start", 0)
            max_chars = int(duration * cps * 1.25)

            prompt = f"""You are an expert video dubbing translator. Translate from {source_language} to {target_language} as BRUTALLY CONCISE as possible to fit timing constraints.

Source text: "{text}"
Strict target duration: {duration:.1f}s -> translation MAX {max_chars} characters.
ABSOLUTE RULES:
- Keep the core meaning, intent, and tone.
- Natural spoken phrasing: translate the intended meaning cleanly.
- Be BRUTALLY concise: remove ALL fillers, unnecessary words.
- Priority: fit strictly within {max_chars} characters while sounding 100% natural.
- Output ONLY the {target_language} translation, nothing else.
{rules}

{target_language}:"""

            messages = [
                {"role": "system", "content": f"You are an expert video dubbing translator. Translate from {source_language} to {target_language} as BRUTALLY CONCISE as possible. Output ONLY the translation.{self._get_rules(target_language)}"},
                {"role": "user", "content": prompt},
            ]

            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{self.config.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.config.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.config.model,
                        "messages": messages,
                        "max_tokens": max(15, int(max_chars * 1.2)),
                        "temperature": 0.3,
                    },
                    timeout=60,
                )
                response.raise_for_status()
                data = response.json()
                result = data["choices"][0]["message"]["content"].strip()

            results.append({
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": result,
                "source_text": seg.get("text", ""),
            })

        return results
# Edge-TTS as a translation backend (for same-language or fast preview)
class EdgeTTSTranslationBackend(TranslationBackend):
    def __init__(self):
        pass

    @property
    def name(self) -> str:
        return "edge-tts-translation"

    def is_available(self) -> bool:
        return True

    async def translate(
        self,
        segments: List[dict],
        source_language: str,
        target_language: str,
        cps: float = 13.0,
    ) -> List[dict]:
        # For same-language, just return original
        if source_language == target_language:
            return segments

        # Otherwise, this would need an actual translation service
        # For now, return segments with a marker
        return [{
            **seg,
            "text": f"[{target_language}] {seg.get('text', '')}",
            "source_text": seg.get("text", ""),
        } for seg in segments]


def get_translation_backend(config: Settings) -> TranslationBackend:
    if config.llm.source == "codex" and config.llm.api_key:
        return LLMTranslationBackend(config.llm)
    return EdgeTTSTranslationBackend()