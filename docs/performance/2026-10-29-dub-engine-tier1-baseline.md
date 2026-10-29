# Dub Engine Tier 1 Performance Baseline

- **Date:** 2026-10-29
- **Hardware Profile:** Tier 1 (Low / Dev PC)
  - **CPU:** Intel Xeon E5-2676 v3 @ 2.40GHz (12 Cores / 24 Threads)
  - **RAM:** 31.8 GB Total (13.9 GB Free during test)
  - **GPU:** NVIDIA GeForce GT 1030 (2.0 GB VRAM, Compute Capability 6.1)
  - **Primary Storage:** Drive D: (258.4 GB Free)
  - **Execution Mode:** CPU All-Cores for ASR & Vocal Separation; Edge-TTS for Khmer Voice Synthesis

## Measured Timings (Real Backend Execution)

Measurements obtained via `python -m vishnu_dub.benchmark --duration 3 --tts 1`:

| Stage | Measured Time | Threshold (T1 Budget) | Status | Backend / Engine |
|---|---|---|---|---|
| **ASR (Transcription)** | **3.87s** | ≤ 10.0s | **Within Budget** | Faster-Whisper (INT8, CPU multi-threaded) |
| **TTS (Khmer Voice Synthesis)** | **1.94s** | ≤ 5.0s | **Within Budget** | Edge-TTS (`km-KH-SreymomNeural`) |
| **Vocal Separation** | **38.62s** | ≤ 60.0s | **Within Budget** | Demucs HTDemucs (CPU, 24 threads) |
| **Total Benchmark Pipeline** | **44.43s** | ≤ 90.0s | **Within Budget** | Full local dubbing engine |

## Rules Compliance (`AGENTS.md`)

- **Zero Synthetic / Fake Timings:** No `sleep()` timers, hardcoded constants, or mock pipelines.
- **Hardware Tier Compliance:** Matches ADR-0003 specifications for Tier 1 machines.
