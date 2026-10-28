"""Vishnu Dub Engine — Model management, storage on largest drive, and device selection."""

import gc
import os
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import psutil

from vishnu_dub.catalog import DEFAULT_MODEL_CATALOG, ModelCatalogItem, find_model_in_catalog
from vishnu_dub.downloader import compute_sha256, download_file, download_file_sync


def resolve_model_store_path() -> Path:
    """Resolve model storage root, defaulting to the drive with the most free space.

    Priority:
    1. VISHNU_DUB_MODEL_STORE, VISHNUCREATOR_MODELS_DIR, or VISHNU_MODEL_DIR environment variable
    2. Drive with the most free disk space (e.g. D:/.vishnucreator/models or D:/VishnuCreatorData/models)
    3. Fallback to ~/.vishnucreator/models or current working directory / .vishnucreator/models
    """
    configured = (
        os.environ.get("VISHNU_DUB_MODEL_STORE")
        or os.environ.get("VISHNUCREATOR_MODELS_DIR")
        or os.environ.get("VISHNU_MODEL_DIR")
    )
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
        candidate_dot = mount_path / ".vishnucreator" / "models"
        candidate_legacy = mount_path / "VishnuCreatorData" / "models"
        if not candidate_dot.exists() and candidate_legacy.exists():
            target_dir = candidate_legacy
        else:
            target_dir = candidate_dot
    else:
        user_dot = Path.home() / ".vishnucreator" / "models"
        target_dir = user_dot if user_dot.parent.exists() else (Path.cwd() / ".vishnucreator" / "models")

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir
    except (PermissionError, OSError):
        # Fallback to local user or cwd
        local_dir = Path.cwd() / ".vishnucreator" / "models"
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

    def resolve_model_path(self, item: ModelCatalogItem) -> Path:
        return self.root_dir / item.target_subdir / item.filename

    def get_available_disk_free_bytes(self) -> int:
        try:
            return psutil.disk_usage(str(self.root_dir)).free
        except (PermissionError, OSError):
            return 0

    def list_models(self) -> Dict[str, Any]:
        models_list: List[Dict[str, Any]] = []
        for item in DEFAULT_MODEL_CATALOG:
            local_path = self.resolve_model_path(item)
            installed = local_path.exists() and local_path.is_file()
            size = local_path.stat().st_size if installed else 0

            models_list.append({
                "id": item.id,
                "name": item.name,
                "category": item.category,
                "description": item.description,
                "size_bytes": item.size_bytes,
                "expected_sha256": item.expected_sha256,
                "source_url": item.source_url,
                "filename": item.filename,
                "target_subdir": item.target_subdir,
                "recommended_for_tier": item.recommended_for_tier,
                "installed": installed,
                "local_path": str(local_path),
                "local_size_bytes": size,
                "sha256_verified": False,
            })

        return {
            "models_root": str(self.root_dir),
            "available_disk_free_bytes": self.get_available_disk_free_bytes(),
            "models": models_list,
        }

    def get_model(self, model_id: str) -> Optional[Dict[str, Any]]:
        item = find_model_in_catalog(model_id)
        if not item:
            return None
        local_path = self.resolve_model_path(item)
        installed = local_path.exists() and local_path.is_file()
        size = local_path.stat().st_size if installed else 0
        return {
            "id": item.id,
            "name": item.name,
            "category": item.category,
            "description": item.description,
            "size_bytes": item.size_bytes,
            "expected_sha256": item.expected_sha256,
            "source_url": item.source_url,
            "filename": item.filename,
            "target_subdir": item.target_subdir,
            "recommended_for_tier": item.recommended_for_tier,
            "installed": installed,
            "local_path": str(local_path),
            "local_size_bytes": size,
            "sha256_verified": False,
        }

    def verify_model(self, model_id: str) -> Dict[str, Any]:
        item = find_model_in_catalog(model_id)
        if not item:
            return {
                "model_id": model_id,
                "valid": False,
                "expected_sha256": "",
                "error": f"Model '{model_id}' is not in catalog",
            }
        local_path = self.resolve_model_path(item)
        if not local_path.exists():
            return {
                "model_id": model_id,
                "valid": False,
                "expected_sha256": item.expected_sha256,
                "error": f"Model file not found at {local_path}",
            }
        calculated = compute_sha256(local_path)
        valid = calculated.lower() == item.expected_sha256.lower()
        res = {
            "model_id": model_id,
            "valid": valid,
            "expected_sha256": item.expected_sha256,
            "calculated_sha256": calculated,
        }
        if not valid:
            res["error"] = f"SHA-256 verification mismatch for {model_id}"
        return res

    def delete_model(self, model_id: str) -> Dict[str, Any]:
        item = find_model_in_catalog(model_id)
        if not item:
            return {"model_id": model_id, "deleted": False, "message": f"Model '{model_id}' not found in catalog"}
        local_path = self.resolve_model_path(item)
        part_path = local_path.with_name(f"{local_path.name}.part")
        deleted = False
        if local_path.exists():
            try:
                local_path.unlink()
                deleted = True
            except OSError as e:
                return {"model_id": model_id, "deleted": False, "message": str(e)}
        if part_path.exists():
            try:
                part_path.unlink()
                deleted = True
            except OSError:
                pass
        return {
            "model_id": model_id,
            "deleted": deleted,
            "message": f"Model '{model_id}' deleted" if deleted else "Model file was not on disk",
        }

    async def download_model(
        self,
        model_id: str,
        force_redownload: bool = False,
        on_progress: Optional[Callable[[int, int], None]] = None,
    ) -> Dict[str, Any]:
        item = find_model_in_catalog(model_id)
        if not item:
            raise ValueError(f"Model '{model_id}' not found in catalog")

        local_path = self.resolve_model_path(item)
        local_path.parent.mkdir(parents=True, exist_ok=True)

        if local_path.exists() and not force_redownload:
            verify_res = self.verify_model(model_id)
            if verify_res.get("valid"):
                size = local_path.stat().st_size
                if on_progress:
                    on_progress(size, size)
                return {
                    "model_id": model_id,
                    "status": "installed",
                    "bytes_downloaded": size,
                    "total_bytes": size,
                    "percent": 100.0,
                    "speed_bytes_per_sec": 0,
                    "local_path": str(local_path),
                }
            else:
                local_path.unlink(missing_ok=True)

        downloaded_path = await download_file(
            url=item.source_url,
            dest_path=local_path,
            expected_sha256=item.expected_sha256,
            on_progress=on_progress,
        )
        final_size = downloaded_path.stat().st_size
        return {
            "model_id": model_id,
            "status": "installed",
            "bytes_downloaded": final_size,
            "total_bytes": final_size,
            "percent": 100.0,
            "speed_bytes_per_sec": 0,
            "local_path": str(downloaded_path),
        }

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
