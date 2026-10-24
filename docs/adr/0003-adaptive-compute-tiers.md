# ADR-0003: Adaptive compute tiers; same final result on every PC

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Project owner

## Context

- The development PC has a GT 1030 (2 GB VRAM), a Xeon E5-2676 v3 (12 cores / 24 threads, AVX2), 32 GB RAM, and only 23 GB free on C:.
- VoxCPM2 needs about 8 GB VRAM on GPU; WhisperX large-v3 needs similar. Users will have a wide range of PCs.
- Owner's requirement: "strong PCs run fast, weak PCs run slow, but the final result is the same; use AI APIs to help."

## Decision

1. **Hardware profiler** detects CPU, RAM, GPU/VRAM and disk, then assigns a tier:

   | Tier | Detected when | Where the voice (VoxCPM2) runs |
   |---|---|---|
   | T3 High | NVIDIA GPU ≥ 12 GB | GPU, fastest |
   | T2 Mid | NVIDIA GPU 8–12 GB | GPU, one model at a time |
   | T1 Low | GPU < 8 GB or none, RAM ≥ 16 GB | CPU, all cores, sentence by sentence |
   | T0 Minimal | RAM < 16 GB | Remote engine; else Edge-TTS labelled "different voice" |

   The user can override the tier in Settings.
2. **Same result rule:** the final voice always comes from the same model, voice reference and fixed seed on every tier. Results are equivalent (CPU and GPU math differ slightly), not bit-identical.
3. **AI APIs help only with text steps:** ASR, translation, Khmer polish and QA review. They are opt-in per step, show a cost estimate first, and fall back to local when there's no key.
4. **Every tier passes the same quality gates:** timing drift, length fit, Khmer spelling, and re-ASR CER of the dub.
5. **Slow tiers stay usable:** checkpointed jobs resume after a crash or reboot, chunked segments keep one model in memory at a time, and the background queue shows ETAs and per-segment previews.
6. **Model and job storage default to the drive with the most free space** (D: on the dev PC).

## Consequences

- Works on any PC. The dev PC is T1, and its CPU speed must be **measured** before Gate 2 can pass (T2.15).
- Adds a profiler, benchmark, checkpointing and a Compute settings panel (T2.11–T2.15, T3.11–T3.14).
- LoRA voice training needs a GPU machine in practice (T5.5).

## Alternatives considered

- **Require a GPU:** excludes most users and the dev PC.
- **Cloud-only TTS on weak PCs:** a different voice per tier breaks the same-result rule.
- **Rented GPU only:** ongoing cost and a network dependency. Kept as the optional "remote engine" mode instead.
