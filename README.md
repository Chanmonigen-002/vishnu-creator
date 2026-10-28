<div align="center">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/images/Vishnu Creator_logo_vector_dark.svg" />
    <img src="./docs/images/Vishnu Creator_logo_vector.svg" alt="Vishnu Creator" width="380" />
  </picture>
  <br />
  Vishnu Creator
</h1>

<p><strong>Professional Khmer-First AI Dubbing, Video Translation & Multimodal Content Creation Studio</strong></p>

<p>A unified desktop and web workspace integrating visual tools, autonomous agent workflows, and an offline-capable Python dubbing engine for high-fidelity Khmer translation, voice cloning, subtitle styling, and media production.</p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

[Studio Features](#studio-features) · [Khmer Dubbing Pipeline](#khmer-dubbing-pipeline) · [Architecture](#architecture) · [Quick Start](#quick-start) · [Compute Modes](#compute-modes) · [License](#license)

</div>

---

## Overview

**Vishnu Creator** is an open, private-by-default creative suite engineered for content creators, translators, and media professionals. It combines a state-of-the-art **Khmer Dubbing Engine** with full-featured multimodal creation tools—including video translation, voice synthesis, viral shorts generation, article writing, and thumbnail design—all runnable on local hardware.

The project features a single unified frontend running on Web and packaged Desktop (Electron), communicating with a high-performance local daemon and a specialized Python FastAPI media service.

---

## Studio Features

### 🎙️ Khmer Dub Studio & Voices (`#/voices`)
- Dedicated **Voices Studio** offering immediate auditioning and selection of natural Khmer neural voices (`km-KH-SreymomNeural`, `km-KH-PisethNeural`).
- Seamless switching between Edge-TTS, Azure Cognitive Speech, and local zero-shot voice cloning.
- Live dubbing engine controller displaying hardware tier, CPU/GPU utilization, and memory headroom.

### 🎬 AI Video Translation & Dubbing
- Automated end-to-end pipeline: **Download → Transcribe → Translate → Fit & Sync → Synthesize → Separate Stems → Mix & Assemble**.
- Preserves original background music and sound effects while cleanly replacing speech.
- Per-segment **⚡ Re-dub** editor allowing instant audio resynthesis for individual edited subtitle lines.

### 📱 Viral Shorts Generator
- Re-formats 16:9 videos into modern 9:16 vertical shorts using stacked-blur backgrounds (no awkward cropping).
- Automatically chunks and burns dynamic **Khmer Karaoke Captions** using native Noto Sans Khmer styling and standard `\k` ASS timing.

### ✍️ Khmer SEO & Blog Article Generator
- Generates comprehensive articles, summaries, and Khmer SEO keyword kits directly from source video content.
- Automatically extracts high-quality video keyframes at key scene transitions.

### 🎨 Creative Tools Suite
- **Image & Video Generation**: Visual prompting and presets with multi-provider routing.
- **Thumbnail Designer**: 16:9 and 9:16 cover design studio with custom text layers and gradients.
- **Smart Scriptwriting**: Short video scripting and structured social media post drafts.

---

## Khmer Dubbing Pipeline

The dubbing pipeline is built from the ground up for the Khmer language (`km-KH`):

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│ Source Video │ ──► │ Faster-      │ ──► │ Natural Khmer        │
│ & Audio      │     │ Whisper ASR  │     │ Translation Rules    │
└──────────────┘     └──────────────┘     └──────────────────────┘
                            │                         │
                            ▼                         ▼
                     ┌──────────────┐     ┌──────────────────────┐
                     │ Demucs Music │     │ Subtitle Timing Sync │
                     │ & Vocal Split│     │ (Speedup & Placement)│
                     └──────────────┘     └──────────────────────┘
                            │                         │
                            ▼                         ▼
                     ┌──────────────┐     ┌──────────────────────┐
                     │ Original BGM │     │ Neural Khmer TTS     │
                     │ Audio Track  │     │ (Edge-TTS / VoxCPM2) │
                     └──────────────┘     └──────────────────────┘
                            │                         │
                            └───────────┬─────────────┘
                                        ▼
                               ┌──────────────────┐
                               │ Ducked Audio Mix │
                               │ & Final MP4 Mux  │
                               └──────────────────┘
```

1. **Khmer Linguistic Accuracy**:
   - Word segmentation using native `Intl.Segmenter` for syllabic cluster boundaries.
   - Clean elimination of zero-width space byte corruptions.
   - Correct handling of stacked subscript consonants (*coeng*) and standard punctuation (`។`).
2. **ASR Correction Dictionary**:
   - Initial prompt biasing and a 42+ entry dictionary correcting common mis-recognitions for Cambodian provinces, Phnom Penh locations, and technical terms.
3. **Subtitle Timing Synchronization (T4.5)**:
   - Sample-accurate speech placement matching subtitle start timestamps.
   - Intelligent tempo adaptation (`timesync_max_speedup`) preventing dubbed audio from overlapping or drifting from video action.
4. **Vocal & Background Music Separation (T4.4)**:
   - Integrated Demucs two-stem separation isolatating spoken dialogue while preserving original background music tracks.
5. **Real A/B Quality Auditing (T4.7)**:
   - Live measurement of **Timing Drift (ms)**, **Overlong Cues count**, and **Khmer Characters-per-Second (CPS)**.
   - True Character Error Rate (CER) computed via Levenshtein distance on synthesized speech.

---

## Architecture

| Component | Technology | Role |
|---|---|---|
| **Frontend** | React 18, Vite, Lucide Icons | Responsive content workspaces, interactive subtitle editor, and collaboration timeline |
| **Daemon** | Node.js, Fastify, TypeScript | Project configuration, job scheduling, artifact management, and SSE event streaming |
| **Dub Engine** | Python 3.12, FastAPI, PyTorch | Faster-Whisper ASR, Demucs separation, Edge-TTS/VoxCPM2 synthesis, and FFmpeg timesync |
| **Desktop Host** | Electron | Native window management, file pickers, tray control, and local process supervision |
| **Protocol** | `@vishnucreator/protocol` | Shared TypeScript schemas, language definitions, and estimate calculators |

---

## Compute Modes

Configure the compute engine under **Settings → AI Services → Dub Engine**:

- **Auto Mode** *(Recommended)*: Uses local CPU/GPU for media processing, separation, and assembly while leveraging cloud LLMs for translation polish when keys are provided.
- **Local Only**: 100% offline, privacy-first execution without external network requests or forwarded API keys.
- **Local + API Assist**: Uses local ASR and TTS with accelerated cloud LLM translation for maximum accuracy.
- **Remote Engine**: Connects to a dedicated external GPU worker instance over HTTP/HTTPS with bearer token authorization.

---

## Quick Start

### Prerequisites
- **Node.js** >= 20.x
- **pnpm** >= 9.x
- **Python** 3.12.x
- **FFmpeg** 6.x+ (installed or bundled)

### Installation

```bash
# Clone the repository
git clone https://github.com/Chanmonigen-002/vishnu-creator.git
cd vishnu-creator

# Install Node dependencies
pnpm install

# Build internal packages
pnpm build
```

### Dub Engine Setup

```bash
cd services/dub-engine

# Create Python virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies with separation and ASR support
pip install -e ".[core,asr,separation,dev]"
```

### Running the Development Environment

```bash
# Start both Web and Daemon (accessible at http://127.0.0.1:19861)
pnpm web:dev

# Start the dubbing engine (port 8765)
pnpm dub:engine
```

Open `http://127.0.0.1:19861` in your browser to start creating.

---

## Verification & Testing

Run the automated test suites:

```bash
# Typecheck all TypeScript workspaces
pnpm typecheck

# Run protocol & web test suites
pnpm test

# Run dubbing engine Python test suite (72 tests)
cd services/dub-engine
.venv\Scripts\python -m pytest vishnu_dub/tests
```

---

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](./LICENSE) file for details.
