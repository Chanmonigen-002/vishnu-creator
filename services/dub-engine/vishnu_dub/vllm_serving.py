"""Vishnu Dub Engine — vLLM / vLLM-Omni serving integration (optional GPU acceleration)."""

import asyncio
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

try:
    import vllm
    VLLM_AVAILABLE = True
except ImportError:
    VLLM_AVAILABLE = False

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


# ─── Models ──────────────────────────────────────────────────────────────


class VLLMStatus(BaseModel):
    """vLLM server status."""
    available: bool
    version: Optional[str] = None
    gpu_count: int = 0
    gpu_names: List[str] = field(default_factory=list)
    model_loaded: bool = False
    model_name: Optional[str] = None


class TTSGenerationRequest(BaseModel):
    """Request for TTS generation via vLLM."""
    text: str
    voice: str = "default"
    language: str = "en"
    speed: float = 1.0
    stream: bool = True


class TTSGenerationResponse(BaseModel):
    """Response from TTS generation."""
    ok: bool
    audio_url: Optional[str] = None
    audio_data_url: Optional[str] = None
    duration: float
    message: str = ""


class VLLMModelLoadRequest(BaseModel):
    """Request to load a model into vLLM."""
    model: str = "Mariya987/VoxCPM2"
    tensor_parallel_size: int = 1
    dtype: str = "float16"
    max_model_len: int = 4096
    gpu_memory_utilization: float = 0.9
    enforce_eager: bool = False
    trust_remote_code: bool = True


class VLLMModelLoadResponse(BaseModel):
    """Response from model load request."""
    ok: bool
    message: str


# ─── vLLM Server Manager ───────────────────────────────────────────────


class VLLMManager:
    """Manages vLLM server lifecycle and model serving."""

    def __init__(self):
        self.process: Optional[asyncio.subprocess.Process] = None
        self.model: Optional[str] = None
        self.port: int = 8766
        self.base_url: str = f"http://localhost:{self.port}"
        self._running = False

    @property
    def available(self) -> bool:
        return VLLM_AVAILABLE

    @property
    def gpu_available(self) -> bool:
        if not TORCH_AVAILABLE:
            return False
        try:
            return torch.cuda.is_available()
        except Exception:
            return False

    @property
    def gpu_count(self) -> int:
        if not self.gpu_available:
            return 0
        return torch.cuda.device_count()

    def gpu_names(self) -> List[str]:
        if not self.gpu_available:
            return []
        try:
            return [torch.cuda.get_device_name(i) for i in range(self.gpu_count)]
        except Exception:
            return []

    async def load_model(self, request: VLLMModelLoadRequest) -> VLLMModelLoadResponse:
        """Load a model into vLLM."""
        if not self.available:
            return VLLMModelLoadResponse(ok=False, message="vLLM not installed")

        if not self.gpu_available:
            return VLLMModelLoadResponse(ok=False, message="No GPU available for vLLM")

        # Stop existing server if running
        await self.stop_server()

        # Build vLLM command
        cmd = [
            sys.executable, "-m", "vllm.entrypoints.openai.api_server",
            "--model", request.model,
            "--port", str(self.port),
            "--host", "0.0.0.0",
            "--tensor-parallel-size", str(request.tensor_parallel_size),
            "--dtype", request.dtype,
            "--max-model-len", str(request.max_model_len),
            "--gpu-memory-utilization", str(request.gpu_memory_utilization),
        ]

        if request.enforce_eager:
            cmd.append("--enforce-eager")
        if request.trust_remote_code:
            cmd.append("--trust-remote-code")

        try:
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except Exception as e:
            return VLLMModelLoadResponse(ok=False, message=f"Failed to start vLLM: {e}")

        # Wait for server to be ready
        await asyncio.sleep(3)

        # Check if server is responding
        for _ in range(10):
            try:
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    async with session.get(f"{self.base_url}/health") as resp:
                        if resp.status == 200:
                            self.model = request.model
                            self._running = True
                            return VLLMModelLoadResponse(
                                ok=True,
                                message=f"vLLM server started on port {self.port} with model {request.model}"
                            )
            except Exception:
                await asyncio.sleep(1)

        await self.stop_server()
        return VLLMModelLoadResponse(ok=False, message="vLLM server failed to become ready")

    async def stop_server(self) -> bool:
        """Stop the vLLM server."""
        if self.process and self.process.returncode is None:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=10)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
            except Exception:
                pass
            self.process = None
            self.model = None
            self._running = False
            return True
        return True

    async def get_status(self) -> VLLMStatus:
        """Get vLLM server status."""
        status = VLLMStatus(
            available=self.available,
            gpu_count=self.gpu_count,
            gpu_names=self.gpu_names(),
            model_loaded=self._running,
            model_name=self.model,
        )
        if self.available:
            try:
                import vllm
                status.version = vllm.__version__
            except Exception:
                pass
        return status

    async def generate_stream(
        self,
        text: str,
        voice: str = "default",
        language: str = "en",
        speed: float = 1.0,
    ) -> AsyncGenerator[bytes, None]:
        """Generate TTS audio stream using vLLM."""
        if not self._running:
            raise HTTPException(503, "vLLM server not running")

        try:
            import aiohttp
            payload = {
                "model": self.model,
                "input": text,
                "voice": voice,
                "response_format": "wav",
                "speed": speed,
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/v1/audio/speech",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=300),
                ) as resp:
                    if resp.status != 200:
                        error = await resp.text()
                        raise HTTPException(500, f"vLLM generation failed: {error}")

                    async for chunk in resp.content.iter_chunked(8192):
                        if chunk:
                            yield chunk

        except Exception as e:
            raise HTTPException(500, f"Streaming failed: {e}")

    @property
    def base_url(self) -> str:
        return f"http://localhost:{self.port}"


# ─── FastAPI App ─────────────────────────────────────────────────────────


def create_vllm_app() -> FastAPI:
    """Create FastAPI app for vLLM serving."""
    manager = VLLMManager()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await manager.stop_server()

    app = FastAPI(
        title="Vishnu vLLM Serving",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.get("/v1/vllm/status", response_model=VLLMStatus)
    async def get_status():
        return await manager.get_status()

    @app.post("/v1/vllm/load", response_model=VLLMModelLoadResponse)
    async def load_model(request: VLLMModelLoadRequest):
        return await manager.load_model(request)

    @app.post("/v1/vllm/unload")
    async def unload_model():
        await manager.stop_server()
        return {"ok": True, "message": "Model unloaded"}

    @app.post("/v1/vllm/tts/stream")
    async def stream_tts(request: TTSGenerationRequest):
        return StreamingResponse(
            manager.generate_stream(
                text=request.text,
                voice=request.voice,
                language=request.language,
                speed=request.speed,
            ),
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-cache",
                "X-Content-Type-Options": "nosniff",
            },
        )

    @app.post("/v1/vllm/tts/generate", response_model=TTSGenerationResponse)
    async def generate_tts(request: TTSGenerationRequest):
        if not manager._running:
            raise HTTPException(503, "vLLM server not running")

        try:
            import aiohttp
            payload = {
                "model": manager.model,
                "input": request.text,
                "voice": request.voice,
                "response_format": "wav",
                "speed": request.speed,
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{manager.base_url}/v1/audio/speech",
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=300),
                ) as resp:
                    if resp.status != 200:
                        error = await resp.text()
                        raise HTTPException(500, f"vLLM generation failed: {error}")

                    audio_bytes = await resp.read()

            import base64
            audio_data_url = f"data:audio/wav;base64,{base64.b64encode(audio_bytes).decode('ascii')}"

            return TTSGenerationResponse(
                ok=True,
                audio_url=f"/v1/vllm/tts/artifacts/stream.wav",
                audio_data_url=audio_data_url,
                duration=0.0,  # Would need ffprobe
                message="Generated via vLLM",
            )
        except Exception as e:
            raise HTTPException(500, f"Generation failed: {e}")

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "version": "0.1.0", "vllm_available": VLLM_AVAILABLE}

    return app


def main():
    import uvicorn
    app = create_vllm_app()
    uvicorn.run(app, host="0.0.0.0", port=8766)


if __name__ == "__main__":
    main()