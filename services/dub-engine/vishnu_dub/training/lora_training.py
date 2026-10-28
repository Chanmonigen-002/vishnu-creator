"""Vishnu Dub Engine — LoRA Training Module for VoxCPM2 (T5.5).

Enables voice fine-tuning on high-performance PCs (Tier T2/T3, GPU VRAM >= 8 GB)
and provides clear hardware-tier gating and diagnostics on lower-tier hardware (T1/CPU).
"""

import asyncio
import json
import math
import os
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import torch
import torch.nn as nn

try:
    from voxcpm.model.voxcpm2 import LoRAConfig, VoxCPM2Model
except ImportError:
    try:
        from voxcpm.model.voxcpm import LoRAConfig, VoxCPMModel as VoxCPM2Model
    except ImportError:
        LoRAConfig = None
        VoxCPM2Model = None

try:
    from voxcpm.training.accelerator import Accelerator as VoxCPMAccelerator
    from voxcpm.training.data import (
        BatchProcessor,
        build_dataloader,
        load_audio_text_datasets,
    )
    from voxcpm.training.validate import validate_manifest
except ImportError:
    VoxCPMAccelerator = None
    BatchProcessor = None
    build_dataloader = None
    load_audio_text_datasets = None
    validate_manifest = None


@dataclass
class TrainingConfig:
    """Configuration for LoRA training."""
    train_manifest: str
    val_manifest: str = ""
    base_model: str = "openbmb/VoxCPM2"
    lora_rank: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.05
    learning_rate: float = 1e-4
    num_epochs: int = 3
    batch_size: int = 1
    gradient_accumulation_steps: int = 8
    max_length: int = 2048
    save_steps: int = 500
    eval_steps: int = 500
    logging_steps: int = 10
    warmup_steps: int = 100
    seed: int = 42
    amp: bool = True
    use_ref_audio: bool = True
    output_dir: Optional[str] = None


def check_hardware_requirements() -> Tuple[bool, str]:
    """Verify that system meets hardware requirements for VoxCPM2 LoRA training.
    
    Requires Tier T2/T3 GPU with >= 8 GB VRAM.
    """
    if not torch.cuda.is_available():
        return (
            False,
            "VoxCPM2 LoRA training requires an NVIDIA GPU with at least 8 GB VRAM (Tier T2/T3). "
            "Current device is CPU-only (Tier T0/T1). "
            "Please run voice fine-tuning on a high-performance PC with a dedicated GPU.",
        )
    props = torch.cuda.get_device_properties(0)
    vram_gb = props.total_memory / (1024 ** 3)
    if vram_gb < 8.0:
        return (
            False,
            f"VoxCPM2 LoRA training requires a GPU with at least 8 GB VRAM (Tier T2/T3). "
            f"Detected: {props.name} with {vram_gb:.1f} GB VRAM (Tier T1). "
            f"Please run voice fine-tuning on a high-performance PC with >= 8 GB VRAM.",
        )
    return True, f"Hardware check passed: {props.name} with {vram_gb:.1f} GB VRAM (Tier T2/T3)."


class LoRATrainer:
    """LoRA fine-tuning trainer for VoxCPM2."""

    def __init__(
        self,
        config: TrainingConfig,
        output_dir: Path,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.config = config
        self.output_dir = Path(config.output_dir) if config.output_dir else output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.progress_callback = progress_callback
        self.current_epoch = 0
        self.current_step = 0
        self.total_steps = 0
        self.loss: Optional[float] = None
        self.eval_loss: Optional[float] = None
        self.learning_rate: Optional[float] = None
        self._should_stop = False

    def _update_progress(self, status: Dict[str, Any]):
        if self.progress_callback:
            self.progress_callback(status)

    def check_hardware_requirements(self) -> None:
        """Verify that system meets hardware requirements for VoxCPM2 LoRA training.
        
        Requires Tier T2/T3 GPU with >= 8 GB VRAM.
        """
        ok, msg = check_hardware_requirements()
        if not ok:
            raise RuntimeError(msg)

    async def train(self):
        """Run the LoRA training process on high-performance GPU hardware."""
        self.check_hardware_requirements()

        if VoxCPMAccelerator is None or VoxCPM2Model is None:
            raise RuntimeError("voxcpm training components are not available in the python environment")

        # Load base model
        model = VoxCPM2Model.from_pretrained(
            self.config.base_model,
            optimize=False,
            device="cuda",
        )

        # Enable LoRA
        lora_cfg = LoRAConfig(
            r=self.config.lora_rank,
            alpha=self.config.lora_alpha,
            dropout=self.config.lora_dropout,
            enable_lm=True,
            enable_dit=True,
            enable_proj=False,
        )
        model.load_lora_config(lora_cfg)

        lora_params = model.get_lora_state_dict()
        trainable_params = sum(p.numel() for p in lora_params.values())
        total_params = sum(p.numel() for p in model.parameters())

        accelerator = VoxCPMAccelerator(amp=self.config.amp)

        train_ds, val_ds = load_audio_text_datasets(
            train_manifest=self.config.train_manifest,
            val_manifest=self.config.val_manifest,
        )

        train_dataloader = build_dataloader(
            train_ds,
            accelerator=accelerator,
            batch_size=self.config.batch_size,
            num_workers=0,
            drop_last=True,
        )

        val_dataloader = None
        if self.config.val_manifest:
            val_dataloader = build_dataloader(
                val_ds,
                accelerator=accelerator,
                batch_size=self.config.batch_size,
                num_workers=0,
                shuffle=False,
                drop_last=False,
            )

        model = accelerator.prepare_model(model)
        lora_param_names = set(lora_params.keys())
        optimizer = torch.optim.AdamW(
            [p for n, p in model.named_parameters() if n in lora_param_names],
            lr=self.config.learning_rate,
            betas=(0.9, 0.999),
            weight_decay=0.01,
        )
        optimizer = accelerator.prepare_optimizer(optimizer)

        from torch.optim.lr_scheduler import LambdaLR

        steps_per_epoch = max(1, len(train_dataloader) // self.config.gradient_accumulation_steps)
        self.total_steps = steps_per_epoch * self.config.num_epochs

        def lr_lambda(step):
            if step < self.config.warmup_steps:
                return float(step) / float(max(1, self.config.warmup_steps))
            progress = (step - self.config.warmup_steps) / max(1, self.total_steps - self.config.warmup_steps)
            return 0.5 * (1 + math.cos(math.pi * progress))

        scheduler = LambdaLR(optimizer, lr_lambda)

        train_dataloader = accelerator.prepare_dataloader(
            train_dataloader.dataset,
            batch_size=self.config.batch_size,
            shuffle=True,
            num_workers=0,
            drop_last=True,
        )

        global_step = 0
        best_eval_loss = float('inf')

        for epoch in range(self.config.num_epochs):
            self.current_epoch = epoch + 1
            model.train()

            for batch_idx, batch in enumerate(train_dataloader):
                if self._should_stop:
                    break

                with accelerator.autocast():
                    packed = BatchProcessor(
                        config=model.config,
                        audio_vae=model.audio_vae,
                        dataset_cnt=model.config.dataset_cnt,
                        device=accelerator.device,
                    )(batch)

                    outputs = model(**packed)
                    loss = outputs.loss / self.config.gradient_accumulation_steps

                accelerator.backward(loss)

                if (batch_idx + 1) % self.config.gradient_accumulation_steps == 0:
                    accelerator.step(optimizer)
                    accelerator.update()
                    scheduler.step()
                    optimizer.zero_grad()

                    global_step += 1
                    self.current_step = global_step
                    self.loss = float(loss.item() * self.config.gradient_accumulation_steps)
                    self.learning_rate = scheduler.get_last_lr()[0]

                    if global_step % self.config.logging_steps == 0:
                        self._update_progress({
                            "current_epoch": epoch + 1,
                            "current_step": global_step,
                            "total_steps": self.total_steps,
                            "loss": self.loss,
                            "learning_rate": self.learning_rate,
                            "progress": (global_step / self.total_steps) * 100 if self.total_steps > 0 else 0.0,
                        })

                    if global_step % self.config.eval_steps == 0 and val_dataloader:
                        eval_loss = await self._evaluate(model, val_dataloader, accelerator)
                        self.eval_loss = eval_loss
                        self._update_progress({"eval_loss": self.eval_loss})
                        if eval_loss < best_eval_loss:
                            best_eval_loss = eval_loss
                            self._save_checkpoint("best", epoch, global_step, model)

                    if global_step % self.config.save_steps == 0:
                        self._save_checkpoint(f"step_{global_step}", epoch, global_step, model)

            if val_dataloader:
                eval_loss = await self._evaluate(model, val_dataloader, accelerator)
                self.eval_loss = eval_loss
                self._update_progress({"eval_loss": self.eval_loss})

        self._save_checkpoint("final", self.current_epoch, global_step, model)

    async def _evaluate(self, model, val_dataloader, accelerator) -> float:
        model.eval()
        total_loss = 0.0
        num_batches = 0

        with torch.no_grad():
            for batch in val_dataloader:
                with accelerator.autocast():
                    packed = BatchProcessor(
                        config=model.config,
                        audio_vae=model.audio_vae,
                        dataset_cnt=model.config.dataset_cnt,
                        device=accelerator.device,
                    )(batch)
                    outputs = model(**packed)
                    loss = outputs.loss
                total_loss += float(loss.item())
                num_batches += 1

        model.train()
        return total_loss / max(1, num_batches)

    def _save_checkpoint(self, name: str, epoch: int, step: int, model):
        checkpoint_dir = self.output_dir / name
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        lora_state_dict = model.get_lora_state_dict()
        torch.save(lora_state_dict, checkpoint_dir / "lora_weights.ckpt")

        config_dict = {
            "lora_rank": self.config.lora_rank,
            "lora_alpha": self.config.lora_alpha,
            "lora_dropout": self.config.lora_dropout,
            "learning_rate": self.learning_rate or self.config.learning_rate,
            "epoch": epoch,
            "step": step,
            "loss": self.loss,
            "eval_loss": self.eval_loss,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(self.output_dir / "training_config.json", "w", encoding="utf-8") as f:
            json.dump(config_dict, f, indent=2)

    def stop(self):
        self._should_stop = True


# ─── Training Registry ────────────────────────────────────────────────────────

_TRAININGS_REGISTRY: Dict[str, Dict[str, Any]] = {}


def _get_registry_file() -> Optional[Path]:
    try:
        from vishnu_dub.config import settings
        if settings and settings.jobs_path:
            p = Path(settings.jobs_path) / "lora_trainings" / "registry.json"
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
    except Exception:
        pass
    return None


def _load_registry() -> Dict[str, Dict[str, Any]]:
    global _TRAININGS_REGISTRY
    reg_file = _get_registry_file()
    if reg_file and reg_file.exists():
        try:
            data = json.loads(reg_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                _TRAININGS_REGISTRY.update(data)
        except Exception:
            pass
    return _TRAININGS_REGISTRY


def _save_registry():
    reg_file = _get_registry_file()
    if reg_file:
        try:
            reg_file.write_text(json.dumps(_TRAININGS_REGISTRY, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass


async def run_lora_training(
    training_id: str,
    config: Dict[str, Any],
    output_dir: Path,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
):
    """Run LoRA training with the given configuration."""
    config_obj = TrainingConfig(**config)
    config_obj.output_dir = str(output_dir)

    trainer = LoRATrainer(config_obj, output_dir, progress_callback)
    await trainer.train()


async def get_training_status(training_id: str) -> Dict[str, Any]:
    """Get training status from the persistent registry."""
    reg = _load_registry()
    if training_id in reg:
        return reg[training_id]
    return {
        "id": training_id,
        "status": "not_found",
        "progress": 0.0,
    }


async def list_trainings() -> List[Dict[str, Any]]:
    """List all training jobs."""
    reg = _load_registry()
    return list(reg.values())


def update_registry_job(training_id: str, updates: Dict[str, Any]):
    """Update training job record in registry."""
    reg = _load_registry()
    if training_id not in reg:
        reg[training_id] = {"id": training_id}
    reg[training_id].update(updates)
    _save_registry()


def delete_training_job(training_id: str) -> bool:
    """Delete training job record and outputs."""
    reg = _load_registry()
    if training_id in reg:
        job = reg.pop(training_id)
        _save_registry()
        out_dir = job.get("output_dir")
        if out_dir and Path(out_dir).exists():
            import shutil
            shutil.rmtree(out_dir, ignore_errors=True)
        return True
    return False
