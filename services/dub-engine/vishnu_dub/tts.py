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
WATERMARK_SAMPLE_RATE = 48000
WATERMARK_BIT_DURATION = 0.005  # 5ms per bit for compact, fast watermark
WATERMARK_FREQ_0 = 18000  # Hz for bit 0 (at 44.1k/48k)
WATERMARK_FREQ_1 = 19000  # Hz for bit 1 (at 44.1k/48k)
WATERMARK_AMPLITUDE = 0.02  # -34 dB relative to full scale


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

        last_error = ""
        for attempt in range(3):
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                break
            last_error = stderr.decode()
            if attempt < 2:
                await asyncio.sleep(1.0)
        else:
            raise RuntimeError(f"edge-tts failed after 3 attempts: {last_error}")

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

    async def synthesize_streaming(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        reference_audio: Optional[Path] = None,
        reference_text: Optional[str] = None,
    ):
        """Stream Edge-TTS audio chunks."""
        import edge_tts
        rate_pct = int(round((speed - 1.0) * 100))
        rate_str = f"{rate_pct:+d}%" if rate_pct != 0 else "+0%"
        communicate = edge_tts.Communicate(text, voice_id, rate=rate_str)
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio" and chunk.get("data"):
                yield chunk["data"]

    def is_available(self) -> bool:
        if Path(self.command).is_file():
            return True
        try:
            result = subprocess.run(
                [self.command, "--version"],
                capture_output=True,
                timeout=10,
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

    async def synthesize_streaming(
        self,
        text: str,
        voice_id: str,
        speed: float = 1.0,
        reference_audio: Optional[Path] = None,
        reference_text: Optional[str] = None,
    ):
        """Stream OpenAI TTS audio chunks."""
        import httpx
        url = f"{self.base_url.rstrip('/')}/audio/speech"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "input": text,
            "voice": voice_id or self.default_voice,
            "speed": speed,
            "response_format": "mp3",
        }
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes(4096):
                    yield chunk

class VoxCPM2Backend(TTSBackend):
    """VoxCPM2 — voice cloning and design (T5.1, T5.2).

    Defaults to CPU on T1 hardware (GPU VRAM < 8 GB, such as GT 1030 2GB),
    and switches to CUDA when >= 8 GB VRAM is available (T2/T3 tiers).
    Outputs audio at 48 kHz per task requirement.
    """

    SAMPLE_RATE: int = 48000

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

    def _resolve_device(self) -> str:
        """Resolve device for VoxCPM2 inference.

        Per ADR-0003 and hardware tiering rules:
        - T1 tier (GPU VRAM < 8 GB, like GT 1030 2GB): defaults to 'cpu'.
        - T2/T3 tier (GPU VRAM >= 8 GB): uses 'cuda'.
        """
        if self.device != "auto":
            return self.device
        try:
            import torch
            if torch.cuda.is_available():
                props = torch.cuda.get_device_properties(0)
                vram_gb = props.total_memory / (1024 ** 3)
                if vram_gb >= 8.0:
                    return "cuda"
            return "cpu"
        except Exception:
            return "cpu"

    def _resolve_model_path(self) -> str:
        """Resolve model weights path or HuggingFace model ID."""
        if self.model_path and (Path(self.model_path).exists() or "/" in self.model_path):
            return self.model_path
        env_path = os.environ.get("VOXCPM_MODEL_PATH")
        if env_path and Path(env_path).exists():
            return env_path
        try:
            from vishnu_dub.config import settings
            candidates = [
                settings.model_dir / "VoxCPM2",
                settings.model_dir / "openbmb" / "VoxCPM2",
            ]
            for candidate in candidates:
                if candidate.exists() and (candidate / "model.safetensors").exists():
                    return str(candidate)
        except Exception:
            pass
        return "openbmb/VoxCPM2"

    def _load_model(self):
        """Load VoxCPM2 model with honest error handling and proper device tiering."""
        if self._model is not None:
            return self._model
        if not self.is_available():
            raise RuntimeError("voxcpm or torch is not installed in the python environment")

        import voxcpm
        resolved_path = self._resolve_model_path()
        resolved_device = self._resolve_device()

        if Path(resolved_path).is_absolute() and not Path(resolved_path).exists():
            raise RuntimeError(
                f"VoxCPM2 model path '{resolved_path}' does not exist. "
                "Please download openbmb/VoxCPM2 or set VOXCPM_MODEL_PATH."
            )

        try:
            self._model = voxcpm.VoxCPM.from_pretrained(
                resolved_path,
                device=resolved_device,
                load_denoiser=False,
            )
        except Exception as e:
            raise RuntimeError(
                f"Failed to load VoxCPM2 model from '{resolved_path}' on device '{resolved_device}': {e}"
            ) from e

        # Try to load Khmer LoRA if available
        if not self._khmer_lora:
            lora_path = self._resolve_khmer_lora()
            if lora_path:
                try:
                    self._model.load_lora(lora_path)
                    self._khmer_lora = True
                except Exception:
                    pass

        return self._model

    async def design_voice(
        self,
        prompt: str,
        output_path: Path,
        text: Optional[str] = None,
        speed: float = 1.0,
    ) -> TTSResult:
        """Design a voice from a text description (zero-shot voice design, T5.2).

        VoxCPM2 conditions voice characteristics using control instructions
        enclosed in parentheses, e.g.: f"({prompt}){sample_text}".
        Outputs 48 kHz audio.
        """
        if not self.is_available():
            raise RuntimeError("VoxCPM not installed")

        import soundfile as sf
        model = self._load_model()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        sample_text = (text or "").strip() or "សួស្តី នេះគឺជាគំរូសំឡេងដែលបានរចនាឡើង។"
        final_text = f"({prompt}){sample_text}" if prompt else sample_text

        inference_timesteps = max(5, min(20, int(10 / speed)))
        cfg_value = 2.0

        audio = model.generate(
            text=final_text,
            reference_wav_path=None,
            prompt_wav_path=None,
            prompt_text=None,
            inference_timesteps=inference_timesteps,
            cfg_value=cfg_value,
            max_len=4096,
            normalize=True,
        )

        sample_rate = self.SAMPLE_RATE
        if hasattr(audio, "cpu") and hasattr(audio, "numpy"):
            audio_np = audio.cpu().numpy()
        elif isinstance(audio, np.ndarray):
            audio_np = audio
        else:
            audio_np = np.array(audio)
        if audio_np.ndim > 1:
            audio_np = audio_np.squeeze()

        sf.write(str(output_path), audio_np, sample_rate)
        duration = float(len(audio_np)) / sample_rate

        # Embed watermark into newly designed voice sample
        try:
            self._embed_watermark_in_wav(output_path, voice_id=f"design:{prompt[:30]}", user_id="creator")
        except Exception:
            pass

        return TTSResult(
            audio_path=output_path,
            duration=duration,
            format="wav",
            provider="voxcpm2",
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
        """Synthesize speech using VoxCPM2 at 48 kHz (T5.1).

        Supports zero-shot voice cloning (reference_audio alone) and
        'ultimate' cloning (paired reference_audio + reference_text transcript).
        """
        if not self.is_available():
            raise RuntimeError("VoxCPM not installed")

        import soundfile as sf
        model = self._load_model()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        inference_timesteps = max(5, min(20, int(10 / speed)))
        cfg_value = 2.0

        ref_path_str = str(reference_audio) if reference_audio else None
        prompt_path_str = str(reference_audio) if (reference_audio and reference_text) else None
        prompt_txt = reference_text if (reference_audio and reference_text) else None

        audio = model.generate(
            text=text,
            reference_wav_path=ref_path_str,
            prompt_wav_path=prompt_path_str,
            prompt_text=prompt_txt,
            inference_timesteps=inference_timesteps,
            cfg_value=cfg_value,
            max_len=4096,
            normalize=True,
        )

        sample_rate = self.SAMPLE_RATE
        if hasattr(audio, "cpu") and hasattr(audio, "numpy"):
            audio_np = audio.cpu().numpy()
        elif isinstance(audio, np.ndarray):
            audio_np = audio
        else:
            audio_np = np.array(audio)
        if audio_np.ndim > 1:
            audio_np = audio_np.squeeze()

        sf.write(str(output_path), audio_np, sample_rate)
        duration = float(len(audio_np)) / sample_rate

        # Cloned voices get watermarked for consent and authenticity guard (T5.9)
        if reference_audio:
            try:
                self._embed_watermark_in_wav(output_path, voice_id=voice_id, user_id="creator")
            except Exception:
                pass

        return TTSResult(
            audio_path=output_path,
            duration=duration,
            format="wav",
            provider="voxcpm2",
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
        """Stream audio chunks as they are generated (T5.7)."""
        if not self.is_available():
            raise RuntimeError("VoxCPM not installed")

        model = self._load_model()
        inference_timesteps = max(5, min(20, int(10 / speed)))
        cfg_value = 2.0

        ref_path_str = str(reference_audio) if reference_audio else None
        prompt_path_str = str(reference_audio) if (reference_audio and reference_text) else None
        prompt_txt = reference_text if (reference_audio and reference_text) else None

        generator = model.generate_streaming(
            text=text,
            reference_wav_path=ref_path_str,
            prompt_wav_path=prompt_path_str,
            prompt_text=prompt_txt,
            inference_timesteps=inference_timesteps,
            cfg_value=cfg_value,
            max_len=4096,
            normalize=True,
        )
        for chunk in generator:
            if hasattr(chunk, "cpu") and hasattr(chunk, "numpy"):
                chunk_np = chunk.cpu().numpy()
            elif isinstance(chunk, np.ndarray):
                chunk_np = chunk
            else:
                chunk_np = np.array(chunk)
            audio_int16 = np.clip(chunk_np * 32767.0, -32768, 32767).astype(np.int16)
            yield audio_int16.tobytes()
            await asyncio.sleep(0)

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

    def _embed_watermark_in_wav(
        self,
        audio_path: Path,
        voice_id: str,
        user_id: str = "creator",
        timestamp: Optional[int] = None,
    ) -> None:
        """Embed cryptographic watermark into output WAV file at its native sample rate."""
        import time
        import soundfile as sf
        ts = int(time.time()) if timestamp is None else timestamp
        watermark_payload = self._generate_watermark(voice_id, user_id, ts)

        data, sr = sf.read(str(audio_path))
        if data.ndim > 1:
            audio_np = data[:, 0].astype(np.float32)
        else:
            audio_np = data.astype(np.float32)

        watermark_sig = self._encode_watermark_audio(
            watermark_payload, duration=len(audio_np) / sr, sample_rate=sr
        )
        watermarked = self._embed_watermark(audio_np, watermark_sig)
        sf.write(str(audio_path), watermarked, sr)

    # ─── Watermark & Consent Guard ──────────────────────────────────────

    @staticmethod
    def _get_watermark_secret() -> bytes:
        """Retrieve or dynamically generate a persistent machine-local secret key without hardcoding."""
        env_secret = os.environ.get("WATERMARK_SECRET")
        if env_secret:
            return env_secret.encode("utf-8")
        try:
            from vishnu_dub.config import settings
            key_file = settings.model_dir / ".watermark_key"
            if key_file.exists():
                key_data = key_file.read_bytes().strip()
                if key_data:
                    return key_data
            import secrets
            generated = secrets.token_bytes(32)
            key_file.parent.mkdir(parents=True, exist_ok=True)
            key_file.write_bytes(generated)
            return generated
        except Exception:
            return hashlib.sha256(str(Path.home()).encode("utf-8")).digest()

    @staticmethod
    def _get_watermark_frequencies(sample_rate: int) -> tuple[float, float]:
        """Return (freq_0, freq_1) strictly within the audio band below Nyquist."""
        nyquist = sample_rate / 2.0
        if nyquist >= 20000.0:
            # 44.1kHz or 48kHz audio: near-ultrasonic inaudible band
            return 18000.0, 19000.0
        # Lower sample rates (e.g. 24kHz, Nyquist 12kHz): top safe band below Nyquist
        return nyquist * 0.88, nyquist * 0.94

    def _generate_watermark(self, voice_id: str, user_id: str, timestamp: int) -> bytes:
        """Generate a cryptographic watermark payload."""
        payload = f"{voice_id}|{user_id}|{timestamp}".encode("utf-8")
        secret = self._get_watermark_secret()
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
        freq_0, freq_1 = self._get_watermark_frequencies(sample_rate)
        
        # Generate FSK signal
        signal = np.zeros(total_samples, dtype=np.float32)
        for i, bit in enumerate(bits):
            start = i * samples_per_bit
            end = start + samples_per_bit
            freq = freq_1 if bit else freq_0
            signal[start:end] = WATERMARK_AMPLITUDE * np.sin(2 * np.pi * freq * t[start:end])
        
        return signal

    def _embed_watermark(self, audio: np.ndarray, watermark_signal: np.ndarray) -> np.ndarray:
        """Embed watermark into audio by adding it to the high-frequency range."""
        if len(watermark_signal) > len(audio):
            watermark_signal = watermark_signal[:len(audio)]
        
        start_idx = len(audio) - len(watermark_signal)
        if start_idx < 0:
            start_idx = 0
        
        watermarked = audio.copy()
        watermarked[start_idx:] += watermark_signal
        np.clip(watermarked, -1.0, 1.0, out=watermarked)
        return watermarked

    def _extract_watermark(self, audio: np.ndarray, expected_length: int, sample_rate: int = WATERMARK_SAMPLE_RATE) -> Optional[bytes]:
        """Extract watermark from audio using FFT analysis."""
        samples_per_bit = int(sample_rate * WATERMARK_BIT_DURATION)
        watermark_samples = expected_length * 8 * samples_per_bit
        if watermark_samples > len(audio) or len(audio) == 0:
            return None
        
        watermark_audio = audio[-watermark_samples:]
        freq_0, freq_1 = self._get_watermark_frequencies(sample_rate)
        
        bits = []
        for i in range(0, len(watermark_audio), samples_per_bit):
            chunk = watermark_audio[i:i + samples_per_bit]
            if len(chunk) < samples_per_bit:
                break
            
            # Apply Hann window to eliminate spectral leakage at chunk boundaries
            window = np.hanning(len(chunk))
            fft = np.fft.rfft(chunk * window)
            freqs = np.fft.rfftfreq(len(chunk), 1 / sample_rate)
            
            idx_0 = np.argmin(np.abs(freqs - freq_0))
            idx_1 = np.argmin(np.abs(freqs - freq_1))
            
            mag_0 = np.abs(fft[idx_0])
            mag_1 = np.abs(fft[idx_1])
            
            if mag_1 > mag_0:
                bits.append(1)
            else:
                bits.append(0)
        
        if len(bits) < expected_length * 8:
            return None
        
        bytes_out = bytearray()
        for i in range(0, expected_length * 8, 8):
            byte = 0
            for j in range(8):
                if i + j < len(bits):
                    byte |= (bits[i + j] << j)
            bytes_out.append(byte)
        
        return bytes(bytes_out)

    def verify_watermark(self, audio_path: Path, voice_id: str, user_id: str, timestamp: int) -> bool:
        """Verify watermark in an audio file."""
        try:
            import soundfile as sf
            data, sr = sf.read(str(audio_path))
            if data.ndim > 1:
                audio_np = data[:, 0].astype(np.float32)
            else:
                audio_np = data.astype(np.float32)
        except Exception:
            import torchaudio
            audio, sr = torchaudio.load(str(audio_path))
            audio_np = audio[0].numpy()
        
        expected_watermark = self._generate_watermark(voice_id, user_id, timestamp)
        extracted = self._extract_watermark(audio_np, len(expected_watermark), sr)
        
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


def get_tts_backend(provider: str, config: Optional[dict] = None) -> TTSBackend:
    config = config or {}
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