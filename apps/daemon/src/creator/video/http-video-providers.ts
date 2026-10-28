import {
  defaultVideoGenerationModels,
  type CreateVideoGenerationRequest,
  type CreatorServicesConfig,
  type PublicErrorFacts,
  type VideoGenerationProvider,
  type VideoGenerationStatus
} from '@vishnucreator/protocol';

// Direct HTTP adapters for Phase 8 video generation providers (T8.9):
// Runway (Gen-4.5 / Gen-3a), Luma Dream Machine (Ray-2),
// MiniMax Hailuo (H3), and local ComfyUI.
// Research recorded in docs/providers/provider-research-2026-10.md.

export const phase8VideoProviders = ['runway', 'luma', 'minimax', 'comfyui'] as const;
export type Phase8VideoProvider = (typeof phase8VideoProviders)[number];

export function isPhase8VideoProvider(value: unknown): value is Phase8VideoProvider {
  return phase8VideoProviders.some(provider => provider === value);
}

export type HttpRemoteVideoJob = {
  upstreamId: string;
  model: string;
  payload: Record<string, unknown>;
  status: VideoGenerationStatus;
  progress: number;
  progressKnown: boolean;
  error?: string;
  publicFacts?: PublicErrorFacts;
};

export class HttpVideoProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpVideoProviderError';
  }
}

function sizeToDimensions(size: string): { width: number; height: number; ratio: string } {
  if (size === '720x1280') return { width: 720, height: 1280, ratio: '9:16' };
  if (size === '1024x1024') return { width: 1024, height: 1024, ratio: '1:1' };
  return { width: 1280, height: 720, ratio: '16:9' };
}

function referenceImageDataUrl(referenceImage: NonNullable<CreateVideoGenerationRequest['referenceImage']>): string {
  return `data:${referenceImage.mime};base64,${referenceImage.data}`;
}

export async function createHttpVideoJob(
  request: CreateVideoGenerationRequest,
  config: CreatorServicesConfig,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch
): Promise<HttpRemoteVideoJob> {
  const fetcher = fetchImpl ?? fetch;
  const provider = request.provider as Phase8VideoProvider;
  const prompt = request.prompt.trim();
  const { width, height, ratio } = sizeToDimensions(request.size);

  if (provider === 'runway') {
    const settings = config.video.runway;
    if (!settings.apiKey.trim()) {
      throw new HttpVideoProviderError(401, 'Runway video generation credentials (API key) are required');
    }
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.dev.runwayml.com';
    const model = request.model?.trim() || settings.model.trim() || defaultVideoGenerationModels.runway;
    const runwayRatio = ratio === '9:16' ? '720:1280' : '1280:720';
    const endpoint = request.referenceImage ? `${base}/v1/image_to_video` : `${base}/v1/text_to_video`;

    const body: Record<string, unknown> = {
      promptText: prompt,
      model,
      ratio: runwayRatio,
      duration: request.duration
    };
    if (request.referenceImage) {
      body.promptImage = referenceImageDataUrl(request.referenceImage);
    }

    const res = await fetcher(endpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'X-Runway-Version': '2024-11-06',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpVideoProviderError(res.status, `Runway video generation request failed (HTTP ${res.status}): ${errText}`);
    }

    const payload = await res.json() as Record<string, unknown>;
    const upstreamId = typeof payload.id === 'string' ? payload.id : undefined;
    if (!upstreamId) {
      throw new HttpVideoProviderError(502, 'Runway response missing task id');
    }

    return {
      upstreamId,
      model,
      payload,
      status: 'queued',
      progress: 0,
      progressKnown: false
    };
  }

  if (provider === 'luma') {
    const settings = config.video.luma;
    if (!settings.apiKey.trim()) {
      throw new HttpVideoProviderError(401, 'Luma video generation credentials (API key) are required');
    }
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.lumalabs.ai/dream-machine/v1';
    const model = request.model?.trim() || settings.model.trim() || defaultVideoGenerationModels.luma;
    const endpoint = `${base}/generations`;

    const body: Record<string, unknown> = {
      prompt,
      model,
      aspect_ratio: ratio,
      duration: `${request.duration}s`
    };
    if (request.referenceImage) {
      body.keyframes = {
        frame0: {
          type: 'image',
          url: referenceImageDataUrl(request.referenceImage)
        }
      };
    }

    const res = await fetcher(endpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpVideoProviderError(res.status, `Luma video generation request failed (HTTP ${res.status}): ${errText}`);
    }

    const payload = await res.json() as Record<string, unknown>;
    const upstreamId = typeof payload.id === 'string' ? payload.id : undefined;
    if (!upstreamId) {
      throw new HttpVideoProviderError(502, 'Luma response missing generation id');
    }

    return {
      upstreamId,
      model,
      payload,
      status: 'queued',
      progress: 0,
      progressKnown: false
    };
  }

  if (provider === 'minimax') {
    const settings = config.video.minimax;
    if (!settings.apiKey.trim()) {
      throw new HttpVideoProviderError(401, 'MiniMax video generation credentials (API key) are required');
    }
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.minimax.io/v1';
    const model = request.model?.trim() || settings.model.trim() || defaultVideoGenerationModels.minimax;
    const endpoint = `${base}/video_generation`;

    const body: Record<string, unknown> = {
      model,
      prompt
    };
    if (request.referenceImage) {
      body.first_frame_image = referenceImageDataUrl(request.referenceImage);
    }

    const res = await fetcher(endpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpVideoProviderError(res.status, `MiniMax video generation request failed (HTTP ${res.status}): ${errText}`);
    }

    const payload = await res.json() as Record<string, unknown>;
    const upstreamId = typeof payload.task_id === 'string' ? payload.task_id : undefined;
    if (!upstreamId) {
      throw new HttpVideoProviderError(502, 'MiniMax response missing task_id');
    }

    return {
      upstreamId,
      model,
      payload,
      status: 'queued',
      progress: 0,
      progressKnown: false
    };
  }

  // comfyui
  const settings = config.video.comfyui;
  const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8188';
  const model = request.model?.trim() || settings.model.trim() || defaultVideoGenerationModels.comfyui;

  const promptWorkflow = {
    '3': {
      class_type: 'KSampler',
      inputs: {
        cfg: 2.5,
        denoise: 1,
        latent_image: ['5', 0],
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        sampler_name: 'euler',
        scheduler: 'karras',
        seed: Math.floor(Math.random() * 1_000_000_000),
        steps: 20
      }
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: model }
    },
    '5': {
      class_type: 'EmptyLatentVideo',
      inputs: { batch_size: 1, height, length: Math.max(8, request.duration * 4), width }
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['4', 1], text: prompt }
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { clip: ['4', 1], text: '' }
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] }
    },
    '9': {
      class_type: 'SaveAnimatedWEBP',
      inputs: { filename_prefix: 'VishnuCreator_video', images: ['8', 0] }
    }
  };

  const res = await fetcher(`${base}/prompt`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: promptWorkflow })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new HttpVideoProviderError(res.status, `ComfyUI prompt submission failed (HTTP ${res.status}): ${errText}`);
  }

  const payload = await res.json() as { prompt_id?: string };
  const upstreamId = payload.prompt_id;
  if (!upstreamId) {
    throw new HttpVideoProviderError(500, 'ComfyUI response missing prompt_id');
  }

  return {
    upstreamId,
    model,
    payload: payload as Record<string, unknown>,
    status: 'queued',
    progress: 0,
    progressKnown: false
  };
}

export async function refreshHttpVideoJob(
  stored: {
    upstreamId: string;
    generationMode?: 'text-to-video' | 'image-to-video';
    result: { provider: VideoGenerationProvider; model: string };
  },
  config: CreatorServicesConfig,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch
): Promise<HttpRemoteVideoJob> {
  const fetcher = fetchImpl ?? fetch;
  const provider = stored.result.provider as Phase8VideoProvider;
  const upstreamId = stored.upstreamId;

  if (provider === 'runway') {
    const settings = config.video.runway;
    if (!settings.apiKey.trim()) {
      throw new HttpVideoProviderError(401, 'Runway video generation credentials (API key) are required');
    }
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.dev.runwayml.com';
    const endpoint = `${base}/v1/tasks/${encodeURIComponent(upstreamId)}`;

    const res = await fetcher(endpoint, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        'X-Runway-Version': '2024-11-06'
      }
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpVideoProviderError(res.status, `Runway task refresh failed (HTTP ${res.status}): ${errText}`);
    }

    const payload = await res.json() as Record<string, unknown>;
    const rawStatus = typeof payload.status === 'string' ? payload.status.toUpperCase() : '';

    if (rawStatus === 'SUCCEEDED') {
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'completed',
        progress: 100,
        progressKnown: true
      };
    }
    if (rawStatus === 'FAILED' || rawStatus === 'CANCELLED') {
      const errorMsg = typeof payload.failure === 'string'
        ? payload.failure
        : typeof payload.failureCode === 'string'
          ? `Runway failed: ${payload.failureCode}`
          : 'Runway video generation failed';
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'failed',
        progress: 0,
        progressKnown: false,
        error: errorMsg
      };
    }
    if (rawStatus === 'RUNNING') {
      const progressNum = typeof payload.progress === 'number' && Number.isFinite(payload.progress)
        ? Math.max(1, Math.min(99, Math.round(payload.progress <= 1 ? payload.progress * 100 : payload.progress)))
        : 50;
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'in_progress',
        progress: progressNum,
        progressKnown: typeof payload.progress === 'number'
      };
    }

    return {
      upstreamId,
      model: stored.result.model,
      payload,
      status: 'queued',
      progress: 0,
      progressKnown: false
    };
  }

  if (provider === 'luma') {
    const settings = config.video.luma;
    if (!settings.apiKey.trim()) {
      throw new HttpVideoProviderError(401, 'Luma video generation credentials (API key) are required');
    }
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.lumalabs.ai/dream-machine/v1';
    const endpoint = `${base}/generations/${encodeURIComponent(upstreamId)}`;

    const res = await fetcher(endpoint, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`
      }
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpVideoProviderError(res.status, `Luma task refresh failed (HTTP ${res.status}): ${errText}`);
    }

    const payload = await res.json() as Record<string, unknown>;
    const rawState = typeof payload.state === 'string' ? payload.state.toLowerCase() : '';

    if (rawState === 'completed') {
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'completed',
        progress: 100,
        progressKnown: true
      };
    }
    if (rawState === 'failed') {
      const errorMsg = typeof payload.failure_reason === 'string'
        ? payload.failure_reason
        : 'Luma video generation failed';
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'failed',
        progress: 0,
        progressKnown: false,
        error: errorMsg
      };
    }
    if (rawState === 'dreaming') {
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'in_progress',
        progress: 50,
        progressKnown: false
      };
    }

    return {
      upstreamId,
      model: stored.result.model,
      payload,
      status: 'queued',
      progress: 0,
      progressKnown: false
    };
  }

  if (provider === 'minimax') {
    const settings = config.video.minimax;
    if (!settings.apiKey.trim()) {
      throw new HttpVideoProviderError(401, 'MiniMax video generation credentials (API key) are required');
    }
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.minimax.io/v1';
    const endpoint = `${base}/query/video_generation?task_id=${encodeURIComponent(upstreamId)}`;

    const res = await fetcher(endpoint, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${settings.apiKey.trim()}`
      }
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpVideoProviderError(res.status, `MiniMax task refresh failed (HTTP ${res.status}): ${errText}`);
    }

    const payload = await res.json() as Record<string, unknown>;
    const rawStatus = typeof payload.status === 'string' ? payload.status.toLowerCase() : '';

    if (rawStatus === 'success') {
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'completed',
        progress: 100,
        progressKnown: true
      };
    }
    if (rawStatus === 'fail') {
      const baseResp = payload.base_resp as { status_msg?: string } | undefined;
      const errorMsg = typeof baseResp?.status_msg === 'string' && baseResp.status_msg
        ? baseResp.status_msg
        : 'MiniMax video generation failed';
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'failed',
        progress: 0,
        progressKnown: false,
        error: errorMsg
      };
    }
    if (rawStatus === 'processing') {
      return {
        upstreamId,
        model: stored.result.model,
        payload,
        status: 'in_progress',
        progress: 50,
        progressKnown: false
      };
    }

    return {
      upstreamId,
      model: stored.result.model,
      payload,
      status: 'queued',
      progress: 0,
      progressKnown: false
    };
  }

  // comfyui
  const settings = config.video.comfyui;
  const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8188';
  const endpoint = `${base}/history/${encodeURIComponent(upstreamId)}`;

  const res = await fetcher(endpoint, {
    method: 'GET',
    signal
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new HttpVideoProviderError(res.status, `ComfyUI task refresh failed (HTTP ${res.status}): ${errText}`);
  }

  const histData = await res.json() as Record<string, {
    outputs?: Record<string, {
      gifs?: Array<{ filename: string; subfolder?: string; type?: string }>;
      videos?: Array<{ filename: string; subfolder?: string; type?: string }>;
      images?: Array<{ filename: string; subfolder?: string; type?: string }>;
    }>;
    status?: { completed?: boolean; status_str?: string };
  }>;

  const task = histData[upstreamId];
  if (!task) {
    return {
      upstreamId,
      model: stored.result.model,
      payload: histData as unknown as Record<string, unknown>,
      status: 'in_progress',
      progress: 25,
      progressKnown: false
    };
  }

  if (task.status?.status_str === 'error') {
    return {
      upstreamId,
      model: stored.result.model,
      payload: task as unknown as Record<string, unknown>,
      status: 'failed',
      progress: 0,
      progressKnown: false,
      error: 'ComfyUI task execution failed'
    };
  }

  if (task.outputs) {
    for (const nodeKey of Object.keys(task.outputs)) {
      const outputNode = task.outputs[nodeKey];
      const items = outputNode?.videos || outputNode?.gifs || outputNode?.images;
      if (Array.isArray(items) && items.length > 0) {
        const item = items[0];
        if (item) {
          const viewUrl = `${base}/view?filename=${encodeURIComponent(item.filename)}&subfolder=${encodeURIComponent(item.subfolder || '')}&type=${encodeURIComponent(item.type || 'output')}`;
          return {
            upstreamId,
            model: stored.result.model,
            payload: { ...task, download_url: viewUrl },
            status: 'completed',
            progress: 100,
            progressKnown: true
          };
        }
      }
    }
  }

  return {
    upstreamId,
    model: stored.result.model,
    payload: task as unknown as Record<string, unknown>,
    status: 'in_progress',
    progress: 50,
    progressKnown: false
  };
}
