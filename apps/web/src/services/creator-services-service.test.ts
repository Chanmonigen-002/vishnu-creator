import { createDefaultCreatorServicesConfig } from '@vishnucreator/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createCreatorServicesService } from './creator-services-service.js';

describe('creator services service', () => {
  it('uses the authenticated Runtime configuration endpoints', async () => {
    const config = createDefaultCreatorServicesConfig();
    const get = vi.fn();
    const patch = vi.fn();
    const remove = vi.fn();
    const rawRequest = vi.fn(async () => new Response(Buffer.from('preview')));
    const client = {
      get<T>(_path: string): Promise<T> {
        get(_path);
        return Promise.resolve((_path === '/creator-services/capabilities'
          ? {
              platform: 'darwin',
              arch: 'arm64',
              transcription: { providers: [] }
            }
          : { config }) as T);
      },
      patch<T>(_path: string, _body: unknown): Promise<T> {
        patch(_path, _body);
        return Promise.resolve({ config } as T);
      },
      delete<T>(_path: string): Promise<T> {
        remove(_path);
        return Promise.resolve({ config } as T);
      },
      rawRequest
    };
    const originalGet = client.get.bind(client);
    client.get = <T>(_path: string): Promise<T> => {
      if (_path.startsWith('/creator-services/tts/voices?')) {
        get(_path);
        return Promise.resolve({
          provider: 'aliyun',
          model: 'qwen3-tts-flash',
          voices: []
        } as T);
      }
      return originalGet(_path);
    };
    const service = createCreatorServicesService(client);

    await service.getCapabilities();
    await service.getConfig();
    await service.saveConfig(config);
    await service.resetConfig();
    await service.getTtsVoices('aliyun', 'qwen3-tts-flash');
    await service.getCodexImageStatus();
    await service.getCodexModelStatus();
    await service.previewTtsVoice({
      provider: 'aliyun',
      model: 'qwen3-tts-flash',
      voiceId: 'Cherry'
    });

    expect(get).toHaveBeenNthCalledWith(1, '/creator-services/capabilities');
    expect(get).toHaveBeenNthCalledWith(2, '/creator-services/config');
    expect(patch).toHaveBeenCalledWith('/creator-services/config', config);
    expect(remove).toHaveBeenCalledWith('/creator-services/config');
    expect(get).toHaveBeenNthCalledWith(
      3,
      '/creator-services/tts/voices?provider=aliyun&model=qwen3-tts-flash'
    );
    expect(get).toHaveBeenNthCalledWith(4, '/creator-services/image/codex/status');
    expect(get).toHaveBeenNthCalledWith(5, '/creator-services/model/codex/status');
    expect(rawRequest).toHaveBeenCalledWith('/creator-services/tts/preview', {
      method: 'POST',
      body: {
        provider: 'aliyun',
        model: 'qwen3-tts-flash',
        voiceId: 'Cherry'
      }
    });
  });

  it('POSTs dub engine connection test to the Runtime', async () => {
    const rawRequest = vi.fn(async (_path: string, init: { method: string; body: unknown }) => {
      if (_path === '/creator-services/dub-engine/test') {
        return Promise.resolve(new Response(JSON.stringify({
          connected: true,
          version: '0.1.0',
          tier: 'T1',
          ramTotalGb: 31.8,
          ramFreeGb: 17.7,
          gpuName: null
        })));
      }
      throw new Error(`unexpected path ${_path}`);
    });
    const service = createCreatorServicesService({
      get: async () => { throw new Error('unexpected get'); },
      patch: async () => { throw new Error('unexpected patch'); },
      delete: async () => { throw new Error('unexpected delete'); },
      rawRequest
    });
    const result = await service.testDubEngineConnection({
      mode: 'local',
      url: 'http://127.0.0.1:8765',
      port: 8765,
      token: ''
    });
    expect(rawRequest).toHaveBeenCalledWith('/creator-services/dub-engine/test', {
      method: 'POST',
      body: { mode: 'local', url: 'http://127.0.0.1:8765', port: 8765, token: '' }
    });
    expect(result).toEqual({
      connected: true,
      version: '0.1.0',
      tier: 'T1',
      ramTotalGb: 31.8,
      ramFreeGb: 17.7,
      gpuName: null
    });
  });
});
