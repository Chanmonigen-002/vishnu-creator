"""Vishnu Dub Engine — Audio mixing and video assembly."""

import asyncio
import subprocess
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel

from vishnu_dub.config import resolve_ffmpeg_path, resolve_ffprobe_path


class MixResult(BaseModel):
    output_path: Path
    duration: float


class AssemblyResult(BaseModel):
    output_path: Path
    duration: float
    resolution: str
    fps: float


class AudioMixer:
    """Mix vocals + instrumental + background music."""

    @staticmethod
    async def mix(
        vocals_path: Path,
        output_path: Path,
        instrumental_path: Optional[Path] = None,
        background_path: Optional[Path] = None,
        vocals_volume: float = 1.0,
        instrumental_volume: float = 0.3,
        background_volume: float = 0.1,
        ffmpeg_path: Optional[str] = None,
    ) -> "MixResult":
        output_path.parent.mkdir(parents=True, exist_ok=True)
        ffmpeg_bin = resolve_ffmpeg_path(ffmpeg_path)
        ffprobe_bin = resolve_ffprobe_path(ffmpeg_bin)

        inputs = []
        filter_parts = []

        inputs.append(["-i", str(vocals_path)])
        filter_parts.append(f"[0:a]volume={vocals_volume}[vocal]")

        input_idx = 1
        filter_inputs = ["[vocal]"]

        if instrumental_path and instrumental_path.exists():
            inputs.append(["-i", str(instrumental_path)])
            filter_parts.append(f"[{input_idx}:a]volume={instrumental_volume}[inst]")
            filter_inputs.append("[inst]")
            input_idx += 1

        if background_path and background_path.exists():
            inputs.append(["-i", str(background_path)])
            filter_parts.append(f"[{input_idx}:a]volume={background_volume}[bg]")
            filter_inputs.append("[bg]")
            input_idx += 1

        filter_parts.append(f"{''.join(filter_inputs)}amix=inputs={len(filter_inputs)}:duration=first:dropout_transition=3[mixed]")

        cmd = [ffmpeg_bin, "-y"]
        for inp in inputs:
            cmd.extend(inp)
        cmd.extend([
            "-filter_complex", ";".join(filter_parts),
            "-map", "[mixed]",
            "-c:a", "aac",
            "-b:a", "192k",
            str(output_path),
        ])

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg mix failed: {stderr.decode(errors='replace')}")

        if not output_path.exists():
            raise RuntimeError("Mix failed to produce output")

        duration = 0.0
        try:
            result = subprocess.run([
                ffprobe_bin, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(output_path)
            ], capture_output=True, text=True, timeout=10)
            if result.stdout.strip():
                duration = float(result.stdout.strip())
        except Exception:
            duration = 0.0

        return MixResult(output_path=output_path, duration=duration)


class VideoAssembler:
    """Assemble final video with subtitles and audio."""

    @staticmethod
    async def assemble(
        video_path: Path,
        audio_path: Path,
        output_path: Path,
        subtitle_path: Optional[Path] = None,
        resolution: str = "1280x720",
        fps: float = 30,
        subtitle_style: Optional[dict] = None,
        ffmpeg_path: Optional[str] = None,
    ) -> "AssemblyResult":
        output_path.parent.mkdir(parents=True, exist_ok=True)
        ffmpeg_bin = resolve_ffmpeg_path(ffmpeg_path)
        ffprobe_bin = resolve_ffprobe_path(ffmpeg_bin)

        cmd = [ffmpeg_bin, "-y", "-i", str(video_path), "-i", str(audio_path)]

        filter_parts = []
        if subtitle_path and subtitle_path.exists():
            style = ""
            if subtitle_style:
                style = f":force_style='Fontsize={subtitle_style.get('fontsize', 24)},PrimaryColour={subtitle_style.get('color', '&HFFFFFF')},Outline={subtitle_style.get('outline', 2)}'"
            escaped_sub = str(subtitle_path).replace("\\", "/").replace(":", "\\:")
            filter_parts.append(f"subtitles='{escaped_sub}'{style}")
            cmd.extend(["-vf", ",".join(filter_parts)])

        cmd.extend([
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            "-r", str(fps),
            "-s", resolution,
            str(output_path),
        ])

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg assembly failed: {stderr.decode(errors='replace')}")

        if not output_path.exists():
            raise RuntimeError("Assembly failed to produce output")

        width, height, fps_val, duration = 1280, 720, fps, 0.0
        try:
            result = subprocess.run([
                ffprobe_bin, "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height,avg_frame_rate,duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(output_path)
            ], capture_output=True, text=True, timeout=10)
            if result.stdout.strip():
                lines = result.stdout.strip().split("\n")
                if len(lines) >= 4:
                    width = int(lines[0])
                    height = int(lines[1])
                    fps_parts = lines[2].split("/")
                    fps_val = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 and float(fps_parts[1]) != 0 else fps
                    duration = float(lines[3]) if lines[3] != "N/A" else 0.0
        except Exception:
            pass

        return AssemblyResult(
            output_path=output_path,
            duration=duration,
            resolution=f"{width}x{height}",
            fps=fps_val,
        )