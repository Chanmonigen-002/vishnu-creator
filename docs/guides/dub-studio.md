# Vishnu Creator — Khmer-First Dub Studio Guide

Vishnu Creator's Dub Studio is an agent-assisted, locally driven audio/video translation and dubbing studio.
It is built on a private, loopback-only pipeline designed for low-latency operation and **Khmer-first** localization: `km` (ភាសាខ្មែរ) is the default target language across all studio templates.

---

## 1. Architecture Overview

Vishnu Creator unifies desktop UI, local background daemon, and high-performance Python engine into a cohesive local-first environment:

```
┌──────────────────────────────────────────────────────────────┐
│  Vishnu Creator Frontend (React / Vite / Tailwind)           │
│  - SmartDubbingWorkspace & VideoTranslationWorkspace         │
│  - CreatorCollaborationPanel (shared agent activity & stages)│
│  - Subtitle timeline, Khmer script editor & audio player     │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP / WebSocket (127.0.0.1:19861)
┌──────────────────────────────▼───────────────────────────────┐
│  Vishnu Creator Daemon (Node.js / TypeScript)                │
│  - Project workspace & session manager                       │
│  - Model download manager (atomic verification & progress)   │
│  - DubEngineProcessManager (spawns & supervises dub engine)  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Loopback HTTP (127.0.0.1:8765)
┌──────────────────────────────▼───────────────────────────────┐
│  Dub Engine Service (Python 3.12 / FastAPI)                  │
│  - ASR: Faster-Whisper (INT8 CPU / FP16 CUDA)                │
│  - Vocal Separation: Demucs HTDemucs (vocals / accompaniment)│
│  - TTS: Edge-TTS (Sreymom & Piseth) + VoxCPM2 Cloned Voices   │
│  - Subtitle Engine: Noto Sans Khmer ASS renderer + burn-in   │
│  - Audio Mixer: Ducking, timesync speed match, ffmpeg mux    │
└──────────────────────────────────────────────────────────────┘
```

The Python Dub Engine resides directly in-repo at `services/dub-engine/` and connects to the Daemon strictly over loopback (`127.0.0.1`). It never exposes listening ports to the public network.

---

## 2. Core Dubbing Pipeline Stages

Dub Studio executes the end-to-end dubbing workflow across six structured stages:

1. **Audio Extraction (`extract`)**:
   - Extracts the source audio stream from imported MP4, MKV, MOV, or WEBM containers into uncompressed 16 kHz / 48 kHz WAV format.
2. **Speech Recognition (`transcribe`)**:
   - Transcribes spoken audio into timestamped subtitle segments with word-level cues.
   - Utilizes Faster-Whisper (`small-int8`, `large-v3`, or `large-v3-turbo`) or cloud transcription APIs (Gemini, OpenAI Whisper, Groq, Deepgram, FunASR).
   - Injects domain-specific Khmer vocabulary via `DEFAULT_INITIAL_PROMPT` to recognize Cambodian landmarks, provinces, and cultural terms accurately.
3. **Translation & Reformulation (`translate`)**:
   - Translates source cues into natural, contemporary spoken Khmer (ភាសាខ្មែរប្រចាំថ្ងៃ).
   - Adheres to Khmer script constraints: eliminates zero-width spaces (U+200B), preserves subscript consonants (*coeng* U+17D2), keeps standard punctuation (`។`), and fits character-per-second (CPS) rates to the video segment duration.
4. **Vocal Separation (`separate`)**:
   - Demucs HTDemucs splits original audio into clean dialogue vocals and background accompaniment (music, ambient effects, foley).
5. **Speech Synthesis (`tts`)**:
   - Generates natural Khmer speech using either:
     - **Microsoft Edge-TTS**: `km-KH-SreymomNeural` (female) or `km-KH-PisethNeural` (male) for instant, zero-GPU synthesis.
     - **VoxCPM2**: Multilingual zero-shot voice cloning with built-in voice presets (`vanna`, `chann`, etc.) or custom user voice samples (3–10 seconds), featuring Nyquist-safe ultrasonic watermarking.
6. **Mixing & Video Assembly (`mix` & `assemble`)**:
   - Adjusts dialogue tempo via `atempo` filters to match target cue boundaries.
   - Applies audio ducking to attenuate background music during speech bursts.
   - Renders dual-layer subtitles (source + Khmer) formatted with `Noto Sans Khmer` font.
   - Encodes final high-definition MP4 using NVENC (NVIDIA hardware acceleration) or libx264.

---

## 3. UI Workspaces

### Smart Dubbing Workspace (`SmartDubbingWorkspace.tsx`)
- **Video Player**: Live synchronization with active subtitle segments, playback speed controls, and frame stepping.
- **Waveform Timeline**: Visual audio tracks displaying original audio, separated vocal cues, and synthesized Khmer speech blocks.
- **Segment Editor**: In-place text editing for Khmer translations, speaker reassignment, timing adjustments, and instant single-segment TTS preview.
- **Quality Report**: Real-time display of Khmer reading speed (CPS), cue drift, and syllable duration health.

### Creator Services Settings (`CreatorServicesSettingsView.tsx`)
- **Transcription Providers**: Toggle between Faster-Whisper, FunASR, Gemini, OpenAI Whisper, Deepgram, and Groq with secure local API key storage.
- **Default Voice Selection**: Set preferred voice actors for narrator, male characters, and female characters.
- **Hardware Tier Diagnostics**: View detected CPU threads, GPU VRAM, compute tier (T1/T2/T3), and active device acceleration.

---

## 4. Khmer Script Integrity Rules

To guarantee natural, readable, and phonetically accurate Khmer subtitles, Dub Studio enforces the following typography rules:

| Rule | Requirement | Rationale |
|---|---|---|
| **No Inter-word Spaces** | គ្មានដកឃ្លារវាងពាក្យ | Khmer words are written continuously without spaces. Spaces occur only at clause/sentence boundaries. |
| **No Invisible Characters** | គ្មាន ZWSP (U+200B) | Invisible break spaces can corrupt subtitle shaping engines and crash video encoders. |
| **Consonant Clusters** | ជើងព្យញ្ជនៈត្រឹមត្រូវ | Coeng (U+17D2) subscript consonants must never be decoupled from their base consonants. |
| **Punctuation** | សញ្ញា ខណ្ឌ (។) | Sentence terminators use the Khmer khan (`។`). Western periods (`.`) are prohibited in Khmer prose. |
| **Numerals** | លេខអារ៉ាប់ (0–9) | Arabic numbers are used in subtitles to ensure deterministic TTS pronunciation. |
| **Spoken Phrasing** | ភាសានិយាយប្រចាំថ្ងៃ | Dubbing requires natural, idiomatic conversational Khmer rather than archaic formal syntax. |

---

## 5. REST API Reference

The Dub Engine service provides standard OpenAPI-compliant endpoints at `http://127.0.0.1:8765`:

### `GET /health`
Returns system status, active hardware profile, and backend capabilities.

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "tier": "T1",
  "hardware": {
    "cpu_cores": 12,
    "cpu_threads": 24,
    "ram_total_gb": 32.0,
    "gpu_name": "NVIDIA GeForce GT 1030",
    "gpu_vram_gb": 2.0
  },
  "backends": {
    "asr": "faster-whisper",
    "tts_edge": true,
    "tts_voxcpm": true,
    "separation_demucs": true
  }
}
```

### `POST /v1/asr/transcribe`
Performs word-aligned transcription on an audio file.

**Request body:**
```json
{
  "audio_path": "D:/Projects/video.wav",
  "language": "en",
  "model": "small-int8"
}
```

### `POST /v1/dub/jobs`
Submits a complete dubbing job.

**Request body:**
```json
{
  "source_video_path": "D:/Projects/input.mp4",
  "target_language": "km",
  "voice_id": "km-KH-SreymomNeural",
  "burn_subtitles": true,
  "ducking_factor": 0.3
}
```

**Response:**
```json
{
  "job_id": "dub-20261029-7f8a9b",
  "status": "queued",
  "created_at": "2026-10-29T14:00:00Z"
}
```

### `GET /v1/dub/jobs/{job_id}`
Queries job execution status, stage progress, and output file paths.

### `POST /v1/benchmark`
Runs an on-demand hardware benchmark validating real ASR, TTS, and vocal separation throughput against ADR-0003 tier thresholds.
