#!/usr/bin/env python3
"""
VoxCPM2 Dataset Preparation Tool
Processes voice audio clips, trims trailing silence (< 0.4s), checks sample rates,
and outputs a training-ready train.jsonl manifest for LoRA fine-tuning.
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import soundfile as sf
import torch
import torchaudio


def trim_trailing_silence(
    audio: np.ndarray,
    sr: int,
    max_trailing_sec: float = 0.4,
    threshold_db: float = -40.0,
) -> np.ndarray:
    """Trims trailing silence to at most max_trailing_sec seconds."""
    if len(audio) == 0:
        return audio

    mono = np.mean(audio, axis=-1) if audio.ndim > 1 else audio
    max_amp = np.max(np.abs(mono))
    if max_amp < 1e-6:
        return audio

    threshold_amp = max(max_amp * (10.0 ** (threshold_db / 20.0)), 1e-4)
    active_indices = np.where(np.abs(mono) > threshold_amp)[0]
    if len(active_indices) == 0:
        return audio

    last_active = active_indices[-1]
    allowance_samples = int(max_trailing_sec * sr)
    cutoff = min(len(audio), last_active + allowance_samples)
    return audio[:cutoff]


def parse_transcripts(file_path: Path) -> Dict[str, str]:
    """Parses transcripts from .txt, .csv, or .tsv."""
    transcripts: Dict[str, str] = {}
    suffix = file_path.suffix.lower()

    if suffix in [".csv", ".tsv"]:
        delimiter = "\t" if suffix == ".tsv" else ","
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f, delimiter=delimiter)
            header = next(reader, None)
            # Find audio and text columns
            audio_idx = 0
            text_idx = 1
            if header:
                low_h = [col.lower().strip() for col in header]
                for i, col in enumerate(low_h):
                    if col in ["audio", "file", "wav", "filename", "id"]:
                        audio_idx = i
                    elif col in ["text", "transcript", "sentence", "prompt"]:
                        text_idx = i

            for row in reader:
                if len(row) > max(audio_idx, text_idx):
                    key = Path(row[audio_idx].strip()).stem
                    val = row[text_idx].strip()
                    if key and val:
                        transcripts[key] = val
    else:
        # Text file with formats: "filename|text", "filename: text", or "filename\ttext"
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                sep = None
                for candidate in ["|", "\t", ": "]:
                    if candidate in line:
                        sep = candidate
                        break
                if sep:
                    parts = line.split(sep, 1)
                    key = Path(parts[0].strip()).stem
                    val = parts[1].strip()
                    if key and val:
                        transcripts[key] = val

    return transcripts


def process_dataset(
    audio_dir: Path,
    transcripts_file: Path,
    output_manifest: Path,
    val_manifest: Optional[Path] = None,
    val_ratio: float = 0.1,
    target_sr: int = 16000,
    max_trailing_sec: float = 0.4,
    processed_dir: Optional[Path] = None,
) -> List[Dict]:
    """Inspects, trims, resamples audio files, and exports jsonl manifest."""
    if not audio_dir.exists():
        raise FileNotFoundError(f"Audio directory '{audio_dir}' does not exist.")
    if not transcripts_file.exists():
        raise FileNotFoundError(f"Transcripts file '{transcripts_file}' does not exist.")

    transcripts = parse_transcripts(transcripts_file)
    print(f"Loaded {len(transcripts)} transcripts from {transcripts_file.name}")

    if processed_dir is None:
        processed_dir = audio_dir.parent / f"{audio_dir.name}_processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    wav_files = sorted(list(audio_dir.glob("*.wav")) + list(audio_dir.glob("*.mp3")) + list(audio_dir.glob("*.flac")))
    print(f"Found {len(wav_files)} audio files in {audio_dir}")

    manifest_rows: List[Dict] = []
    skipped_count = 0

    for wav_file in wav_files:
        stem = wav_file.stem
        if stem not in transcripts:
            print(f"[Skip] No transcript found for {wav_file.name}")
            skipped_count += 1
            continue

        text = transcripts[stem]

        # Read audio
        audio_data, original_sr = sf.read(str(wav_file))

        # Convert to mono if needed
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=-1)

        # Resample if needed
        if original_sr != target_sr:
            tensor_audio = torch.from_numpy(audio_data.astype(np.float32)).unsqueeze(0)
            resampler = torchaudio.transforms.Resample(orig_freq=original_sr, new_freq=target_sr)
            audio_data = resampler(tensor_audio).squeeze(0).numpy()

        # Trim trailing silence to < max_trailing_sec
        trimmed_audio = trim_trailing_silence(audio_data, sr=target_sr, max_trailing_sec=max_trailing_sec)

        # Write processed wav
        dest_wav = processed_dir / f"{stem}.wav"
        sf.write(str(dest_wav), trimmed_audio, target_sr, subtype="PCM_16")

        duration = len(trimmed_audio) / target_sr
        manifest_rows.append({
            "audio": str(dest_wav.resolve()).replace("\\", "/"),
            "text": text,
            "duration": round(duration, 3),
        })

    print(f"Successfully processed {len(manifest_rows)} audio clips (Skipped: {skipped_count}).")

    if not manifest_rows:
        print("Warning: No matching rows generated for manifest.", file=sys.stderr)
        return []

    # Train / Val Split
    if val_manifest and val_ratio > 0.0 and len(manifest_rows) > 1:
        np.random.seed(42)
        indices = np.random.permutation(len(manifest_rows))
        split_point = int(len(manifest_rows) * (1.0 - val_ratio))
        train_indices = indices[:split_point]
        val_indices = indices[split_point:]

        train_rows = [manifest_rows[i] for i in train_indices]
        val_rows = [manifest_rows[i] for i in val_indices]

        # Write val manifest
        val_manifest.parent.mkdir(parents=True, exist_ok=True)
        with open(val_manifest, "w", encoding="utf-8") as f:
            for row in val_rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"Wrote {len(val_rows)} validation rows to: {val_manifest}")
    else:
        train_rows = manifest_rows

    # Write train manifest
    output_manifest.parent.mkdir(parents=True, exist_ok=True)
    with open(output_manifest, "w", encoding="utf-8") as f:
        for row in train_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Wrote {len(train_rows)} training rows to: {output_manifest}")

    durations = [r["duration"] for r in manifest_rows]
    print("=" * 60)
    print("Dataset Summary:")
    print(f"- Total valid samples: {len(manifest_rows)}")
    print(f"- Total duration: {sum(durations):.2f} seconds ({sum(durations)/60:.2f} mins)")
    print(f"- Mean duration: {np.mean(durations):.2f}s | Min: {min(durations):.2f}s | Max: {max(durations):.2f}s")
    print(f"- Target Sample Rate: {target_sr} Hz | Max Trailing Silence: {max_trailing_sec}s")
    print("=" * 60)

    return manifest_rows


def main():
    parser = argparse.ArgumentParser(description="Prepare dataset and generate train.jsonl for VoxCPM2 LoRA training.")
    parser.add_argument("--audio_dir", "-a", type=str, required=True, help="Directory containing audio clips (.wav)")
    parser.add_argument("--transcripts", "-t", type=str, required=True, help="Transcript file (.txt, .csv, or .tsv)")
    parser.add_argument("--output_manifest", "-o", type=str, default="train.jsonl", help="Output train.jsonl path")
    parser.add_argument("--val_manifest", "-v", type=str, default=None, help="Optional output val.jsonl path")
    parser.add_argument("--val_ratio", type=float, default=0.1, help="Validation set split ratio (default: 0.1)")
    parser.add_argument("--target_sr", type=int, default=16000, help="Target sample rate (default: 16000 for VoxCPM VAE input)")
    parser.add_argument("--max_silence", type=float, default=0.4, help="Max trailing silence in seconds (default: 0.4)")
    parser.add_argument("--processed_dir", type=str, default=None, help="Directory to save trimmed/resampled WAVs")

    args = parser.parse_args()

    process_dataset(
        audio_dir=Path(args.audio_dir),
        transcripts_file=Path(args.transcripts),
        output_manifest=Path(args.output_manifest),
        val_manifest=Path(args.val_manifest) if args.val_manifest else None,
        val_ratio=args.val_ratio,
        target_sr=args.target_sr,
        max_trailing_sec=args.max_silence,
        processed_dir=Path(args.processed_dir) if args.processed_dir else None,
    )


if __name__ == "__main__":
    main()
