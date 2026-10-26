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
