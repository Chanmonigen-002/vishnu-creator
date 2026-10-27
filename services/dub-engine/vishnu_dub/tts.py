"""Vishnu Dub Engine — TTS backends."""

import asyncio
import hashlib
import os
import struct
import subprocess
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import AsyncGenerator, Optional

import numpy as np
from pydantic import BaseModel

# Watermark constants
WATERMARK_SAMPLE_RATE = 24000
WATERMARK_BIT_DURATION = 0.1  # 100ms per bit
WATERMARK_FREQ_0 = 18000  # Hz for bit 0
WATERMARK_FREQ_1 = 19000  # Hz for bit 1
WATERMARK_AMPLITUDE = 0.01  # -40 dB relative to full scale


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

    async def design_voice(
        self,
        prompt: str,
        output_path: Path,
        speed: float = 1.0,
    ) -> TTSResult:
        """Design a voice from a text description (zero-shot voice design)."""
        if not self.is_available():
            raise RuntimeError("VoxCPM not installed")

        import torch
        import voxcpm
        import tempfile
        import torchaudio

        if self._model is None:
            self._model = voxcpm.VoxCPM.from_pretrained(
                self.model_path or "Mariya987/VoxCPM2",
                device=self.device,
                load_denoiser=False,
            )

            # Try to load Khmer LoRA
            if not self._khmer_lora:
                lora_path = self._resolve_khmer_lora()
                if lora_path:
                    self._model.load_lora(lora_path)
                    self._khmer_lora = True

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Map speed to inference_timesteps and cfg_value
        inference_timesteps = max(5, min(20, int(10 / speed)))
        cfg_value = 2.0

        # Voice design: provide prompt_text without reference_wav_path
        # The model generates a voice matching the text description
        audio = self._model.generate(
            text="",  # Empty text, we just want the voice characteristics
            prompt_text=prompt,
            reference_wav_path=None,
            prompt_wav_path=None,
            inference_timesteps=inference_timesteps,
            cfg_value=cfg_value,
            max_len=4096,
        )

        # Save
        torchaudio.save(str(output_path), audio.unsqueeze(0).cpu(), 24000)

        # Get duration
        duration = audio.shape[-1] / 24000

        return TTSResult(
            audio_path=output_path,
            duration=duration,
            format="wav",
            provider="voxcpm",
            voice_id=f"design:{prompt[:30]}",
        )

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
            raise RuntimeError("VoxCPM not installed")

        import torch
        import voxcpm
        import tempfile
        import torchaudio

        if self._model is None:
            self._model = voxcpm.VoxCPM.from_pretrained(
                self.model_path or "Mariya987/VoxCPM2",
                device=self.device,
                load_denoiser=False,  # Disable denoiser for speed
            )

            # Try to load Khmer LoRA
            if not self._khmer_lora:
                lora_path = self._resolve_khmer_lora()
                if lora_path:
                    self._model.load_lora(lora_path)
                    self._khmer_lora = True

        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Map speed to inference_timesteps and cfg_value
        # speed > 1.0 = faster (fewer timesteps), speed < 1.0 = slower
        inference_timesteps = max(5, min(20, int(10 / speed)))
        cfg_value = 2.0

        # Synthesize using correct VoxCPM API
        # reference_audio -> reference_wav_path (voice cloning)
        # reference_text -> prompt_text (paired with prompt_wav_path for continuation)
        # For voice cloning, we use reference_wav_path only
        # For continuation, we need both prompt_wav_path and prompt_text
        audio = self._model.generate(
            text=text,
            reference_wav_path=str(reference_audio) if reference_audio else None,
            prompt_text=reference_text if reference_audio else None,
            prompt_wav_path=str(reference_audio) if reference_audio and reference_text else None,
            inference_timesteps=inference_timesteps,
            cfg_value=cfg_value,
            max_len=4096,
        )

        # Save
        torchaudio.save(str(output_path), audio.unsqueeze(0).cpu(), 24000)

        # Get duration
        duration = audio.shape[-1] / 24000

        return TTSResult(
            audio_path=output_path,
            duration=duration,
            format="wav",
            provider="voxcpm",
            voice_id=voice_id,
        )

    async def synthesize_streaming(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        reference_audio: Optional[Path] = None,
        reference_text: Optional[str] = None,
    ) -> AsyncGenerator[bytes, None]:
        """Stream audio chunks as they are generated."""
        if not self.is_available():
            raise RuntimeError("VoxCPM not installed")

        import torch
        import voxcpm

        if self._model is None:
            self._model = voxcpm.VoxCPM.from_pretrained(
                self.model_path or "Mariya987/VoxCPM2",
                device=self.device,
                load_denoiser=False,
            )

            # Try to load Khmer LoRA
            if not self._khmer_lora:
                lora_path = self._resolve_khmer_lora()
                if lora_path:
                    self._model.load_lora(lora_path)
                    self._khmer_lora = True

        # Map speed to inference_timesteps and cfg_value
        inference_timesteps = max(5, min(20, int(10 / speed)))
        cfg_value = 2.0

        # Stream audio chunks
        async for chunk in self._model.generate_streaming(
            text=text,
            reference_wav_path=str(reference_audio) if reference_audio else None,
            prompt_text=reference_text if reference_audio else None,
            prompt_wav_path=str(reference_audio) if reference_audio else None,
            inference_timesteps=inference_timesteps,
            cfg_value=cfg_value,
            max_len=4096,
        ):
            # Convert numpy array to bytes (16-bit PCM)
            audio_bytes = (chunk * 32767).astype(np.int16).tobytes()
            yield audio_bytes

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

    # ─── Watermark & Consent Guard ──────────────────────────────────────

    def _generate_watermark(self, voice_id: str, user_id: str, timestamp: int) -> bytes:
        """Generate a cryptographic watermark payload."""
        # Create a watermark containing: voice_id, user_id, timestamp, and a hash
        payload = f"{voice_id}|{user_id}|{timestamp}".encode()
        # Add a HMAC for integrity
        secret = os.environ.get("WATERMARK_SECRET", "vishnu-default-secret").encode()
        hmac_digest = hashlib.sha256(secret + payload).digest()[:8]
        return payload + hmac_digest

    def _encode_watermark_audio(self, watermark_bytes: bytes, duration: float, sample_rate: int = WATERMARK_SAMPLE_RATE) -> np.ndarray:
        """Encode watermark bytes as audio using FSK (Frequency Shift Keying)."""
        bits = []
        for byte in watermark_bytes:
            for i in range(8):
                bits.append((byte >> i) & 1)
        
        samples_per_bit = int(sample_rate * WATERMARK_BIT_DURATION)
        total_samples = len(bits) * samples_per_bit
        t = np.arange(total_samples) / sample_rate
        
        # Generate FSK signal
        signal = np.zeros(total_samples, dtype=np.float32)
        for i, bit in enumerate(bits):
            start = i * samples_per_bit
            end = start + samples_per_bit
            freq = WATERMARK_FREQ_1 if bit else WATERMARK_FREQ_0
            signal[start:end] = WATERMARK_AMPLITUDE * np.sin(2 * np.pi * freq * t[start:end])
        
        return signal

    def _embed_watermark(self, audio: np.ndarray, watermark_signal: np.ndarray) -> np.ndarray:
        """Embed watermark into audio by adding it to the high-frequency range."""
        # Ensure watermark fits in audio
        if len(watermark_signal) > len(audio):
            watermark_signal = watermark_signal[:len(audio)]
        
        # Add watermark to the end of the audio (last N samples)
        start_idx = len(audio) - len(watermark_signal)
        if start_idx < 0:
            start_idx = 0
        
        watermarked = audio.copy()
        watermarked[start_idx:] += watermark_signal
        
        # Prevent clipping
        np.clip(watermarked, -1.0, 1.0, out=watermarked)
        return watermarked

    def _extract_watermark(self, audio: np.ndarray, expected_length: int, sample_rate: int = WATERMARK_SAMPLE_RATE) -> Optional[bytes]:
        """Extract watermark from audio using FFT analysis."""
        if len(audio) < expected_length * sample_rate * WATERMARK_BIT_DURATION / 8:
            return None
        
        # Extract the last portion of audio where watermark is embedded
        samples_per_bit = int(sample_rate * WATERMARK_BIT_DURATION)
        watermark_samples = expected_length * 8 * samples_per_bit
        if watermark_samples > len(audio):
            return None
        
        watermark_audio = audio[-watermark_samples:]
        
        bits = []
        for i in range(0, len(watermark_audio), int(sample_rate * WATERMARK_BIT_DURATION)):
            chunk = watermark_audio[i:i + int(sample_rate * WATERMARK_BIT_DURATION)]
            if len(chunk) < sample_rate * WATERMARK_BIT_DURATION // 2:
                break
            
            # FFT to detect frequency
            fft = np.fft.rfft(chunk)
            freqs = np.fft.rfftfreq(len(chunk), 1 / WATERMARK_SAMPLE_RATE)
            
            # Find peak frequency
            peak_idx = np.argmax(np.abs(fft))
            peak_freq = freqs[peak_idx]
            
            # Determine bit based on frequency proximity
            if abs(peak_freq - WATERMARK_FREQ_1) < abs(peak_freq - WATERMARK_FREQ_0):
                bits.append(1)
            else:
                bits.append(0)
        
        # Convert bits to bytes
        if len(bits) < 8:
            return None
        
        bytes_out = bytearray()
        for i in range(0, min(len(bits), 64), 8):  # Max 8 bytes (48 bits payload + 8 HMAC)
            byte = 0
            for j in range(8):
                if i + j < len(bits):
                    byte |= (bits[i + j] << j)
            bytes_out.append(byte)
        
        return bytes(bytes_out)

    def verify_watermark(self, audio_path: Path, voice_id: str, user_id: str, timestamp: int) -> bool:
        """Verify watermark in an audio file."""
        import torchaudio
        audio, sr = torchaudio.load(str(audio_path))
        audio_np = audio[0].numpy()  # Mono
        
        expected_watermark = self._generate_watermark(voice_id, user_id, timestamp)
        extracted = self._extract_watermark(audio_np, len(expected_watermark), WATERMARK_SAMPLE_RATE)
        
        if extracted is None:
            return False
        
        return extracted == expected_watermark

    def require_consent(self, voice_id: str, user_consent: bool, user_id: str) -> None:
        """Enforce consent requirement for voice cloning."""
        if not user_consent:
            raise RuntimeError("Voice cloning requires explicit user consent")
        
        # Additional checks could be added here:
        # - Check if voice_id is in user's authorized voices list
        # - Check rate limiting
        # - Log the cloning attempt for audit
        
        # For now, just log
        import logging
        logging.info(f"Voice cloning authorized: voice_id={voice_id}, user_id={user_id}")


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