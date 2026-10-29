# Vishnu Creator — Local Dub Engine Setup & Reference

The Vishnu Creator Dub Engine (`services/dub-engine`) is an in-repo Python service providing speech recognition, vocal separation, Khmer neural TTS, and automated audio mixing. It runs locally as a loopback microservice (`http://127.0.0.1:8765`) and requires no cloud connectivity for core dubbing workflows.

---

## 1. Hardware Tiers & Compute Profiles

The engine dynamically probes system hardware upon launch and assigns the machine to one of three compute tiers defined in **ADR-0003**:

| Tier | Profile Description | Whisper ASR Engine | Vocal Separation | TTS Engine | LoRA Training |
|---|---|---|---|---|---|
| **Tier 1 (T1)** | **Low / Dev PC**<br>CPU only or GPU < 8 GB VRAM<br>RAM ≥ 16 GB | Faster-Whisper `small-int8` (CPU multi-thread) | Demucs `htdemucs` (CPU 12–24 threads) | Edge-TTS (`km-KH-SreymomNeural`, `km-KH-PisethNeural`) or VoxCPM2 CPU | Disabled (requires T2/T3) |
| **Tier 2 (T2)** | **Mid-Tier Workstation**<br>NVIDIA GPU 8–16 GB VRAM<br>RAM ≥ 32 GB | Faster-Whisper `large-v3-turbo` (FP16 CUDA) | Demucs `htdemucs` (CUDA FP32) | VoxCPM2 zero-shot GPU cloning | Single-voice LoRA supported |
| **Tier 3 (T3)** | **High-End Studio**<br>NVIDIA GPU ≥ 24 GB VRAM<br>RAM ≥ 64 GB | Faster-Whisper `large-v3` (FP16 CUDA) | Demucs `htdemucs_ft` (CUDA) | VoxCPM2 multi-voice parallel cloning | Multi-voice full LoRA training |

> [!NOTE]
> Tier 1 machines (such as development PCs with Intel Xeon E5 / Core i5 / GT 1030) operate completely out of the box with zero external GPU dependencies using CPU INT8 Whisper, CPU Demucs, and Edge-TTS.

---

## 2. Directory Structure

```
services/dub-engine/
├── pyproject.toml              # Dependencies, project metadata & pytest configuration
├── README.md                   # Quick overview
└── vishnu_dub/
    ├── __init__.py             # Package root
    ├── api.py                  # FastAPI application & HTTP route definitions
    ├── asr.py                  # Faster-Whisper backend with PyAV compatibility shim
    ├── benchmark.py            # Real hardware performance benchmark runner
    ├── config.py               # Pydantic configuration & environment settings
    ├── downloader.py           # Resumable atomic model downloader with SHA-256 verification
    ├── mixer.py                # Audio ducking, timesync speed alignment & ffmpeg assembly
    ├── models.py               # Model catalog & local model store resolution
    ├── separation.py           # Demucs HTDemucs stem separation backend
    ├── subtitles.py            # ASS subtitle generation, Khmer styling & entity prompts
    ├── tts_edge.py             # Microsoft Edge-TTS async integration
    ├── voxcpm_tts.py           # VoxCPM2 zero-shot voice cloning backend & watermarking
    └── tests/                  # Test suites (ASR, models, mixer, watermark, API)
```

---

## 3. Environment & Installation

### Prerequisites
- **Python**: 3.12 (64-bit CPython recommended)
- **Package Manager**: `uv` (recommended) or standard `pip`
- **FFmpeg**: Version 6.0+ with `libass` and `libx264` support, placed on the system `PATH` (or bundled in `apps/desktop/resources/ffmpeg`)

### Virtual Environment Setup

From the repository root:

```powershell
# Navigate to the dub engine service directory
cd services/dub-engine

# Create the virtual environment using Python 3.12
python -m venv .venv

# Activate the virtual environment
.venv\Scripts\Activate.ps1

# Install package dependencies in editable development mode
pip install -e .
```

---

## 4. Model Storage & Download Management

Models are large binary weights that should not clutter repository files or fill small system drives.

### Storage Resolution Strategy
Per **ADR-0003**, the Dub Engine resolves model storage using the following priority:

1. `VISHNU_MODELS_DIR` environment variable (if explicitly set).
2. Drive with the **most available free disk space** (e.g. `D:\.vishnucreator\models`).
3. User profile directory fallback: `~/.vishnucreator/models`.

### Verified Model Catalog

| Model ID | Purpose | File Format | Approximate Size | Checksum Verification |
|---|---|---|---|---|
| `whisper-small-int8` | Fast local ASR | CTranslate2 INT8 | ~460 MB | SHA-256 verified |
| `whisper-large-v3-turbo` | Studio-grade multilingual ASR | CTranslate2 FP16 | ~1.6 GB | SHA-256 verified |
| `htdemucs` | 4-stem vocal separation | TorchScript / PyTorch | ~80 MB | SHA-256 verified |
| `voxcpm2-khmer` | Khmer voice cloning weights | PyTorch / SafeTensors | ~1.8 GB | SHA-256 verified |
| `noto-sans-khmer` | Khmer subtitle typography font | TrueType (`.ttf`) | ~1.2 MB | SHA-256 verified |

All model downloads execute atomically using temporary `.part` files, reserve at least 1 GB of headroom before downloading, and verify SHA-256 hashes prior to moving into the active model cache.

---

## 5. Starting the Service

### Automated Supervised Mode (Standard)
When running the Vishnu Creator Desktop application or web development environment (`pnpm web:dev`), the Daemon's `DubEngineProcessManager` automatically launches, health-checks, and supervises the Dub Engine process in the background.

### Manual CLI Mode (Development & Debugging)
To run the engine independently with live debug logging:

```powershell
cd services/dub-engine
.venv\Scripts\python.exe -m uvicorn vishnu_dub.api:app --host 127.0.0.1 --port 8765 --reload
```

Once running, verify health via curl or PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "tier": "T1",
  "hardware": {
    "tier": "T1",
    "cpu_threads": 24,
    "ram_total_gb": 31.8,
    "gpu_name": "NVIDIA GeForce GT 1030",
    "gpu_vram_gb": 2.0
  }
}
```

---

## 6. Testing & Benchmarking

### Running the Test Suite
To execute the complete unit and integration test suite:

```powershell
# Run all dub engine tests
services\dub-engine\.venv\Scripts\pytest.exe services/dub-engine/vishnu_dub/tests

# Run targeted job and API tests
services\dub-engine\.venv\Scripts\pytest.exe services/dub-engine/vishnu_dub/tests/test_jobs_and_api.py
```

### Running Real Hardware Benchmarks
To measure actual pipeline execution speed on the host hardware (without synthetic delays or mocks):

```powershell
services\dub-engine\.venv\Scripts\python.exe -m vishnu_dub.benchmark --duration 3 --tts 1
```

This outputs real processing times for ASR, TTS, and vocal separation and saves the machine-readable results to `jobs/benchmark_results.json`.

### Verifying Baseline Compliance
Run the workspace baseline gate:

```powershell
pnpm perf:check
```

---

## 7. Troubleshooting Common Issues

### 1. PyAV `metadata_errors` Parameter Error
- **Symptom**: `TypeError: open() got an unexpected keyword argument 'metadata_errors'` when transcribing audio.
- **Cause**: PyAV 19.0+ removed the deprecated `metadata_errors` argument from `av.open()`.
- **Solution**: The engine includes an automatic monkey-patch in `vishnu_dub/asr.py` that intercepts `av.open` and strips the unsupported argument.

### 2. Hugging Face Rate Limiting During Model Downloads
- **Symptom**: Model download hangs or returns HTTP 429 Too Many Requests when retrieving Whisper or Demucs checkpoints.
- **Solution**: The engine uses `local_files_only=True` to inspect local caches first. If unauthenticated network downloads are throttled, pre-cache the model in the model store or configure your `HF_TOKEN` environment variable.

### 3. Windows FFmpeg Subtitle Filter Escaping
- **Symptom**: `No such file or directory` or syntax errors during subtitle burn-in (`subtitles=...`).
- **Solution**: On Windows, colons (`:`) in drive paths (e.g. `D:\`) must be escaped as `D\:/` inside ffmpeg video filter expressions. The engine's `mixer.py` formats these paths automatically.
