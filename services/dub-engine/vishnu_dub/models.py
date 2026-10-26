"""Vishnu Dub Engine — Model management, storage on largest drive, and device selection."""

import gc
import os
import sys
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

import psutil

from vishnu_dub.downloader import download_file, download_file_sync


def resolve_model_store_path() -> Path:
    """Resolve model storage root, defaulting to the drive with the most free space.

    Priority:
    1. VISHNU_DUB_MODEL_STORE or VISHNU_MODEL_DIR environment variable
    2. Drive with the most free disk space (e.g. D: with 300+ GB vs C: with 20 GB)
    3. Fallback to current working directory / models
    """
    configured = os.environ.get("VISHNU_DUB_MODEL_STORE") or os.environ.get("VISHNU_MODEL_DIR")
    if configured:
        p = Path(configured).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    best_mount: Optional[str] = None
    max_free_bytes = -1

    for partition in psutil.disk_partitions(all=False):
        try:
            # Skip read-only or CD-ROM drives
            if "cdrom" in partition.opts or "ro" in partition.opts:
                continue
            usage = psutil.disk_usage(partition.mountpoint)
            if usage.free > max_free_bytes:
                max_free_bytes = usage.free
                best_mount = partition.mountpoint
        except (PermissionError, OSError):
            continue

    if best_mount:
        mount_path = Path(best_mount)
        target_dir = mount_path / "VishnuCreatorData" / "models"
    else:
        target_dir = Path.cwd() / "models"

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir
    except (PermissionError, OSError):
        # Fallback to local user or cwd
        local_dir = Path.cwd() / "models"
        local_dir.mkdir(parents=True, exist_ok=True)
        return local_dir


def select_device_and_threads(
    tier: Optional[str] = None,
    enable_gpu: bool = True,
) -> Tuple[str, int]:
    """Select compute device and thread configuration per hardware tier (ADR-0003).

    T0 (Minimal): CPU only, all physical cores
    T1 (Low): CPU only, all physical cores, torch.set_num_threads(cores)
    T2 (Mid): CUDA if VRAM fits and CUDA is available; otherwise CPU
    T3 (High): CUDA
    """
    cores = psutil.cpu_count(logical=False) or 1

    effective_tier = tier or "T1"

    if effective_tier in ("T0", "T1") or not enable_gpu:
        device = "cpu"
    elif effective_tier in ("T2", "T3"):
        try:
            import torch
            if torch.cuda.is_available():
                device = "cuda"
            else:
                device = "cpu"
        except ImportError:
            device = "cpu"
    else:
        device = "cpu"

    if device == "cpu":
        try:
            import torch
            torch.set_num_threads(cores)
        except (ImportError, RuntimeError):
            pass
        return "cpu", cores

    return "cuda", 1


class ModelManager:
    """Singleton model lifecycle manager enforcing single-model residency on T0/T1/T2."""

    _instance: Optional["ModelManager"] = None

    def __init__(self):
        self.current_model_name: Optional[str] = None
        self.current_model: Any = None
        self.current_tier: str = "T1"

    @classmethod
    def get_instance(cls) -> "ModelManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        if cls._instance is not None:
            cls._instance.release_current_model()
            cls._instance = None

    def set_tier(self, tier: str) -> None:
        self.current_tier = tier

    def is_single_model_tier(self, tier: Optional[str] = None) -> bool:
        """T0, T1, and T2 only keep one model loaded at a time."""
        t = tier or self.current_tier
        return t in ("T0", "T1", "T2")

    def acquire_model(
        self,
        name: str,
        loader_fn: Callable[[], Any],
        tier: Optional[str] = None,
    ) -> Any:
        """Acquire a model by name, evicting any previously loaded model if single-model mode applies."""
        t = tier or self.current_tier
        if self.is_single_model_tier(t):
            if self.current_model_name is not None and self.current_model_name != name:
                self.release_current_model()

        if self.current_model is None or self.current_model_name != name:
            self.current_model = loader_fn()
            self.current_model_name = name

        return self.current_model

    def release_current_model(self) -> None:
        """Evict the currently loaded model and reclaim memory."""
        if self.current_model is not None:
            if hasattr(self.current_model, "unload"):
                try:
                    self.current_model.unload()
                except Exception:
                    pass
            self.current_model = None
            self.current_model_name = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass


class ModelStore:
    """Manages local model checkpoints and downloads on the configured storage drive."""

    def __init__(self, root_dir: Optional[Path] = None):
        self.root_dir = root_dir or resolve_model_store_path()
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def get_model_dir(self, model_id: str) -> Path:
        clean_id = model_id.replace("/", "_").replace("\\", "_")
        d = self.root_dir / clean_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    async def ensure_model_file(
        self,
        url: str,
        model_id: str,
        filename: str,
        expected_sha256: Optional[str] = None,
        on_progress: Optional[Callable[[int, int], None]] = None,
    ) -> Path:
        """Download and verify a model file into the model store."""
        target_dir = self.get_model_dir(model_id)
        target_file = target_dir / filename
        return await download_file(
            url=url,
            dest_path=target_file,
            expected_sha256=expected_sha256,
            on_progress=on_progress,
        )
