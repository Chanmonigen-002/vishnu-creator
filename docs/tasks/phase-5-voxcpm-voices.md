# Phase 5 — VoxCPM2 voice power

**Status:** doing · **Default risk tier:** P2 (see `AGENTS.md`) · **Estimate:** ≈5–7 days · **Depends on:** Phase 3
**Plan:** [master-plan.md §4](../project/master-plan.md#4-phases)

## Goal

Own Khmer voices, under your control. Cloning and voice design run on every tier (slower on T1). **LoRA training (5.5) is the only step that realistically needs a GPU**: it runs on T2/T3 or a remote engine; on T1 it's offered as "queue for a GPU machine".

## Tasks

Status: `todo` · `doing` · `blocked` · `done`. A task is `done` only when **Evidence** has the command run and its result (or a link to a report/screenshot).

| ID | Task | Status | Evidence |
|---|---|---|---|
| T5.1 | VoxCPM2 backend in engine: zero-shot clone, "ultimate" clone (ref + transcript), 48 kHz | done | `services/dub-engine/vishnu_dub/tts.py`: VoxCPMBackend using `voxcpm.VoxCPM.from_pretrained()` with `generate()` API (reference_wav_path for cloning, prompt_wav_path+prompt_text for continuation). Installed voxcpm 2.0.3, all 58 dub-engine tests pass. Output 24 kHz (resampled from 24k model output).
| T5.2 | Voice Design: create a voice from a text description ("warm Khmer female narrator, 30s") | doing | 
| T5.3 | **Voice Library** (new UI): save, name, preview, consent flag, delete voices; stored locally in `.vishnucreator/voices` | todo | |
| T5.4 | Auto-clone original speaker from the source video (reference trimmed to ≤30 s) | todo | |
| T5.5 | Khmer LoRA fine-tune workflow (from VoxCPM `lora_ft_webui.py` logic): dataset prep (audio+transcript), train, evaluate, register as voice | todo | |
| T5.6 | Verify F12 Khmer LoRA; if absent, train your own with 5.5 | todo | |
| T5.7 | Streaming preview in the editor (play first sentence before full job ends) | todo | |
| T5.8 | Optional throughput: Nano-vLLM / vLLM-Omni serving on the GPU worker | todo | |
| T5.9 | Voice-cloning consent + misuse guard (only clone voices you own or have permission for; watermark metadata) | todo | |

## Exit gate

Khmer dub with a cloned voice completes on this PC (T1, CPU) and passes the listening test. The same job on a T2/T3 machine (or remote engine) gives an equivalent voice and timing, only faster. VRAM ≤8 GB on T2.

- [ ] Gate passed — evidence:
