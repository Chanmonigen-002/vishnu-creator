# Vishnu Dub Engine

Vishnu Creator's dubbing engine — ASR, translation, TTS, mixing, and assembly.

## Features

- **ASR**: faster-whisper / whisperX with platform caption fallback
- **Translation**: LLM-based with Khmer rules, fitted-CPS length fitting
- **TTS**: Edge-TTS (no GPU), VoxCPM2 (voice cloning), other providers
- **Separation**: Demucs vocal/instrumental split
- **Assembly**: FFmpeg-based video/audio assembly
- **Hardware profiling**: Auto-detects T0–T3 tier

## Installation

```bash
uv sync --group core --group asr --group tts-voxcpm --group separation
```

## Running

```bash
uv run vishnu-dub
```

## API

- `GET /v1/hardware` — hardware profile and tier
- `POST /v1/dub` — submit dubbing job
- `GET /v1/dub/{id}` — job status
- `GET /v1/dub/{id}/progress` — SSE progress
- `POST /v1/benchmark` — run benchmark