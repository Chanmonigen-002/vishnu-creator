/**
 * Vishnu Creator — Model catalog and download manager protocol contracts.
 *
 * Defines typed specifications for downloadable AI models (Whisper ASR,
 * Demucs separation, VoxCPM2 TTS/cloning, Khmer fonts, and GPU runtime packs).
 */

export type ModelCategory = 'asr' | 'tts' | 'separation' | 'font' | 'acceleration';

export type ModelDownloadStatus = 'idle' | 'downloading' | 'verifying' | 'installed' | 'error';

export type ModelHardwareTier = 'T0' | 'T1' | 'T2' | 'T3';

export type ModelCatalogItem = {
  id: string;
  name: string;
  category: ModelCategory;
  description: string;
  sizeBytes: number;
  expectedSha256: string;
  sourceUrl: string;
  filename: string;
  targetSubdir: string;
  recommendedForTier: ModelHardwareTier[];
  installed?: boolean;
  localPath?: string;
  localSizeBytes?: number;
  sha256Verified?: boolean;
};

export type ModelDownloadProgress = {
  modelId: string;
  status: ModelDownloadStatus;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  error?: string;
  localPath?: string;
};

export type ModelCatalogListResponse = {
  modelsRoot: string;
  availableDiskFreeBytes: number;
  models: ModelCatalogItem[];
};

export type ModelDownloadRequest = {
  modelId: string;
  forceRedownload?: boolean;
};

export type ModelVerifyRequest = {
  modelId: string;
};

export type ModelVerifyResponse = {
  modelId: string;
  valid: boolean;
  expectedSha256: string;
  calculatedSha256?: string;
  error?: string;
};

export type ModelDeleteResponse = {
  modelId: string;
  deleted: boolean;
  message?: string;
};

/**
 * Built-in default model catalog for Vishnu Creator.
 * All models have explicit sizes, hashes, and target subdirectories.
 */
export const DEFAULT_MODEL_CATALOG: readonly ModelCatalogItem[] = [
  {
    id: 'whisper-small-int8',
    name: 'Faster-Whisper Small (INT8)',
    category: 'asr',
    description: 'Lightweight speech recognition model optimized for CPU (Tier T0/T1)',
    sizeBytes: 484_000_000,
    expectedSha256: 'b4c107ff0f8114efbe0c0faea146cfd595ad78a15dd247563065a6f2385b0d0c',
    sourceUrl: 'https://huggingface.co/Systran/faster-whisper-small/resolve/main/model.bin',
    filename: 'model.bin',
    targetSubdir: 'whisper/small-int8',
    recommendedForTier: ['T0', 'T1'],
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Faster-Whisper Large V3 Turbo',
    category: 'asr',
    description: 'Fast high-accuracy speech recognition model optimized for Mid GPU (Tier T2)',
    sizeBytes: 1_634_000_000,
    expectedSha256: '2e9ddff95fc02d53ef69b3df76db01b1cb417855b7ca3c5b5502c6386de6dcf8',
    sourceUrl: 'https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2/resolve/main/model.bin',
    filename: 'model.bin',
    targetSubdir: 'whisper/large-v3-turbo',
    recommendedForTier: ['T2'],
  },
  {
    id: 'whisper-large-v3',
    name: 'Faster-Whisper Large V3',
    category: 'asr',
    description: 'Maximum accuracy multilingual speech recognition model (Tier T3 High)',
    sizeBytes: 3_095_000_000,
    expectedSha256: '3f324ad71fbb7c66dc251bb41a0296720f1882d23c114382bf39ca17ae0357d7',
    sourceUrl: 'https://huggingface.co/Systran/faster-whisper-large-v3/resolve/main/model.bin',
    filename: 'model.bin',
    targetSubdir: 'whisper/large-v3',
    recommendedForTier: ['T3'],
  },
  {
    id: 'htdemucs',
    name: 'HTDemucs Vocal Separator',
    category: 'separation',
    description: 'Hybrid Transformer model for clean vocal and background music separation',
    sizeBytes: 83_500_000,
    expectedSha256: '09ade825707e997f0a7164ff57d6b38466b038848ff34f2d7e4b971a938c4c37',
    sourceUrl: 'https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/95574e-09ade8.th',
    filename: '95574e-09ade8.th',
    targetSubdir: 'demucs',
    recommendedForTier: ['T0', 'T1', 'T2', 'T3'],
  },
  {
    id: 'voxcpm2-khmer',
    name: 'VoxCPM2 Khmer Voice Model',
    category: 'tts',
    description: 'Pretrained VoxCPM2 model with Khmer phoneme support for 48kHz voice synthesis and cloning',
    sizeBytes: 4_580_080_592,
    expectedSha256: 'f7f964cfa9da23653baec6e6f7750719977ad944ed9f95fe52fe3a620506891d',
    sourceUrl: 'https://huggingface.co/openbmb/VoxCPM2/resolve/main/model.safetensors',
    filename: 'model.safetensors',
    targetSubdir: 'voxcpm2',
    recommendedForTier: ['T0', 'T1', 'T2', 'T3'],
  },
  {
    id: 'noto-sans-khmer',
    name: 'Noto Sans Khmer Font',
    category: 'font',
    description: 'High-legibility Unicode font for burned-in Khmer subtitles and titles',
    sizeBytes: 286_720,
    expectedSha256: 'c5e62f6b8b0e6fa92cf888ee3824bb9a1a68aa0eb0648419caee5d7a0494cf06',
    sourceUrl: 'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansKhmer/NotoSansKhmer-Regular.ttf',
    filename: 'NotoSansKhmer-Regular.ttf',
    targetSubdir: 'fonts',
    recommendedForTier: ['T0', 'T1', 'T2', 'T3'],
  },
  {
    id: 'dub-engine-gpu-pack',
    name: 'Dub Engine CUDA 12.4 GPU Pack',
    category: 'acceleration',
    description: 'Optional PyTorch CUDA 12.4 runtime wheels pack for NVIDIA GPUs (Tier T2/T3)',
    sizeBytes: 2_147_483_648,
    expectedSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sourceUrl: 'https://release.vishnuai.org/gpu-packs/dub-engine-gpu-pack-cu124.tar.gz',
    filename: 'dub-engine-gpu-pack-cu124.tar.gz',
    targetSubdir: 'runtime',
    recommendedForTier: ['T2', 'T3'],
  },
] as const;

export function findModelInCatalog(modelId: string): ModelCatalogItem | undefined {
  return DEFAULT_MODEL_CATALOG.find(item => item.id === modelId);
}
