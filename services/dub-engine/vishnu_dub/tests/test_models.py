"""Tests for vishnu_dub.models (model manager, storage resolver, and device selection)."""

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import psutil
import pytest

from vishnu_dub.models import (
    ModelManager,
    ModelStore,
    resolve_model_store_path,
    select_device_and_threads,
)


def test_resolve_model_store_path_env_override(tmp_path: Path):
    custom = tmp_path / "custom_models"
    with patch.dict(os.environ, {"VISHNU_DUB_MODEL_STORE": str(custom)}):
        resolved = resolve_model_store_path()
        assert resolved == custom
        assert resolved.exists()


def test_resolve_model_store_path_finds_largest_free_drive():
    resolved = resolve_model_store_path()
    assert resolved.exists()
    assert resolved.is_dir()
    # On this machine, D: is the largest drive with >300GB free
    if os.name == "nt":
        assert str(resolved).upper().startswith("D:")


def test_select_device_and_threads_tier_t1():
    import torch

    device, cores = select_device_and_threads(tier="T1", enable_gpu=True)
    assert device == "cpu"
    assert cores >= 1
    assert torch.get_num_threads() == cores


def test_select_device_and_threads_tier_t0():
    device, cores = select_device_and_threads(tier="T0", enable_gpu=True)
    assert device == "cpu"
    assert cores >= 1


def test_model_manager_single_model_lifecycle():
    manager = ModelManager.get_instance()
    manager.reset()
    manager = ModelManager.get_instance()
    manager.set_tier("T1")

    assert manager.is_single_model_tier("T1") is True
    assert manager.is_single_model_tier("T0") is True
    assert manager.is_single_model_tier("T2") is True
    assert manager.is_single_model_tier("T3") is False

    mock_whisper = MagicMock()
    mock_voxcpm = MagicMock()

    # Load model A
    m1 = manager.acquire_model("faster-whisper", lambda: mock_whisper)
    assert m1 == mock_whisper
    assert manager.current_model_name == "faster-whisper"

    # Acquiring model A again reuses without re-loading
    loader_spy = MagicMock()
    m1_again = manager.acquire_model("faster-whisper", loader_spy)
    assert m1_again == mock_whisper
    loader_spy.assert_not_called()

    # Load model B on T1 -> triggers unload of model A
    m2 = manager.acquire_model("voxcpm2", lambda: mock_voxcpm)
    assert m2 == mock_voxcpm
    assert manager.current_model_name == "voxcpm2"
    mock_whisper.unload.assert_called_once()

    # Manual release
    manager.release_current_model()
    assert manager.current_model is None
    assert manager.current_model_name is None
    mock_voxcpm.unload.assert_called_once()


def test_model_store_dir_resolution(tmp_path: Path):
    store = ModelStore(root_dir=tmp_path / "models")
    model_dir = store.get_model_dir("openbmb/VoxCPM2")

    assert model_dir.exists()
    assert model_dir.name == "openbmb_VoxCPM2"


def test_model_store_list_and_catalog(tmp_path: Path):
    store = ModelStore(root_dir=tmp_path / "models")
    listing = store.list_models()

    assert "models_root" in listing
    assert "available_disk_free_bytes" in listing
    assert len(listing["models"]) >= 6

    # Verify model IDs in catalog
    ids = [m["id"] for m in listing["models"]]
    assert "whisper-small-int8" in ids
    assert "whisper-large-v3-turbo" in ids
    assert "htdemucs" in ids
    assert "voxcpm2-khmer" in ids
    assert "noto-sans-khmer" in ids


def test_model_store_verify_and_delete(tmp_path: Path):
    import hashlib

    store = ModelStore(root_dir=tmp_path / "models")
    item_id = "noto-sans-khmer"
    item_dict = store.get_model(item_id)
    assert item_dict is not None
    assert item_dict["installed"] is False

    # Check verification on missing file
    uninstalled_verify = store.verify_model(item_id)
    assert uninstalled_verify["valid"] is False
    assert "not found" in uninstalled_verify["error"]

    # Write a test file with correct expected hash
    target_path = Path(item_dict["local_path"])
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text("dummy font content for checksum test", encoding="utf-8")
    actual_hash = hashlib.sha256("dummy font content for checksum test".encode("utf-8")).hexdigest()

    # Mismatch with catalog expected hash
    mismatch_verify = store.verify_model(item_id)
    assert mismatch_verify["valid"] is False
    assert mismatch_verify["calculated_sha256"] == actual_hash

    # Delete model
    del_res = store.delete_model(item_id)
    assert del_res["deleted"] is True
    assert not target_path.exists()


def test_api_models_endpoints(tmp_path: Path, monkeypatch):
    from fastapi.testclient import TestClient
    import vishnu_dub.api as api_mod

    custom_store = ModelStore(root_dir=tmp_path / "test_models")
    monkeypatch.setattr(api_mod, "model_store", custom_store)

    client = TestClient(api_mod.app)

    # 1. GET /v1/models
    resp = client.get("/v1/models")
    assert resp.status_code == 200
    data = resp.json()
    assert "models" in data
    assert len(data["models"]) >= 6

    # 2. GET /v1/models/download/{model_id}
    prog_resp = client.get("/v1/models/download/whisper-small-int8")
    assert prog_resp.status_code == 200
    prog_data = prog_resp.json()
    assert prog_data["model_id"] == "whisper-small-int8"
    assert prog_data["status"] == "idle"

    # 3. GET unknown model returns 404
    not_found_resp = client.get("/v1/models/download/nonexistent")
    assert not_found_resp.status_code == 404

    # 4. POST /v1/models/verify on uninstalled model
    verify_resp = client.post("/v1/models/verify", json={"model_id": "whisper-small-int8"})
    assert verify_resp.status_code == 200
    assert verify_resp.json()["valid"] is False

    # 5. DELETE /v1/models/{model_id}
    del_resp = client.delete("/v1/models/whisper-small-int8")
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] is False
