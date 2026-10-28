import type { PublicErrorFacts } from './issues.js';

export const imageGenerationSizes = ['1024x1024', '1536x1024', '1024x1536'] as const;
export type ImageGenerationSize = typeof imageGenerationSizes[number];
export type ImageGenerationQuality = 'low' | 'medium' | 'high';
export type ImageGenerationProvider =
  | 'openai'
  | 'jimeng'
  | 'kling'
  | 'gemini'
  | 'codex-native'
  | 'qwen-image'
  | 'fal'
  | 'stability'
  | 'replicate'
  | 'together'
  | 'comfyui';

export const coverStyleIds = [
  'khmer-editorial',
  'personal-growth',
  'psychology',
  'wealth-platinum-red',
  'bilibili-red-blue-white',
  'custom'
] as const;
export type CoverStyleId = typeof coverStyleIds[number];

export const coverTextLanguages = [
  'km-KH',
  'zh-CN',
  'zh-TW',
  'en-US',
  'ja-JP',
  'ko-KR'
] as const;
export type CoverTextLanguage = typeof coverTextLanguages[number];
export type CoverTextLanguagePreference = 'auto' | CoverTextLanguage;

export type CreateImageGenerationRequest = {
  prompt: string;
  provider: ImageGenerationProvider;
  size: ImageGenerationSize;
  quality: ImageGenerationQuality;
  count: number;
  aspectRatio?: string;
  resolution?: string;
  officialQuality?: string;
  modelQuality?: string;
};

/** Detect explicit references to an existing image, rather than ordinary photo styles. */
export function imagePromptRequiresReference(prompt: string): boolean {
  const brief = prompt.replace(
    /(?:无需|不需要|不用|不要|不使用|没有)(?:再|任何)?(?:上传|提供|使用|添加)?(?:的)?(?:参考图|参考图片|图片|照片|原图)|(?:without|no|do not use)\s+(?:(?:an?|any|the)\s+)?(?:(?:reference|uploaded|attached|original)\s+)?(?:images?|photos?|pictures?)/gi,
    ''
  );
  return /(?:上传|上傳|附上|附带|所附|提供|给定|原始|输入|这张|该|這張|此|参考|參考)[^。！？\n]{0,12}(?:图片|照片|图像|圖片|相片|圖像)|(?:基于|根据|使用|编辑|修改|重绘|保留|保持)[^。！？\n]{0,8}参考图|参考图[^。！？\n]{0,8}(?:改成|转换|主体|构图)|(?:原图|原圖|上图|上圖)|\b(?:uploaded|attached|provided|input|reference|original|source|this|that)\s+(?:[\w-]+\s+){0,3}(?:image|photo|picture)s?\b/i.test(brief);
}

export type ImageGenerationAsset = {
  index: number;
  fileName: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  size: number;
};

export type ImageGenerationResult = {
  id: string;
  prompt: string;
  provider: ImageGenerationProvider;
  model: string;
  imageSize: ImageGenerationSize;
  quality: ImageGenerationQuality;
  aspectRatio?: string;
  resolution?: string;
  modelQuality?: string;
  count: number;
  images: ImageGenerationAsset[];
  createdAt: string;
};

export type ImageGenerationResultResponse = {
  result: ImageGenerationResult;
};

export const videoGenerationSizes = ['1280x720', '720x1280', '1024x1024'] as const;
export type VideoGenerationSize = typeof videoGenerationSizes[number] | `${number}x${number}` | `${string}@${number}:${number}`;
export const videoGenerationDurations = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type VideoGenerationDuration = number;
export type VideoGenerationStatus = 'queued' | 'in_progress' | 'completed' | 'failed';
export const videoGenerationProviders = [
  'seedance',
  'kling',
  'veo',
  'runway',
  'luma',
  'minimax',
  'comfyui'
] as const;
export type VideoGenerationProvider = typeof videoGenerationProviders[number];

export const videoGenerationModelIds = {
  seedance: [
    'doubao-seedance-2-5-260628',
    'doubao-seedance-2-0-260128',
    'doubao-seedance-2-0-fast-260128',
    'doubao-seedance-2-0-mini-260615',
    'doubao-seedance-1-5-pro-251215',
    'doubao-seedance-1-0-pro-fast-251015',
    'doubao-seedance-1-0-pro-250528'
  ],
  kling: ['kling-v2-1-master'],
  veo: ['veo-3.1-generate-preview'],
  runway: ['gen4.5', 'gen3a_turbo'],
  luma: ['ray-2', 'ray-flash-2'],
  minimax: ['MiniMax-H3', 'MiniMax-H3-Highspeed', 'MiniMax-Hailuo-2.3'],
  comfyui: ['svd-workflow', 'animatediff-workflow']
} as const;

export const defaultVideoGenerationModels = {
  seedance: videoGenerationModelIds.seedance[0],
  kling: videoGenerationModelIds.kling[0],
  veo: videoGenerationModelIds.veo[0],
  runway: videoGenerationModelIds.runway[0],
  luma: videoGenerationModelIds.luma[0],
  minimax: videoGenerationModelIds.minimax[0],
  comfyui: videoGenerationModelIds.comfyui[0]
} satisfies Record<VideoGenerationProvider, string>;

export type VideoGenerationReferenceImage = {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
};

export type CreateVideoGenerationRequest = {
  prompt: string;
  provider: VideoGenerationProvider;
  model?: string;
  size: VideoGenerationSize;
  duration: VideoGenerationDuration;
  referenceImage?: VideoGenerationReferenceImage;
  references?: VideoGenerationReference[];
  generateAudio?: boolean;
  priceVersion?: string;
};

export type VideoGenerationReference = {
  role: 'image' | 'video' | 'audio' | 'firstFrame' | 'lastFrame';
  assetId: string;
  fileName: string;
};

export type VideoGenerationResult = {
  id: string;
  prompt: string;
  provider: VideoGenerationProvider;
  model: string;
  videoSize: VideoGenerationSize;
  duration: VideoGenerationDuration;
  status: VideoGenerationStatus;
  progress: number;
  progressKnown?: boolean;
  phase?: 'preparing' | 'queued' | 'generating' | 'downloading' | 'reconciling';
  fileName?: string;
  mime?: 'video/mp4';
  size?: number;
  error?: string;
  publicFacts?: PublicErrorFacts;
  createdAt: string;
  updatedAt: string;
};

export type VideoGenerationResultResponse = {
  result: VideoGenerationResult;
};
