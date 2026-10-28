#!/usr/bin/env python3
"""
Zero-Shot Ultimate Cloning CLI for OpenBMB VoxCPM2
Optimized for low-spec / custom hardware tiers (T1 CPU to T2/T3 CUDA).
"""

import argparse
import gc
import os
import sys
from pathlib import Path
from typing import Optional, Tuple

import soundfile as sf
import torch


def detect_optimal_device() -> Tuple[str, float, str]:
    """Detects available hardware VRAM and returns (device, vram_gb, recommended_model)."""
    has_cuda = torch.cuda.is_available()
    vram_gb = 0.0
    if has_cuda:
        try:
            total_bytes = torch.cuda.get_device_properties(0).total_memory
            vram_gb = total_bytes / (1024 ** 3)
        except Exception:
            pass

    # >= 6GB VRAM can host VoxCPM2 on CUDA; < 6GB or no CUDA defaults to CPU
    if has_cuda and vram_gb >= 6.0:
        device = "cuda"
        model = "openbmb/VoxCPM2"
    elif has_cuda:
        device = "cuda"  # low VRAM cuda fallback possible with 1.5, or user can choose CPU
        model = "openbmb/VoxCPM1.5"
    else:
        device = "cpu"
        model = "openbmb/VoxCPM2"

    return device, vram_gb, model


def main():
    detected_device, detected_vram, rec_model = detect_optimal_device()

    parser = argparse.ArgumentParser(
        description="VoxCPM2 Low-Spec Voice Cloning & Synthesis CLI",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--text", "-t", type=str, required=True, help="Target text to synthesize")
    parser.add_argument("--audio", "-a", type=str, default=None, help="Path to reference audio file (.wav)")
    parser.add_argument(
        "--prompt_text", "-p", type=str, default=None,
        help="Transcript of reference audio (enables Ultimate Cloning mode when paired with --audio)",
    )
    parser.add_argument(
        "--style", "-s", type=str, default=None,
        help="Voice style description (e.g. 'cheerful', 'calm whisper', 'natural, clear tone')",
    )
    parser.add_argument("--output", "-o", type=str, default="output_clone.wav", help="Output WAV path")
    parser.add_argument(
        "--model", "-m", type=str, default="openbmb/VoxCPM2",
        help=f"Model HuggingFace ID or local path (detected recommendation: {rec_model})",
    )
    parser.add_argument(
        "--device", "-d", type=str, default="auto", choices=["auto", "cuda", "cpu"],
        help=f"Compute device (auto detected: {detected_device}, VRAM: {detected_vram:.1f} GB)",
    )
    parser.add_argument("--steps", type=int, default=6, help="Inference diffusion timesteps (low-spec default: 6)")
    parser.add_argument("--cfg", type=float, default=2.0, help="CFG guidance scale (default: 2.0)")
    parser.add_argument("--lora_path", type=str, default=None, help="Path to fine-tuned LoRA weights directory or file")
    parser.add_argument("--denoiser", action="store_true", default=False, help="Enable ZipEnhancer denoiser (requires extra VRAM)")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducible generation")

    args = parser.parse_args()

    # Determine device
    if args.device == "auto":
        target_device = detected_device
        # If GPU has < 6GB VRAM and VoxCPM2 is requested, fallback to CPU to avoid CUDA OOM
        if target_device == "cuda" and detected_vram < 6.0 and "VoxCPM2" in args.model:
            print(f"[Hardware Warning] GPU VRAM is {detected_vram:.1f} GB (< 6 GB). Falling back to CPU for VoxCPM2 stability.")
            target_device = "cpu"
    else:
        target_device = args.device

    print("=" * 60)
    print("VoxCPM2 Voice Cloning CLI")
    print(f"Device: {target_device} (Detected VRAM: {detected_vram:.2f} GB)")
    print(f"Model: {args.model}")
    print(f"Diffusion Steps: {args.steps} | CFG: {args.cfg} | Denoiser: {args.denoiser}")
    print("=" * 60)

    # Prepare styled text
    text_to_speak = args.text.strip()
    if args.style:
        clean_style = args.style.strip("() ")
        if not text_to_speak.startswith("("):
            text_to_speak = f"({clean_style}) {text_to_speak}"
            print(f"Applied style control: {text_to_speak}")

    # Configure cloning mode
    prompt_wav = None
    reference_wav = None
    prompt_text = None

    if args.audio:
        audio_path = Path(args.audio).resolve()
        if not audio_path.exists():
            print(f"Error: Reference audio file '{args.audio}' not found.", file=sys.stderr)
            sys.exit(1)

        reference_wav = str(audio_path)

        if args.prompt_text:
            print("[Mode] Ultimate Cloning Mode: using transcript-guided audio continuation")
            prompt_wav = str(audio_path)
            prompt_text = args.prompt_text.strip()
        else:
            print("[Mode] Quick/Basic Cloning Mode: reference audio only")

    # Load Model
    from voxcpm import VoxCPM

    print(f"Loading VoxCPM model from {args.model}...")
    load_kwargs = {
        "load_denoiser": args.denoiser,
        "device": target_device,
    }
    if args.lora_path:
        lora_p = Path(args.lora_path)
        if lora_p.exists():
            print(f"Attaching LoRA weights from: {lora_p}")
            load_kwargs["lora_weights_path"] = str(lora_p)
        else:
            print(f"Warning: LoRA path '{args.lora_path}' not found, ignoring.", file=sys.stderr)

    model = VoxCPM.from_pretrained(args.model, **load_kwargs)

    # Generation
    print("Synthesizing audio...")
    try:
        audio_np = model.generate(
            text=text_to_speak,
            prompt_wav_path=prompt_wav,
            prompt_text=prompt_text,
            reference_wav_path=reference_wav,
            inference_timesteps=args.steps,
            cfg_value=args.cfg,
            denoise=args.denoiser,
            seed=args.seed,
        )

        out_path = Path(args.output).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        sr = getattr(model.tts_model, "sample_rate", 48000)

        sf.write(str(out_path), audio_np, sr)
        print(f"Saved generated audio ({sr} Hz, {len(audio_np)/sr:.2f}s) to: {out_path}")

    finally:
        # Low-spec memory cleanup
        del model
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
