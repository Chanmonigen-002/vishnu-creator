import { describe, expect, it, vi } from 'vitest';
import { createDefaultCreatorServicesConfig } from '@vishnucreator/protocol';
import { generateHttpImages, HttpImageProviderError } from '../../src/creator/image/http-image-providers.js';

describe('http-image-providers', () => {
  const dummyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const dummyB64 = dummyPng.toString('base64');

  it('generates image via fal.ai with Key authorization and downloads image', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.image.fal.apiKey = 'fal_key_123';
    config.image.fal.model = 'fal-ai/flux/schnell';

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('queue.fal.run')) {
        expect(init?.headers).toMatchObject({
          authorization: 'Key fal_key_123',
          'content-type': 'application/json'
        });
        const body = JSON.parse(String(init?.body)) as { prompt: string; image_size: string };
        expect(body.prompt).toBe('A futuristic Angkor Wat at sunset');
        expect(body.image_size).toBe('landscape_16_9');
        return new Response(JSON.stringify({
          images: [{ url: 'https://fal.media/files/sample.png' }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === 'https://fal.media/files/sample.png') {
        return new Response(dummyPng, { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      return new Response('Not Found', { status: 404 });
    });

    const result = await generateHttpImages({
      request: {
        prompt: 'A futuristic Angkor Wat at sunset',
        provider: 'fal',
        size: '1536x1024',
        quality: 'medium',
        count: 1
      },
      config,
      fetchImpl: fetchMock
    });

    expect(result.model).toBe('fal-ai/flux/schnell');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.mime).toBe('image/png');
    expect(result.contents[0]?.content).toEqual(dummyPng);
  });

  it('generates image via Stability AI with FormData and base64 response', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.image.stability.apiKey = 'sk-stability-test';
    config.image.stability.model = 'core';

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect(url).toBe('https://api.stability.ai/v2beta/stable-image/generate/core');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer sk-stability-test',
        accept: 'application/json'
      });
      expect(init?.body).toBeInstanceOf(FormData);
      return new Response(JSON.stringify({
        image: dummyB64,
        finish_reason: 'SUCCESS'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const result = await generateHttpImages({
      request: {
        prompt: 'Traditional Khmer dancer digital painting',
        provider: 'stability',
        size: '1024x1024',
        quality: 'high',
        count: 1
      },
      config,
      fetchImpl: fetchMock
    });

    expect(result.model).toBe('core');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.mime).toBe('image/png');
    expect(result.contents[0]?.content).toEqual(dummyPng);
  });

  it('generates image via Replicate with Prefer: wait header', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.image.replicate.apiKey = 'r8_test_token';
    config.image.replicate.model = 'black-forest-labs/flux-schnell';

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/models/black-forest-labs/flux-schnell/predictions')) {
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer r8_test_token',
          prefer: 'wait'
        });
        return new Response(JSON.stringify({
          id: 'pred_123',
          status: 'succeeded',
          output: ['https://replicate.delivery/pbxt/out.png']
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === 'https://replicate.delivery/pbxt/out.png') {
        return new Response(dummyPng, { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      return new Response('Not Found', { status: 404 });
    });

    const result = await generateHttpImages({
      request: {
        prompt: 'Bokator martial arts master illustration',
        provider: 'replicate',
        size: '1024x1536',
        quality: 'medium',
        count: 1
      },
      config,
      fetchImpl: fetchMock
    });

    expect(result.model).toBe('black-forest-labs/flux-schnell');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.content).toEqual(dummyPng);
  });

  it('generates image via Together AI with OpenAI-compatible payload', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.image.together.apiKey = 'together_key_456';
    config.image.together.model = 'black-forest-labs/FLUX.1-schnell';

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect(url).toBe('https://api.together.xyz/v1/images/generations');
      expect(init?.headers).toMatchObject({
        authorization: 'Bearer together_key_456',
        'content-type': 'application/json'
      });
      const body = JSON.parse(String(init?.body)) as { prompt: string; model: string; response_format: string };
      expect(body.prompt).toBe('Cambodian landscape riverboat');
      expect(body.response_format).toBe('b64_json');

      return new Response(JSON.stringify({
        data: [{ b64_json: dummyB64 }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const result = await generateHttpImages({
      request: {
        prompt: 'Cambodian landscape riverboat',
        provider: 'together',
        size: '1536x1024',
        quality: 'medium',
        count: 1
      },
      config,
      fetchImpl: fetchMock
    });

    expect(result.model).toBe('black-forest-labs/FLUX.1-schnell');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.content).toEqual(dummyPng);
  });

  it('generates image via ComfyUI local workflow and polls history', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.image.comfyui.baseUrl = 'http://127.0.0.1:8188';
    config.image.comfyui.model = 'flux-schnell';

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:8188/prompt' && init?.method === 'POST') {
        return new Response(JSON.stringify({ prompt_id: 'cf_prompt_99' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === 'http://127.0.0.1:8188/history/cf_prompt_99') {
        return new Response(JSON.stringify({
          cf_prompt_99: {
            outputs: {
              '9': {
                images: [{ filename: 'VishnuCreator_0001_.png', subfolder: '', type: 'output' }]
              }
            }
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/view?filename=VishnuCreator_0001_.png')) {
        return new Response(dummyPng, { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      return new Response('Not Found', { status: 404 });
    });

    const result = await generateHttpImages({
      request: {
        prompt: 'Apsara celestial dancer in modern art style',
        provider: 'comfyui',
        size: '1024x1024',
        quality: 'medium',
        count: 1
      },
      config,
      fetchImpl: fetchMock
    });

    expect(result.model).toBe('flux-schnell');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.content).toEqual(dummyPng);
  });

  it('throws HttpImageProviderError on missing API key', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.image.fal.apiKey = '';

    await expect(generateHttpImages({
      request: {
        prompt: 'test prompt',
        provider: 'fal',
        size: '1024x1024',
        quality: 'medium',
        count: 1
      },
      config
    })).rejects.toThrow(HttpImageProviderError);
  });
});
