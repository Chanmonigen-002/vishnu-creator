"""Vishnu Dub Engine — LoRA Training Module."""

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

import argbind
import torch
import torch.nn as nn
from accelerate import Accelerator
from datasets import load_dataset
from torch.utils.data import DataLoader

from vishnu_dub.model.voxcpm import VoxCPMModel
from vishnu_dub.modules.audiovae import AudioVAE
from vishnu_dub.training.accelerator import Accelerator as VoxCPMAccelerator
from vishnu_dub.training.data import (
    BatchProcessor,
    HFVoxCPMDataset,
    build_dataloader,
    load_audio_text_datasets,
)
from vishnu_dub.training.validate import validate_manifest


@dataclass
class TrainingConfig:
    """Configuration for LoRA training."""
    train_manifest: str
    val_manifest: str = ""
    base_model: str = "Mariya987/VoxCPM2"
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


class LoRATrainer:
    """LoRA fine-tuning trainer for VoxCPM2."""
    
    def __init__(
        self,
        config: TrainingConfig,
        output_dir: Path,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.config = config
        self.output_dir = Path(config.output_dir) if config.output_dir else Path(config.output_dir or "lora_trainings") / f"training_{uuid.uuid4().hex[:8]}"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.progress_callback = progress_callback
        self.current_epoch = 0
        self.current_step = 0
        self.total_steps = 0
        self.loss = None
        self.eval_loss = None
        self.learning_rate = None
        self._should_stop = False
        
    def _update_progress(self, status: Dict[str, Any]):
        if self.progress_callback:
            self.progress_callback(status)
    
    async def train(self):
        """Run the LoRA training process."""
        from vishnu_dub.model.voxcpm import VoxCPMModel
        from vishnu_dub.modules.audiovae import AudioVAE
        from vishnu_dub.training.accelerator import Accelerator as VoxCPMAccelerator
        from vishnu_dub.training.data import load_audio_text_datasets, build_dataloader, BatchProcessor
        from vishnu_dub.model.voxcpm import VoxCPMConfig
        
        # Load base model
        model = VoxCPMModel.from_pretrained(
            self.config.base_model,
            optimize=False,  # Don't optimize for training
            device="cuda" if torch.cuda.is_available() else "cpu",
        )
        
        # Enable LoRA
        from vishnu_dub.model.voxcpm import LoRAConfig
        lora_config = LoRAConfig(
            lora_rank=self.config.lora_rank,
            lora_alpha=self.config.lora_alpha,
            lora_dropout=self.config.lora_dropout,
            enable_lm=True,
            enable_dit=True,
            enable_proj=False,
        )
        model.load_lora_config(lora_config)
        
        # Setup LoRA parameters
        lora_params = model.get_lora_state_dict()
        trainable_params = sum(p.numel() for p in lora_params.values())
        total_params = sum(p.numel() for p in model.parameters())
        print(f"Trainable parameters: {trainable_params:,} / {total_params:,} ({100 * trainable_params / total_params:.2f}%)")
        
        # Setup accelerator
        accelerator = VoxCPMAccelerator(amp=self.config.amp)
        
        # Load datasets
        train_ds, val_ds = load_audio_text_datasets(
            train_manifest=self.config.train_manifest,
            val_manifest=self.config.val_manifest,
        )
        
        # Build dataloaders
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
        
        # Prepare model and optimizer
        model = accelerator.prepare_model(model)
        
        # Only optimize LoRA parameters
        lora_param_names = set(lora_params.keys())
        optimizer = torch.optim.AdamW(
            [p for n, p in model.named_parameters() if n in lora_param_names],
            lr=self.config.learning_rate,
            betas=(0.9, 0.999),
            weight_decay=0.01,
        )
        optimizer = accelerator.prepare_optimizer(optimizer)
        
        # Learning rate scheduler
        from torch.optim.lr_scheduler import LambdaLR
        
        def lr_lambda(step):
            if step < self.config.warmup_steps:
                return float(step) / float(max(1, self.config.warmup_steps))
            # Cosine decay
            progress = (step - self.config.warmup_steps) / max(1, self.total_steps - self.config.warmup_steps)
            return 0.5 * (1 + math.cos(math.pi * progress))
        
        # Calculate total steps
        steps_per_epoch = len(train_dataloader) // self.config.gradient_accumulation_steps
        self.total_steps = steps_per_epoch * self.config.num_epochs
        
        scheduler = LambdaLR(optimizer, lr_lambda)
        
        # Prepare dataloaders
        train_dataloader = accelerator.prepare_dataloader(
            train_dataloader.dataset,
            batch_size=self.config.batch_size,
            shuffle=True,
            num_workers=0,
            drop_last=True,
        )
        
        if val_dataloader:
            val_dataloader = accelerator.prepare_dataloader(
                val_dataloader.dataset,
                batch_size=self.config.batch_size,
                shuffle=False,
                num_workers=0,
                drop_last=False,
            )
        
        # Training loop
        global_step = 0
        best_eval_loss = float('inf')
        
        for epoch in range(self.config.num_epochs):
            self.current_epoch = epoch + 1
            model.train()
            
            epoch_loss = 0.0
            num_batches = 0
            
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
                    self.total_steps = self.config.num_epochs * len(train_dataloader) // self.config.gradient_accumulation_steps
                    self.loss = loss.item() * self.config.gradient_accumulation_steps
                    self.learning_rate = scheduler.get_last_lr()[0]
                    
                    # Logging
                    if global_step % self.config.logging_steps == 0:
                        self._update_progress({
                            "current_epoch": epoch + 1,
                            "current_step": global_step,
                            "total_steps": self.total_steps,
                            "loss": self.loss,
                            "learning_rate": self.learning_rate,
                            "progress": (global_step / self.total_steps) * 100 if self.total_steps > 0 else 0,
                        })
                    
                    # Evaluation
                    if global_step % self.config.eval_steps == 0 and val_dataloader:
                        eval_loss = await self._evaluate(model, val_dataloader, accelerator)
                        self.eval_loss = eval_loss
                        self._update_progress({
                            "eval_loss": self.eval_loss,
                        })
                        
                        # Save best model
                        if eval_loss < best_eval_loss:
                            best_eval_loss = eval_loss
                            self._save_checkpoint(f"best", epoch, global_step)
                    
                    # Save checkpoint
                    if global_step % self.config.save_steps == 0:
                        self._save_checkpoint(f"step_{global_step}", epoch, global_step)
            
            # End of epoch evaluation
            if val_dataloader:
                eval_loss = await self._evaluate(model, val_dataloader, accelerator)
                self.eval_loss = eval_loss
                self._update_progress({
                    "eval_loss": self.eval_loss,
                })
        
        # Final save
        self._save_checkpoint("final", self.current_epoch - 1, global_step)
    
    async def _evaluate(self, model, val_dataloader, accelerator) -> float:
        """Evaluate model on validation set."""
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
                
                total_loss += loss.item()
                num_batches += 1
        
        model.train()
        return total_loss / max(1, num_batches)
    
    def _save_checkpoint(self, name: str, epoch: int, step: int):
        """Save LoRA checkpoint."""
        checkpoint_dir = self.output_dir / name
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        
        # Save LoRA weights
        lora_state_dict = self.model.get_lora_state_dict()
        torch.save(lora_state_dict, checkpoint_dir / "lora_weights.ckpt")
        
        # Save config
        config_dict = {
            "lora_rank": self.config.lora_rank,
            "lora_alpha": self.config.lora_alpha,
            "lora_dropout": self.config.lora_dropout,
            "learning_rate": self.config.learning_rate,
            "epoch": epoch,
            "step": step,
            "loss": self.loss,
            "eval_loss": self.eval_loss,
            "learning_rate": self.learning_rate,
        }
        with open(self.output_dir / "training_config.json", "w") as f:
            json.dump(config_dict, f, indent=2)
    
    def stop(self):
        self._should_stop = True


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


async def run_lora_training_background(
    training_id: str,
    config: Dict[str, Any],
    output_dir: Path,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
):
    """Run LoRA training in background with proper error handling."""
    try:
        await run_lora_training(training_id, config, Path(config.get("output_dir", "")), progress_callback)
    except Exception as e:
        raise e


async def get_training_status(training_id: str) -> Dict[str, Any]:
    """Get training status (placeholder - would use persistent storage in production)."""
    return {
        "id": training_id,
        "status": "unknown",
    }


async def list_trainings() -> List[Dict[str, Any]]:
    """List all training jobs (placeholder)."""
    return []


async def run_lora_training_from_config(config_path: str):
    """Run training from a config file."""
    import yaml
    with open(config_path, "r") as f:
        config = yaml.safe_load(f)
    
    output_dir = Path(config.get("output_dir", "lora_trainings")) / f"training_{uuid.uuid4().hex[:8]}"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    await run_lora_training(
        training_id=uuid.uuid4().hex[:8],
        config=config,
        output_dir=output_dir,
    )


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=str, required=True)
    args = parser.parse_args()
    
    asyncio.run(run_lora_training_from_config(args.config))