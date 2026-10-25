"""Vishnu Dub Engine — Audio separation (Demucs)."""

import asyncio
import subprocess
from pathlib import Path
from typing import Optional

from pydantic import BaseModel


class SeparationResult(BaseModel):
    vocals_path: Path
    instrumental_path: Path
    duration: float


class SeparationBackend:
    """Demucs-based vocal/instrumental separation."""

    def __init__(self, model: str = "htdemucs", device: str = "auto"):
        self.model = model
        self.device = device

    def is_available(self) -> bool:
        try:
            import demucs
            return True
        except ImportError:
            return False

    async def separate(
        self,
        audio_path: Path,
        output_dir: Path,
        model: Optional[str] = None,
    ) -> SeparationResult:
        if not self.is_available():
            raise RuntimeError("Demucs not installed")

        output_dir.mkdir(parents=True, exist_ok=True)

        model = model or self.model
        device = self.device

        cmd = [
            "python", "-m", "demucs.separate",
            "-n", model,
            "-d", "cuda" if self.device == "cuda" else "cpu",
            "-o", str(output_dir),
            "--two-stems", "vocals",
            str(audio_path),
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"Demucs failed: {stderr.decode()}")

        # Find output files
        model_dir = output_dir / model
        vocals_path = model_dir / "vocals.wav"
        instrumental_path = model_dir / "no_vocals.wav"

        if not vocals_path.exists():
            raise RuntimeError("Demucs did not produce vocals output")

        # Get duration
        import subprocess
        result = subprocess.run([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(vocals_path)
        ], capture_output=True, text=True, timeout=10)

        duration = float(result.stdout.strip()) if result.stdout.strip() else 0.0

        return SeparationResult(
            vocals_path=vocals_path,
            instrumental_path=instrumental_path,
            duration=duration,
        )

    def is_available(self) -> bool:
        try:
            import demucs
            return True
        except ImportError:
            return False