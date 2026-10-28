import { describe, expect, it, vi } from 'vitest';
import { createDefaultCreatorServicesConfig } from '@vishnucreator/protocol';
import {
  createHttpVideoJob,
  HttpVideoProviderError,
  refreshHttpVideoJob
} from '../../src/creator/video/http-video-providers.js';

describe('http-video-providers', () => {
  describe('Runway', () => {
    it('creates text-to-video job with bearer auth and version header', async () => {
      const config = createDefaultCreatorServicesConfig();
      config.video.runway.apiKey = 'rw_key_123';
      config.video.runway.model = 'gen4.5';

      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        expect(url).toBe('https://api.dev.runwayml.com/v1/text_to_video');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer rw_key_123',
          'X-Runway-Version': '2024-11-06',
          'Content-Type': 'application/json'
        });
        const body = JSON.parse(String(init?.body)) as { promptText: string; model: string; ratio: string; duration: number };
        expect(body.promptText).toBe('A temple in Angkor Wat at sunrise');
        expect(body.model).toBe('gen4.5');
        expect(body.ratio).toBe('1280:720');
        expect(body.duration).toBe(5);

        return new Response(JSON.stringify({ id: 'task_runway_101' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      });

      const job = await createHttpVideoJob({
        prompt: 'A temple in Angkor Wat at sunrise',
        provider: 'runway',
        size: '1280x720',
        duration: 5
      }, config, undefined, fetchMock);

      expect(job.upstreamId).toBe('task_runway_101');
      expect(job.model).toBe('gen4.5');
      expect(job.status).toBe('queued');
    });

    it('creates image-to-video job when reference image is supplied', async () => {
      const config = createDefaultCreatorServicesConfig();
      config.video.runway.apiKey = 'rw_key_123';

      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        expect(url).toBe('https://api.dev.runwayml.com/v1/image_to_video');
        const body = JSON.parse(String(init?.body)) as { promptImage: string; promptText: string };
        expect(body.promptImage).toBe('data:image/png;base64,iVBORw0KGgo=');
        return new Response(JSON.stringify({ id: 'task_runway_img2vid' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      });

      const job = await createHttpVideoJob({
        prompt: 'Animate this character',
        provider: 'runway',
        size: '1280x720',
        duration: 5,
        referenceImage: {
          mime: 'image/png',
          data: 'iVBORw0KGgo='
        }
      }, config, undefined, fetchMock);

      expect(job.upstreamId).toBe('task_runway_img2vid');
    });

    it('refreshes task progress and success states', async () => {
      const config = createDefaultCreatorServicesConfig();
      config.video.runway.apiKey = 'rw_key_123';

      const runningMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
        id: 'task_1',
        status: 'RUNNING',
        progress: 0.65
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

      const runningJob = await refreshHttpVideoJob({
        upstreamId: 'task_1',
        result: { provider: 'runway', model: 'gen4.5' }
      }, config, undefined, runningMock);

      expect(runningJob.status).toBe('in_progress');
      expect(runningJob.progress).toBe(65);

      const succeededMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
        id: 'task_1',
        status: 'SUCCEEDED',
        output: ['https://cdn.runwayml.com/video1.mp4']
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

      const completedJob = await refreshHttpVideoJob({
        upstreamId: 'task_1',
        result: { provider: 'runway', model: 'gen4.5' }
      }, config, undefined, succeededMock);

      expect(completedJob.status).toBe('completed');
      expect(completedJob.progress).toBe(100);
    });

    it('throws error when API key is missing', async () => {
      const config = createDefaultCreatorServicesConfig();
      config.video.runway.apiKey = '';

      await expect(createHttpVideoJob({
        prompt: 'test',
        provider: 'runway',
        size: '1280x720',
        duration: 5
      }, config)).rejects.toThrow(HttpVideoProviderError);
    });
  });

  describe('Luma Dream Machine', () => {
    it('creates video generation job', async () => {
      const config = createDefaultCreatorServicesConfig();
      config.video.luma.apiKey = 'luma_key_456';
      config.video.luma.model = 'ray-2';

      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        expect(url).toBe('https://api.lumalabs.ai/dream-machine/v1/generations');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer luma_key_456',
          'Content-Type': 'application/json'
        });
        const body = JSON.parse(String(init?.body)) as { prompt: string; aspect_ratio: string; duration: string };
        expect(body.prompt).toBe('Drone flyover ancient city');
        expect(body.aspect_ratio).toBe('16:9');
        expect(body.duration).toBe('5s');

        return new Response(JSON.stringify({ id: 'luma_gen_001', state: 'queued' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      });

      const job = await createHttpVideoJob({
        prompt: 'Drone flyover ancient city',
        provider: 'luma',
        size: '1280x720',
        duration: 5
      }, config, undefined, fetchMock);

      expect(job.upstreamId).toBe('luma_gen_001');
      expect(job.model).toBe('ray-2');
    });

    it('refreshes task states from Luma', async () => {
      const config = createDefaultCreatorServicesConfig();
      config.video.luma.apiKey = 'luma_key_456';

      const dreamingMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
        id: 'luma_gen_001',
        state: 'dreaming'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

      const inProgress = await refreshHttpVideoJob({
        upstreamId: 'luma_gen_001',
        result: { provider: 'luma', model: 'ray-2' }
      }, config, undefined, dreamingMock);

      expect(inProgress.status).toBe('in_progress');

      const completedMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
        id: 'luma_gen_001',
        state: 'completed',
        assets: { video: 'https://cdn.lumalabs.ai/gen.mp4' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

      const completed = await refreshHttpVideoJob({
        upstreamId: 'luma_gen_001',
        result: { provider: 'luma', model: 'ray-2' }
      }, config, undefined, completedMock);

      expect(completed.status).toBe('completed');
    });
  });

  describe('MiniMax Hailuo', () => {
    it('creates video generation job', async () => {
      const config = createDefaultCreatorServicesConfig();
      config.video.minimax.apiKey = 'minimax_key_789';
      config.video.minimax.model = 'MiniMax-H3';

      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        expect(url).toBe('https://api.minimax.io/v1/video_generation');
        expect(init?.headers).toMatchObject({
          Authorization: 'Bearer minimax_key_789',
          'Content-Type': 'application/json'
        });
        const body = JSON.parse(String(init?.body)) as { prompt: string; model: string };
        expect(body.prompt).toBe('Cambodian traditional wedding procession');
        expect(body.model).toBe('MiniMax-H3');

        return new Response(JSON.stringify({
          task_id: 'mm_task_123',
          base_resp: { status_code: 0, status_msg: 'success' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const job = await createHttpVideoJob({
        prompt: 'Cambodian traditional wedding procession',
        provider: 'minimax',
        size: '1280x720',
        duration: 5
      }, config, undefined, fetchMock);

      expect(job.upstreamId).toBe('mm_task_123');
      expect(job.model).toBe('MiniMax-H3');
    });

    it('refreshes task status from MiniMax query endpoint', async () => {
      const config = createDefaultCreatorServicesConfig();
      config.video.minimax.apiKey = 'minimax_key_789';

      const successMock = vi.fn<typeof fetch>(async (input) => {
        expect(String(input)).toContain('/query/video_generation?task_id=mm_task_123');
        return new Response(JSON.stringify({
          task_id: 'mm_task_123',
          status: 'Success',
          file_id: 'file_001',
          download_url: 'https://cdn.minimax.io/output.mp4'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const finished = await refreshHttpVideoJob({
        upstreamId: 'mm_task_123',
        result: { provider: 'minimax', model: 'MiniMax-H3' }
      }, config, undefined, successMock);

      expect(finished.status).toBe('completed');
    });
  });

  describe('ComfyUI', () => {
    it('submits prompt workflow to local ComfyUI instance', async () => {
      const config = createDefaultCreatorServicesConfig();

      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        expect(String(input)).toBe('http://127.0.0.1:8188/prompt');
        const body = JSON.parse(String(init?.body)) as { prompt: Record<string, { class_type: string }> };
        expect(body.prompt['3']?.class_type).toBe('KSampler');
        expect(body.prompt['4']?.class_type).toBe('CheckpointLoaderSimple');

        return new Response(JSON.stringify({ prompt_id: 'prompt_comfy_999' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      });

      const job = await createHttpVideoJob({
        prompt: 'Local animated scene',
        provider: 'comfyui',
        size: '1280x720',
        duration: 5
      }, config, undefined, fetchMock);

      expect(job.upstreamId).toBe('prompt_comfy_999');
    });

    it('resolves output video from history', async () => {
      const config = createDefaultCreatorServicesConfig();

      const historyMock = vi.fn<typeof fetch>(async (input) => {
        expect(String(input)).toBe('http://127.0.0.1:8188/history/prompt_comfy_999');
        return new Response(JSON.stringify({
          prompt_comfy_999: {
            outputs: {
              '9': {
                videos: [{ filename: 'VishnuCreator_video_001.mp4', subfolder: '', type: 'output' }]
              }
            },
            status: { completed: true }
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const result = await refreshHttpVideoJob({
        upstreamId: 'prompt_comfy_999',
        result: { provider: 'comfyui', model: 'svd-workflow' }
      }, config, undefined, historyMock);

      expect(result.status).toBe('completed');
      expect(result.payload.download_url).toBe('http://127.0.0.1:8188/view?filename=VishnuCreator_video_001.mp4&subfolder=&type=output');
    });
  });
});
