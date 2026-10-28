"""Vishnu Dub Engine — Built-in Model Catalog.

Mirrors @vishnucreator/protocol DEFAULT_MODEL_CATALOG with typed specifications
for Whisper ASR, Demucs separation, VoxCPM2 TTS/cloning, fonts, and GPU packs.
"""

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class ModelCatalogItem:
    id: str
    name: str
    category: str
    description: str
    size_bytes: int
    expected_sha256: str
    source_url: str
    filename: str
    target_subdir: str
    recommended_for_tier: List[str]
    installed: bool = False
    local_path: Optional[str] = None
    local_size_bytes: Optional[int] = None
    sha256_verified: bool = False


DEFAULT_MODEL_CATALOG: List[ModelCatalogItem] = [
    ModelCatalogItem(
        id="whisper-small-int8",
        name="Faster-Whisper Small (INT8)",
        category="asr",
        description="Lightweight speech recognition model optimized for CPU (Tier T0/T1)",
        size_bytes=484_000_000,
        expected_sha256="b4c107ff0f8114efbe0c0faea146cfd595ad78a15dd247563065a6f2385b0d0c",
        source_url="https://huggingface.co/Systran/faster-whisper-small/resolve/main/model.bin",
        filename="model.bin",
        target_subdir="whisper/small-int8",
        recommended_for_tier=["T0", "T1"],
    ),
    ModelCatalogItem(
        id="whisper-large-v3-turbo",
        name="Faster-Whisper Large V3 Turbo",
        category="asr",
        description="Fast high-accuracy speech recognition model optimized for Mid GPU (Tier T2)",
        size_bytes=1_634_000_000,
        expected_sha256="2e9ddff95fc02d53ef69b3df76db01b1cb417855b7ca3c5b5502c6386de6dcf8",
        source_url="https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2/resolve/main/model.bin",
        filename="model.bin",
        target_subdir="whisper/large-v3-turbo",
        recommended_for_tier=["T2"],
    ),
    ModelCatalogItem(
        id="whisper-large-v3",
        name="Faster-Whisper Large V3",
        category="asr",
        description="Maximum accuracy multilingual speech recognition model (Tier T3 High)",
        size_bytes=3_095_000_000,
        expected_sha256="3f324ad71fbb7c66dc251bb41a0296720f1882d23c114382bf39ca17ae0357d7",
        source_url="https://huggingface.co/Systran/faster-whisper-large-v3/resolve/main/model.bin",
        filename="model.bin",
        target_subdir="whisper/large-v3",
        recommended_for_tier=["T3"],
    ),
    ModelCatalogItem(
        id="htdemucs",
        name="HTDemucs Vocal Separator",
        category="separation",
        description="Hybrid Transformer model for clean vocal and background music separation",
        size_bytes=83_500_000,
        expected_sha256="09ade825707e997f0a7164ff57d6b38466b038848ff34f2d7e4b971a938c4c37",
        source_url="https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/95574e-09ade8.th",
        filename="95574e-09ade8.th",
        target_subdir="demucs",
        recommended_for_tier=["T0", "T1", "T2", "T3"],
    ),
    ModelCatalogItem(
        id="voxcpm2-khmer",
        name="VoxCPM2 Khmer Voice Model",
        category="tts",
        description="Pretrained VoxCPM2 model with Khmer phoneme support for 48kHz voice synthesis and cloning",
        size_bytes=1_240_000_000,
        expected_sha256="88a914ec1386d34e9e51cbb47c870a316c528f89bc7221d8b760a5d202428cb2",
        source_url="https://huggingface.co/openbmb/VoxCPM2/resolve/main/model.safetensors",
        filename="model.safetensors",
        target_subdir="voxcpm2",
        recommended_for_tier=["T0", "T1", "T2", "T3"],
    ),
    ModelCatalogItem(
        id="noto-sans-khmer",
        name="Noto Sans Khmer Font",
        category="font",
        description="High-legibility Unicode font for burned-in Khmer subtitles and titles",
        size_bytes=286_720,
        expected_sha256="c5e62f6b8b0e6fa92cf888ee3824bb9a1a68aa0eb0648419caee5d7a0494cf06",
        source_url="https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansKhmer/NotoSansKhmer-Regular.ttf",
        filename="NotoSansKhmer-Regular.ttf",
        target_subdir="fonts",
        recommended_for_tier=["T0", "T1", "T2", "T3"],
    ),
    ModelCatalogItem(
        id="dub-engine-gpu-pack",
        name="Dub Engine CUDA 12.4 GPU Pack",
        category="acceleration",
        description="Optional PyTorch CUDA 12.4 runtime wheels pack for NVIDIA GPUs (Tier T2/T3)",
        size_bytes=2_147_483_648,
        expected_sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        source_url="https://release.vishnuai.org/gpu-packs/dub-engine-gpu-pack-cu124.tar.gz",
        filename="dub-engine-gpu-pack-cu124.tar.gz",
        target_subdir="runtime",
        recommended_for_tier=["T2", "T3"],
    ),
]


def find_model_in_catalog(model_id: str) -> Optional[ModelCatalogItem]:
    for item in DEFAULT_MODEL_CATALOG:
        if item.id == model_id:
            return item
    return None
