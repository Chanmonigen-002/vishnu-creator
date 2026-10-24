# ADR-0002: Dub engine is an owned Python service behind HTTP

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Project owner

## Context

- The dubbing pipeline (WhisperX ASR, subtitle stabilization, LLM translation with Khmer rules, length fitting, Demucs, time-sync, mixing, assembly) and VoxCPM2 TTS are Python/PyTorch. They cannot be ported to the TypeScript daemon.
- A launcher (`scripts/dub-engine.mjs`) and a FastAPI bridge (`vishnu_api.py`) existed, but the bridge lived only in the reference clone, and **nothing in the daemon called it** (verified 2026-10-25).

## Decision

1. Copy and adapt the needed pipeline code into **`services/dub-engine/`** in this repo, as a Python package with a pinned Python 3.11 environment (VoxCPM requires Python <3.13).
2. Expose it via a versioned HTTP API (`/v1/...`) bound to `127.0.0.1` by default, with an optional token for remote mode.
3. The daemon owns its lifecycle (`DubEngineService`: spawn, health, restart) and talks to it through a typed `DubEngineClient`. The same client works with a **remote** engine URL.
4. ZastTranslate's Gradio UI is not shipped. All UI goes through Vishnu Creator's existing screens.

## Consequences

- Clear process boundary: an engine crash or out-of-memory error can't take down the daemon.
- Runs locally or on another machine without code changes (needed for ADR-0003).
- Adds a Python runtime to package for Desktop (T7.1) and a second test stack (`pytest`).
- Copying code is gated by ADR-0005.

## Alternatives considered

- **Embed Python via child process calls per request:** no lifecycle, slow model reloads, hard to supervise.
- **Rewrite in TypeScript:** not feasible for PyTorch models.
- **Run the engine from `File clone Resource/`:** forbidden by ADR-0004.
