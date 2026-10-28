import type {
  CreateImageGenerationRequest,
  CreatorServicesConfig,
  ImageGenerationAsset
} from '@vishnucreator/protocol';

// Direct HTTP adapters for Phase 8 image generation providers (T8.8):
// fal.ai (FLUX), Stability AI (Stable Image Core / SD 3.5), Replicate (FLUX),
// Together AI (FLUX), and local ComfyUI.
// Research recorded in docs/providers/provider-research-2026-10.md.

export const phase8ImageProviders = ['fal', 'stability', 'replicate', 'together', 'comfyui'] as const;
export type Phase8ImageProvider = (typeof phase8ImageProviders)[number];

export function isPhase8ImageProvider(value: unknown): value is Phase8ImageProvider {
  return phase8ImageProviders.some(provider => provider === value);
}

export type GeneratedImage = {
  content: Buffer;
  mime: ImageGenerationAsset['mime'];
};

export class HttpImageProviderError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpImageProviderError';
  }
}

function detectImageMime(content: Buffer): ImageGenerationAsset['mime'] {
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (content[0] === 0xff && content[1] === 0xd8) return 'image/jpeg';
  if (content.subarray(0, 4).toString('ascii') === 'RIFF'
    && content.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return 'image/png';
}

function sizeToDimensions(size: string): { width: number; height: number; ratio: string } {
  if (size === '1536x1024') return { width: 1536, height: 1024, ratio: '16:9' };
  if (size === '1024x1536') return { width: 1024, height: 1536, ratio: '9:16' };
  return { width: 1024, height: 1024, ratio: '1:1' };
}

export async function generateHttpImages(input: {
  request: CreateImageGenerationRequest;
  config: CreatorServicesConfig;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ model: string; contents: GeneratedImage[] }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const { provider } = input.request;
  const prompt = input.request.prompt.trim();
  const count = Math.max(1, input.request.count || 1);
  const { width, height, ratio } = sizeToDimensions(input.request.size);

  if (provider === 'fal') {
    const settings = input.config.image.fal;
    if (!settings.apiKey.trim()) throw new HttpImageProviderError(401, 'fal.ai API key is required');
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://queue.fal.run';
    const model = settings.model.trim() || 'fal-ai/flux/schnell';
    const endpoint = `${base}/${model}`;

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      signal: input.signal,
      headers: {
        authorization: `Key ${settings.apiKey.trim()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        image_size: ratio === '16:9' ? 'landscape_16_9' : ratio === '9:16' ? 'portrait_16_9' : 'square_hd',
        num_images: count
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpImageProviderError(res.status, `fal.ai generation request failed (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json() as Record<string, unknown>;
    // Check if direct result with images
    let imageUrls: string[] = [];
    if (Array.isArray(data.images)) {
      imageUrls = (data.images as Array<{ url?: string }>).map(i => i.url || '').filter(Boolean);
    } else if (typeof data.status_url === 'string') {
      // Poll queue
      const statusUrl = data.status_url;
      const responseUrl = typeof data.response_url === 'string' ? data.response_url : statusUrl;
      for (let i = 0; i < 60; i++) {
        input.signal?.throwIfAborted();
        const poll = await fetchImpl(statusUrl, {
          method: 'GET',
          signal: input.signal,
          headers: { authorization: `Key ${settings.apiKey.trim()}` }
        });
        if (poll.ok) {
          const pollData = await poll.json() as { status?: string };
          if (pollData.status === 'COMPLETED' || poll.status === 200) {
            const resultResp = await fetchImpl(responseUrl, {
              headers: { authorization: `Key ${settings.apiKey.trim()}` },
              signal: input.signal
            });
            if (resultResp.ok) {
              const resJson = await resultResp.json() as { images?: Array<{ url?: string }> };
              imageUrls = (resJson.images || []).map(img => img.url || '').filter(Boolean);
              break;
            }
          }
        }
      }
    }

    if (imageUrls.length === 0) {
      throw new HttpImageProviderError(500, 'fal.ai did not return any image URLs');
    }

    const contents: GeneratedImage[] = [];
    for (const url of imageUrls) {
      input.signal?.throwIfAborted();
      const imgRes = await fetchImpl(url, { signal: input.signal });
      if (!imgRes.ok) throw new HttpImageProviderError(imgRes.status, `Failed to download image from ${url}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      contents.push({ content: buf, mime: detectImageMime(buf) });
    }
    return { model, contents };
  }

  if (provider === 'stability') {
    const settings = input.config.image.stability;
    if (!settings.apiKey.trim()) throw new HttpImageProviderError(401, 'Stability AI API key is required');
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.stability.ai';
    const model = settings.model.trim() || 'core';
    const endpoint = model === 'core'
      ? `${base}/v2beta/stable-image/generate/core`
      : `${base}/v2beta/stable-image/generate/sd3`;

    const form = new FormData();
    form.append('prompt', prompt);
    form.append('aspect_ratio', ratio);
    form.append('output_format', 'png');
    if (model !== 'core') {
      form.append('model', model);
    }

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      signal: input.signal,
      headers: {
        authorization: `Bearer ${settings.apiKey.trim()}`,
        accept: 'application/json'
      },
      body: form
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpImageProviderError(res.status, `Stability AI generation failed (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json() as { image?: string };
    if (!data.image) {
      throw new HttpImageProviderError(500, 'Stability AI response missing image data');
    }
    const buf = Buffer.from(data.image, 'base64');
    return {
      model,
      contents: [{ content: buf, mime: 'image/png' }]
    };
  }

  if (provider === 'replicate') {
    const settings = input.config.image.replicate;
    if (!settings.apiKey.trim()) throw new HttpImageProviderError(401, 'Replicate API key is required');
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.replicate.com/v1';
    const model = settings.model.trim() || 'black-forest-labs/flux-schnell';
    const endpoint = `${base}/models/${model}/predictions`;

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      signal: input.signal,
      headers: {
        authorization: `Bearer ${settings.apiKey.trim()}`,
        'content-type': 'application/json',
        prefer: 'wait'
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: ratio,
          output_format: 'png'
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpImageProviderError(res.status, `Replicate request failed (HTTP ${res.status}): ${errText}`);
    }

    let data = await res.json() as { id?: string; status?: string; output?: string | string[] };
    if (data.status !== 'succeeded' && data.id) {
      const pollUrl = `${base}/predictions/${data.id}`;
      for (let i = 0; i < 60; i++) {
        input.signal?.throwIfAborted();
        const poll = await fetchImpl(pollUrl, {
          headers: { authorization: `Bearer ${settings.apiKey.trim()}` },
          signal: input.signal
        });
        if (poll.ok) {
          data = await poll.json() as typeof data;
          if (data.status === 'succeeded' || data.status === 'failed') break;
        }
      }
    }

    if (data.status !== 'succeeded' || !data.output) {
      throw new HttpImageProviderError(500, `Replicate prediction did not succeed: ${data.status}`);
    }

    const outputUrls = Array.isArray(data.output) ? data.output : [data.output];
    const contents: GeneratedImage[] = [];
    for (const url of outputUrls) {
      input.signal?.throwIfAborted();
      const imgRes = await fetchImpl(url, { signal: input.signal });
      if (!imgRes.ok) throw new HttpImageProviderError(imgRes.status, `Failed to download Replicate image from ${url}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      contents.push({ content: buf, mime: detectImageMime(buf) });
    }
    return { model, contents };
  }

  if (provider === 'together') {
    const settings = input.config.image.together;
    if (!settings.apiKey.trim()) throw new HttpImageProviderError(401, 'Together AI API key is required');
    const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'https://api.together.xyz/v1';
    const model = settings.model.trim() || 'black-forest-labs/FLUX.1-schnell';
    const endpoint = `${base}/images/generations`;

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      signal: input.signal,
      headers: {
        authorization: `Bearer ${settings.apiKey.trim()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt,
        width,
        height,
        n: count,
        response_format: 'b64_json'
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new HttpImageProviderError(res.status, `Together AI image generation failed (HTTP ${res.status}): ${errText}`);
    }

    const data = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const items = data.data || [];
    if (items.length === 0) {
      throw new HttpImageProviderError(500, 'Together AI returned empty image data');
    }

    const contents: GeneratedImage[] = [];
    for (const item of items) {
      if (item.b64_json) {
        const buf = Buffer.from(item.b64_json, 'base64');
        contents.push({ content: buf, mime: detectImageMime(buf) });
      } else if (item.url) {
        input.signal?.throwIfAborted();
        const imgRes = await fetchImpl(item.url, { signal: input.signal });
        if (!imgRes.ok) throw new HttpImageProviderError(imgRes.status, `Failed to download image from ${item.url}`);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        contents.push({ content: buf, mime: detectImageMime(buf) });
      }
    }
    return { model, contents };
  }

  // comfyui
  const settings = input.config.image.comfyui;
  const base = settings.baseUrl.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8188';
  const model = settings.model.trim() || 'flux-schnell';

  // Standard ComfyUI prompt workflow
  const promptWorkflow = {
    '3': {
      class_type: 'KSampler',
      inputs: {
        cfg: 1,
        denoise: 1,
        latent_image: ['5', 0],
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        sampler_name: 'euler',
        scheduler: 'simple',
        seed: Math.floor(Math.random() * 1_000_000_000),
        steps: 4
      }
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: model }
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { batch_size: count, height, width }
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
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'VishnuCreator', images: ['8', 0] }
    }
  };

  const promptRes = await fetchImpl(`${base}/prompt`, {
    method: 'POST',
    signal: input.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: promptWorkflow })
  });

  if (!promptRes.ok) {
    const errText = await promptRes.text().catch(() => '');
    throw new HttpImageProviderError(promptRes.status, `ComfyUI prompt submission failed (HTTP ${promptRes.status}): ${errText}`);
  }

  const promptData = await promptRes.json() as { prompt_id?: string };
  const promptId = promptData.prompt_id;
  if (!promptId) {
    throw new HttpImageProviderError(500, 'ComfyUI response missing prompt_id');
  }

  // Poll history
  let savedImages: Array<{ filename: string; subfolder?: string; type?: string }> = [];
  for (let i = 0; i < 60; i++) {
    input.signal?.throwIfAborted();
    const histRes = await fetchImpl(`${base}/history/${promptId}`, { signal: input.signal });
    if (histRes.ok) {
      const histData = await histRes.json() as Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> }>;
      const task = histData[promptId];
      if (task?.outputs) {
        for (const nodeKey of Object.keys(task.outputs)) {
          const imgs = task.outputs[nodeKey]?.images;
          if (Array.isArray(imgs) && imgs.length > 0) {
            savedImages = imgs;
            break;
          }
        }
        if (savedImages.length > 0) break;
      }
    }
  }

  if (savedImages.length === 0) {
    throw new HttpImageProviderError(500, 'ComfyUI history did not yield any saved images');
  }

  const contents: GeneratedImage[] = [];
  for (const img of savedImages) {
    input.signal?.throwIfAborted();
    const viewUrl = `${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
    const viewRes = await fetchImpl(viewUrl, { signal: input.signal });
    if (!viewRes.ok) throw new HttpImageProviderError(viewRes.status, `Failed to download image from ComfyUI ${viewUrl}`);
    const buf = Buffer.from(await viewRes.arrayBuffer());
    contents.push({ content: buf, mime: detectImageMime(buf) });
  }
  return { model, contents };
}
