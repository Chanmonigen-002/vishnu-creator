#!/usr/bin/env python3
"""Run real Khmer dubbing pipeline for E2E tests.

Takes an English video source, generates Khmer speech with Edge-TTS,
creates Khmer subtitles, mixes the audio, and assembles the final MP4.
Zero fake outputs.
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Add services/dub-engine to sys.path
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root / "services" / "dub-engine"))

from vishnu_dub.tts import EdgeTTSBackend
from vishnu_dub.mixer import AudioMixer, VideoAssembler


async def run_pipeline(
    source_video: Path,
    output_dir: Path,
    khmer_text: str = "សួស្តី នេះជាការសាកល្បងបញ្ចូលសំឡេងជាភាសាខ្មែរ។",
    voice_id: str = "km-KH-SreymomNeural",
) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Ensure fresh execution: remove old outputs
    output_mp4 = output_dir / "output.mp4"
    km_srt = output_dir / "km.srt"
    mixed_audio = output_dir / "mixed_audio.m4a"
    seg_mp3 = output_dir / "tts_segments" / "seg_0000.mp3"
    
    if output_mp4.exists():
        output_mp4.unlink()
    if km_srt.exists():
        km_srt.unlink()
    if mixed_audio.exists():
        mixed_audio.unlink()
    if seg_mp3.exists():
        seg_mp3.unlink()

    seg_mp3.parent.mkdir(parents=True, exist_ok=True)

    # 1. Synthesize Khmer speech using Edge-TTS
    print(f"[pipeline] Synthesizing Khmer speech with {voice_id}...")
    tts = EdgeTTSBackend()
    await tts.synthesize(khmer_text, voice_id=voice_id, output_path=seg_mp3)
    if not seg_mp3.exists() or seg_mp3.stat().st_size == 0:
        raise RuntimeError("Edge-TTS synthesis failed to produce audio file")
    print(f"[pipeline] Synthesized {seg_mp3.stat().st_size} bytes")

    # 2. Write Khmer subtitles with natural spoken Khmer text (no spaces, ។ punctuation)
    print(f"[pipeline] Writing Khmer subtitles to {km_srt}...")
    with open(km_srt, "w", encoding="utf-8") as f:
        f.write("1\n00:00:00,500 --> 00:00:04,500\n" + khmer_text + "\n\n")

    # 3. Mix audio (convert to AAC/M4A)
    print(f"[pipeline] Mixing audio to {mixed_audio}...")
    mix_res = await AudioMixer.mix(vocals_path=seg_mp3, output_path=mixed_audio)
    print(f"[pipeline] Mixed audio duration: {mix_res.duration:.2f}s, size: {mixed_audio.stat().st_size} bytes")

    # 4. Assemble video with burned Khmer subtitles
    print(f"[pipeline] Assembling final video to {output_mp4}...")
    asm_res = await VideoAssembler.assemble(
        video_path=source_video,
        audio_path=mixed_audio,
        output_path=output_mp4,
        subtitle_path=km_srt,
    )
    print(f"[pipeline] Assembled output.mp4: {output_mp4.stat().st_size} bytes, duration: {asm_res.duration:.2f}s")

    # Write checkpoint
    with open(output_dir / "checkpoint.json", "w", encoding="utf-8") as f:
        json.dump({
            "stage": "completed",
            "completed_tts_segments": 1,
            "voice_id": voice_id,
            "khmer_text": khmer_text,
        }, f, indent=2)

    return {
        "output_mp4": str(output_mp4),
        "km_srt": str(km_srt),
        "mixed_audio": str(mixed_audio),
        "size": output_mp4.stat().st_size,
        "duration": asm_res.duration,
    }


def main():
    parser = argparse.ArgumentParser(description="Run E2E Khmer dubbing pipeline")
    parser.add_argument("--source-video", type=Path, default=repo_root / "apps/web/e2e/fixtures/khmer-demo-source.mp4")
    parser.add_argument("--output-dir", type=Path, default=repo_root / ".runtime/e2e-khmer-dub/jobs/e2e-khmer-demo")
    parser.add_argument("--khmer-text", type=str, default="សួស្តី នេះជាការសាកល្បងបញ្ចូលសំឡេងជាភាសាខ្មែរ។")
    parser.add_argument("--voice-id", type=str, default="km-KH-SreymomNeural")
    args = parser.parse_args()

    result = asyncio.run(run_pipeline(
        source_video=args.source_video,
        output_dir=args.output_dir,
        khmer_text=args.khmer_text,
        voice_id=args.voice_id,
    ))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
