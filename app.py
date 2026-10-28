#!/usr/bin/env python3
"""
VoxCPM2 Low-Spec Voice Cloning & LoRA WebUI (Gradio)
Supports Ultimate Cloning, Quick Cloning, Style Control, and VRAM Management.
"""

import gc
import os
import sys
import tempfile
from pathlib import Path
from typing import Optional, Tuple

import gradio as gr
import numpy as np
import soundfile as sf
import torch

# Global loaded model cache
_CURRENT_MODEL = None
_CURRENT_MODEL_ID = None
_CURRENT_DEVICE = None
_CURRENT_LORA = None


def get_hardware_info() -> Tuple[str, float, float, str]:
    """Inspect GPU VRAM and System RAM, returning (gpu_name, vram_gb, ram_gb, recommended_tier)."""
    has_cuda = torch.cuda.is_available()
    vram_gb = 0.0
    gpu_name = "CPU Only"
    if has_cuda:
        try:
            gpu_name = torch.cuda.get_device_name(0)
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        except Exception:
            pass

    import psutil
    ram_gb = psutil.virtual_memory().total / (1024 ** 3)

    if has_cuda and vram_gb >= 6.0:
        recommended = "openbmb/VoxCPM2 (CUDA)"
    elif has_cuda:
        recommended = "openbmb/VoxCPM1.5 (CUDA) or VoxCPM2 (CPU)"
    else:
        recommended = "openbmb/VoxCPM2 (CPU)"

    return gpu_name, vram_gb, ram_gb, recommended


def unload_model() -> str:
    """Frees VRAM and system memory by deleting the model instance."""
    global _CURRENT_MODEL, _CURRENT_MODEL_ID, _CURRENT_DEVICE, _CURRENT_LORA
    if _CURRENT_MODEL is not None:
        del _CURRENT_MODEL
        _CURRENT_MODEL = None
        _CURRENT_MODEL_ID = None
        _CURRENT_DEVICE = None
        _CURRENT_LORA = None

    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return "Model unloaded successfully. System RAM and GPU VRAM cleared."


def get_or_load_model(model_id: str, device: str, lora_path: Optional[str] = None):
    """Loads or retrieves the cached VoxCPM model."""
    global _CURRENT_MODEL, _CURRENT_MODEL_ID, _CURRENT_DEVICE, _CURRENT_LORA
    from voxcpm import VoxCPM

    # Resolve device
    target_device = device
    if target_device == "auto":
        has_cuda = torch.cuda.is_available()
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3) if has_cuda else 0.0
        if has_cuda and vram_gb >= 6.0:
            target_device = "cuda"
        elif has_cuda and "VoxCPM1.5" in model_id:
            target_device = "cuda"
        else:
            target_device = "cpu"

    lora_clean = str(Path(lora_path).resolve()) if lora_path and Path(lora_path).exists() else None

    # Check cache hit
    if (
        _CURRENT_MODEL is not None
        and _CURRENT_MODEL_ID == model_id
        and _CURRENT_DEVICE == target_device
        and _CURRENT_LORA == lora_clean
    ):
        return _CURRENT_MODEL

    # Unload previous
    unload_model()

    print(f"[Loading Model] ID: {model_id} | Device: {target_device} | LoRA: {lora_clean}")
    load_kwargs = {
        "load_denoiser": False,  # Low-spec optimization
        "device": target_device,
    }
    if lora_clean:
        load_kwargs["lora_weights_path"] = lora_clean

    model = VoxCPM.from_pretrained(model_id, **load_kwargs)
    _CURRENT_MODEL = model
    _CURRENT_MODEL_ID = model_id
    _CURRENT_DEVICE = target_device
    _CURRENT_LORA = lora_clean
    return model


def synthesize_voice(
    reference_audio: Optional[str],
    is_ultimate_clone: bool,
    prompt_transcript: str,
    target_text: str,
    style_preset: str,
    custom_style: str,
    model_choice: str,
    device_choice: str,
    inference_steps: int,
    cfg_scale: float,
    lora_path: str,
    progress=gr.Progress(),
):
    if not target_text or not target_text.strip():
        raise gr.Error("Please enter text to synthesize.")

    progress(0.1, desc="Preparing inputs & style...")

    # Format styled text
    style_desc = custom_style.strip() if custom_style and custom_style.strip() else (style_preset if style_preset != "None" else "")
    formatted_text = target_text.strip()
    if style_desc and not formatted_text.startswith("("):
        formatted_text = f"({style_desc.strip('() ')}) {formatted_text}"

    # Setup cloning paths
    prompt_wav = None
    prompt_text = None
    ref_wav = None

    if reference_audio:
        ref_wav = str(Path(reference_audio).resolve())
        if is_ultimate_clone:
            if not prompt_transcript or not prompt_transcript.strip():
                raise gr.Error("Ultimate Cloning Mode requires the transcript of the reference audio.")
            prompt_wav = ref_wav
            prompt_text = prompt_transcript.strip()

    progress(0.3, desc="Loading model / verifying hardware...")
    model = get_or_load_model(model_choice, device_choice, lora_path if lora_path.strip() else None)

    progress(0.5, desc=f"Synthesizing with {inference_steps} steps (CFG: {cfg_scale})...")
    try:
        audio_array = model.generate(
            text=formatted_text,
            prompt_wav_path=prompt_wav,
            prompt_text=prompt_text,
            reference_wav_path=ref_wav,
            inference_timesteps=int(inference_steps),
            cfg_value=float(cfg_scale),
            denoise=False,
        )

        sr = getattr(model.tts_model, "sample_rate", 48000)
        duration = len(audio_array) / sr

        # Save to temporary wav
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            out_file = tmp_wav.name
        sf.write(out_file, audio_array, sr)

        # Clear cache for low-spec GPUs
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        progress(1.0, desc="Done!")
        status_md = f"""
✅ **Generation Successful**
- **Sample Rate**: {sr} Hz (48 kHz High Fidelity)
- **Duration**: {duration:.2f} seconds
- **Device**: `{_CURRENT_DEVICE}`
- **Mode**: `{"Ultimate Cloning (Transcript-Guided)" if is_ultimate_clone else ("Quick Cloning (Audio-Only)" if reference_audio else "Zero-Shot Text Voice Design")}`
- **Active Prompt**: `{formatted_text}`
"""
        return out_file, status_md

    except Exception as e:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise gr.Error(f"Synthesis failed: {e}")


def build_app():
    gpu_name, vram_gb, ram_gb, recommended_tier = get_hardware_info()

    theme = gr.themes.Soft(
        primary_hue="indigo",
        neutral_hue="slate",
    )

    with gr.Blocks(title="VoxCPM2 Low-Spec Voice Cloning Studio") as demo:
        gr.Markdown(
            f"""
# 🎙️ VoxCPM2 Voice Cloning & LoRA Studio
### Low-Spec Optimized Interface for Zero-Shot & Ultimate Voice Cloning

> **Hardware Diagnostics**:
> - **GPU**: `{gpu_name}` | **VRAM**: `{vram_gb:.2f} GB` | **System RAM**: `{ram_gb:.1f} GB`
> - **Recommended Configuration**: `{recommended_tier}`
"""
        )

        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("### 1. Reference Audio & Cloning Mode")
                ref_audio = gr.Audio(
                    sources=["upload", "microphone"],
                    type="filepath",
                    label="Reference Voice Audio (10–30s clean WAV)",
                )

                with gr.Row():
                    load_sample_btn1 = gr.Button("🎤 Use Official Clone Sample", size="sm", variant="secondary")
                    load_sample_btn2 = gr.Button("📚 Use Training Reader Sample", size="sm", variant="secondary")

                is_ultimate = gr.Checkbox(
                    label="Ultimate Cloning Mode (Requires Transcript for Highest Similarity)",
                    value=False,
                )

                transcript_input = gr.Textbox(
                    label="Reference Audio Transcript (Exact spoken words)",
                    placeholder="Enter transcript of reference audio here...",
                    visible=True,
                    lines=2,
                )

                is_ultimate.change(
                    fn=lambda u: gr.update(visible=True, interactive=u),
                    inputs=[is_ultimate],
                    outputs=[transcript_input],
                )

                gr.Markdown("### 2. Voice Style & Expressions")
                style_dropdown = gr.Dropdown(
                    choices=[
                        "None",
                        "natural, clear tone",
                        "cheerful, energetic",
                        "calm whisper, gentle tone",
                        "deep authoritative, confident",
                        "storytelling narrator, warm",
                        "melancholic, soft voice",
                    ],
                    value="natural, clear tone",
                    label="Preset Style Tag",
                )
                custom_style_input = gr.Textbox(
                    label="Custom Style Description (Overrides Preset)",
                    placeholder="e.g. enthusiastic young educator, slightly fast",
                )

            with gr.Column(scale=1):
                gr.Markdown("### 3. Synthesis Text")
                target_text = gr.Textbox(
                    label="Target Text to Synthesize",
                    placeholder="Enter the speech content you want VoxCPM2 to speak...",
                    lines=4,
                )

                with gr.Accordion("⚙️ Low-Spec Tuning & Advanced Options", open=False):
                    with gr.Row():
                        steps_slider = gr.Slider(
                            minimum=4, maximum=15, value=6, step=1,
                            label="Inference Steps (Diffusion Timesteps)",
                            info="Lower values (4–6) generate faster with low VRAM; 8–10 provides highest nuance.",
                        )
                        cfg_slider = gr.Slider(
                            minimum=1.0, maximum=4.0, value=2.0, step=0.1,
                            label="CFG Scale",
                            info="Guidance strength (default 2.0).",
                        )

                    with gr.Row():
                        model_dropdown = gr.Dropdown(
                            choices=["openbmb/VoxCPM2", "openbmb/VoxCPM1.5"],
                            value="openbmb/VoxCPM2" if vram_gb >= 6.0 or not torch.cuda.is_available() else "openbmb/VoxCPM1.5",
                            label="Model Version",
                        )
                        device_radio = gr.Radio(
                            choices=["auto", "cuda", "cpu"],
                            value="auto",
                            label="Compute Device",
                        )

                    lora_folder = gr.Textbox(
                        label="LoRA Weights Directory (Optional)",
                        placeholder="Path to folder containing adapter_model.safetensors or pytorch_lora_weights.bin",
                    )

                generate_btn = gr.Button("🔊 Generate Speech", variant="primary", size="lg")
                unload_btn = gr.Button("🧹 Unload Model / Free VRAM", variant="secondary")

                gr.Markdown("### 4. Audio Output")
                audio_out = gr.Audio(label="Synthesized Speech (48 kHz WAV)", type="filepath")
                status_out = gr.Markdown()

        # Wire callbacks
        def load_official_clone_sample():
            path = Path("samples/voxcpm2_reference_speaker.wav").resolve()
            if not path.exists():
                path = (Path(__file__).resolve().parent / "services/dub-engine/vishnu_dub/data/sample_voices/default_clone_speaker.wav").resolve()
            return str(path), True, "Hello, this is the official VoxCPM2 reference speaker recording for high fidelity voice cloning."

        def load_training_sample():
            path = Path("samples/voxcpm2_training_sample.wav").resolve()
            if not path.exists():
                path = (Path(__file__).resolve().parent / "services/dub-engine/vishnu_dub/data/sample_voices/default_training_sample.wav").resolve()
            return str(path), False, "This is an example audio transcript for voice cloning and fine-tuning."

        load_sample_btn1.click(
            fn=load_official_clone_sample,
            inputs=[],
            outputs=[ref_audio, is_ultimate, transcript_input],
        )

        load_sample_btn2.click(
            fn=load_training_sample,
            inputs=[],
            outputs=[ref_audio, is_ultimate, transcript_input],
        )

        sample1_path = Path("samples/voxcpm2_reference_speaker.wav").resolve()
        sample2_path = Path("samples/voxcpm2_training_sample.wav").resolve()
        if sample1_path.exists():
            gr.Examples(
                examples=[
                    [str(sample1_path), True, "Hello, this is the official VoxCPM2 reference speaker recording for high fidelity voice cloning.", "Welcome to Vishnu Creator! This high fidelity cloned voice is running with VoxCPM2.", "cheerful, energetic"],
                    [str(sample2_path), False, "", "Testing zero-shot quick cloning using the official VoxCPM training audio sample.", "natural, clear tone"],
                ],
                inputs=[ref_audio, is_ultimate, transcript_input, target_text, style_dropdown],
                label="💡 Built-in Default Voice Reading Samples",
            )

        generate_btn.click(
            fn=synthesize_voice,
            inputs=[
                ref_audio,
                is_ultimate,
                transcript_input,
                target_text,
                style_dropdown,
                custom_style_input,
                model_dropdown,
                device_radio,
                steps_slider,
                cfg_slider,
                lora_folder,
            ],
            outputs=[audio_out, status_out],
        )

        unload_btn.click(
            fn=unload_model,
            inputs=[],
            outputs=[status_out],
        )

    return demo


if __name__ == "__main__":
    app = build_app()
    app.launch(server_name="127.0.0.1", server_port=7860, share=False)
