# Vishnu Creator — Khmer-First Dub Studio

The Dub Studio is Vishnu Creator's local video translation + dubbing engine.
It is built on a fully local pipeline (no cloud required for core flows) and is
**Khmer-first**: `km` (ភាសាខ្មែរ) is the default target language everywhere.

## Architecture

```
Vishnu Creator (Node/React monorepo)
        │  HTTP (127.0.0.1 only)
        ▼
Dub Engine bridge (FastAPI, this repo's sibling project)
        │
        ├── WhisperX  — word-aligned transcription (large-v3, Khmer supported)
        ├── LLM Reformulator — translation + length fitting, with Khmer
        │                      script-integrity rules baked into the prompts
        ├── VoxCPM 2  — zero-shot voice cloning; natively speaks Khmer
        ├── Demucs    — vocal separation for clean dubbing mixes
        └── ffmpeg/NVENC — final video assembly
```

## Starting the engine

From the Vishnu Creator repo root:

```bash
pnpm dub:engine
```

Environment variables:

| Variable                 | Default                          | Purpose                                  |
| ------------------------ | -------------------------------- | ---------------------------------------- |
| `VISHNU_DUB_ENGINE_PATH` | `../ZastTranslate` (sibling dir) | Location of the dubbing engine repo      |
| `VISHNU_DUB_ENGINE_PORT` | `8765`                           | Loopback port for the bridge             |
| `VISHNU_DUB_PYTHON`      | `C:\Python314\python.exe` (win)  | Python interpreter with `fastapi+uvicorn`|

The engine binds to **127.0.0.1 only**. It never listens on a public interface.

## REST API

All endpoints live on `http://127.0.0.1:8765`.

| Method | Path         | Purpose                                                    |
| ------ | ------------ | ---------------------------------------------------------- |
| GET    | `/health`    | Engine status + available TTS/LLM backends                 |
| POST   | `/transcribe`| WhisperX transcription with word-level alignment           |
| POST   | `/translate` | LLM translation with fitted (dub-ready) variants           |
| POST   | `/synthesize`| Voice-cloned TTS per segment (optional reference sample)   |
| POST   | `/assemble`  | Mix dubbed audio back onto video (NVENC when available)    |
| GET    | `/download`  | Serve a produced artifact (temp/output workspace only)     |

## Khmer rules baked into the translation prompts

The reformulator's system prompts carry Khmer-specific rules whenever the
target language is Khmer (`km`):

- Natural spoken Khmer (ភាសាខ្មែរប្រចាំថ្ងៃ), not stiff literary Khmer.
- No spaces between words — only between clauses/sentences and after ។.
- Never insert Zero-Width Spaces (U+200B) or invisible characters.
- Coeng (U+17D2) subscript consonants are kept intact — never split from base.
- Standard Khmer punctuation (។).
- Arabic numerals (TTS reads them correctly).
- Buddhist/Pali-Sanskrit loanwords keep their standard Khmer forms.

## Security posture

- Loopback-only bind; no public interface.
- The `/download` endpoint restricts paths to the engine's temp workspace.
- No `eval`/`exec`/`pickle.loads`/shell-out in the pipeline modules.
- Outbound calls are limited to model registries (HuggingFace), YouTube
  metadata endpoints, and Google Suggest (SEO keyword research only).
