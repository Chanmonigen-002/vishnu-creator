"""Vishnu Dub Engine — TTS backends."""

import asyncio
import os
import subprocess
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from pydantic import BaseModel


class TTSResult(BaseModel):
    audio_path: Path
    duration: float
    format: str = "mp3"
    provider: str
    voice_id: str


class TTSBackend(ABC):
    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice_id: str,
        output_path: Path,
        speed: float = 1.0,
    ) -> TTSResult:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def get_voices(self) -> list:
        pass


class EdgeTTSBackend(TTSBackend):
    """Edge-TTS backend — no GPU required."""

    KHMER_VOICES = {
        "km-KH-SreymomNeural": "Sreymom (Female)",
        "km-KH-PisethNeural": "Piseth (Male)",
    }

    def __init__(self, command: str = "edge-tts"):
        if command == "edge-tts":
            import shutil
            import sys
            venv_candidate = Path(sys.executable).parent / (
                "edge-tts.exe" if sys.platform == "win32" else "edge-tts"
            )
            if venv_candidate.exists():
                self.command = str(venv_candidate)
            else:
                self.command = shutil.which("edge-tts") or command
        else:
            self.command = command

    async def synthesize(self,
        text: str,
        voice_id: str,
        output_path: Path,
        speed: float = 1.0,
    ) -> TTSResult:
        if not self.is_available():
            raise RuntimeError("edge-tts not installed or not in PATH")

        output_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            self.command,
            "--voice", voice_id,
            "--text", text,
            "--write-media", str(output_path),
        ]
        if speed != 1.0:
            rate_pct = int(round((speed - 1.0) * 100))
            if rate_pct != 0:
                cmd.extend(["--rate", f"{rate_pct:+d}%"])

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"edge-tts failed: {stderr.decode()}")

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("edge-tts produced empty output")

        # Get duration via ffprobe
        from vishnu_dub.config import resolve_ffprobe_path
        ffprobe_bin = resolve_ffprobe_path()
        try:
            result = subprocess.run([
                ffprobe_bin, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(output_path)
            ], capture_output=True, text=True, timeout=10)
            duration = float(result.stdout.strip()) if result.stdout.strip() else 0.0
        except Exception:
            duration = 0.0

        return TTSResult(
            audio_path=output_path,
            duration=duration,
            format="mp3",
            provider="edge-tts",
            voice_id=voice_id,
        )

    def is_available(self) -> bool:
        try:
            result = subprocess.run(
                [self.command, "--version"],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except Exception:
            return False

    @property
    def name(self) -> str:
        return "edge-tts"

    def get_voices(self) -> list:
        return [{"id": k, "name": v, "language": "km-KH"} for k, v in self.KHMER_VOICES.items()]


class OpenAITTSBackend(TTSBackend):
    def __init__(self, base_url: str, api_key: str, model: str, default_voice: str):
        self.base_url = base_url
        self.api_key = api_key
        self.model = model
        self.default_voice = default_voice

    def is_available(self) -> bool:
        return True

    @property
    def name(self) -> str:
        return "openai-tts"

    def get_voices(self) -> list:
        return [
            {"id": "alloy", "name": "Alloy"},
            {"id": "echo", "name": "Echo"},
            {"id": "fable", "name": "Fable"},
            {"id": "onyx", "name": "Onyx"},
            {"id": "nova", "name": "Nova"},
            {"id": "shimmer", "name": "Shimmer"},
        ]

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        output_path: Path,
        speed: float = 1.0,
    ) -> TTSResult:
        import httpx

        output_path.parent.mkdir(parents=True, exist_ok=True)

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{self.base_url}/audio/speech",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "input": text,
                    "voice": voice_id or self.default_voice,
                    "speed": speed,
                    "response_format": "mp3",
                },
                timeout=120,
            )
            response.raise_for_status()

            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(response.content)

            # Get duration
            from vishnu_dub.config import resolve_ffprobe_path
            ffprobe_bin = resolve_ffprobe_path()
            try:
                result = subprocess.run([
                    ffprobe_bin, "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    str(output_path)
                ], capture_output=True, text=True, timeout=10)
                duration = float(result.stdout.strip()) if result.stdout.strip() else 0.0
            except Exception:
                duration = 0.0

            return TTSResult(
                audio_path=output_path,
                duration=duration,
                format="mp3",
                provider="openai-tts",
                voice_id=voice_id,
            )

class VoxCPM2Backend(TTSBackend):
    """VoxCPM2 — voice cloning and design (requires GPU or CPU with high RAM)."""

    def __init__(self, model_path: str = "", device: str = "auto"):
        self.model_path = model_path
        self.device = device
        self._model = None
        self._khmer_lora = False

    def unload(self) -> None:
        if self._model is not None:
            self._model = None
            self._khmer_lora = False
            import gc
            gc.collect()

    def is_available(self) -> bool:
        try:
            import torch
            import voxcpm
            return True
        except ImportError:
            return False

    @property
    def name(self) -> str:
        return "voxcpm2"

    def get_voices(self) -> list:
        return [
            {"id": "clone", "name": "Voice Clone (reference audio)"},
            {"id": "design", "name": "Voice Design (text prompt)"},
        ]

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        output_path: Path,
        speed: float = 1.0,
        reference_audio: Optional[Path] = None,
        reference_text: Optional[str] = None,
    ) -> TTSResult:
        if not self.is_available():
            raise RuntimeError("VoxCPM2 not installed")

        import torch
        import voxcpm

        if self._model is None:
            self._model = voxcpm.VoxCPM2.from_pretrained(
                self.model_path or "Mariya987/VoxCPM2",
                device=self.device,
            )

            # Try to load Khmer LoRA
            if not self._khmer_lora:
                lora_path = self._resolve_khmer_lora()
                if lora_path:
                    self._model.load_lora(lora_path)
                    self._khmer_lora = True

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Synthesize
        audio = self._model.generate(
            text=text,
            reference_audio=str(reference_audio) if reference_audio else None,
            reference_text=reference_text,
            speed=speed,
        )

        # Save
        import torchaudio
        torchaudio.save(str(output_path), audio.cpu(), 24000)

        # Get duration
        duration = audio.shape[-1] / 24000

        return TTSResult(
            audio_path=output_path,
            duration=duration,
            format="wav",
            provider="voxcpm2",
            voice_id=voice_id,
        )

    def is_available(self) -> bool:
        try:
            import torch
            import voxcpm
            return True
        except ImportError:
            return False

    @property
    def name(self) -> str:
        return "voxcpm2"

    def get_voices(self) -> list:
        return [
            {"id": "clone", "name": "Voice Clone (reference audio)"},
            {"id": "design", "name": "Voice Design (text prompt)"},
        ]

    def _resolve_khmer_lora(self) -> Optional[str]:
        """Locate Khmer LoRA checkpoint."""
        candidates = [
            Path("voices/khmer_lora"),
            Path.home() / ".cache" / "vishnu_dub" / "khmer_lora",
            Path(os.environ.get("VISHNU_KHMER_LORA_PATH", "")),
        ]
        for p in candidates:
            if p and p.exists():
                return str(p)
        return None


def get_tts_backend(provider: str, config: dict) -> TTSBackend:
    if provider == "edge-tts":
        return EdgeTTSBackend()
    elif provider == "openai":
        return OpenAITTSBackend(
            base_url=config.get("base_url", "https://api.openai.com/v1"),
            api_key=config.get("api_key", ""),
            model=config.get("model", "gpt-4o-mini-tts"),
            default_voice=config.get("default_voice_id", "alloy"),
        )
    elif provider == "voxcpm2":
        return VoxCPM2Backend(
            model_path=config.get("model_path", ""),
            device=config.get("device", "auto"),
        )
    else:
        # Default to Edge-TTS
        return EdgeTTSBackend()