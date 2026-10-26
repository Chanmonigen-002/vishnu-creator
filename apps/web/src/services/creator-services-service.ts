import type {
  CodexImageStatus,
  CodexProviderConfig,
  CreatorServicesCapabilitiesResponse,
  CreatorServicesConfig,
  CreatorServicesConfigResponse,
  CreatorTtsPreviewRequest,
  CreatorTtsProvider,
  CreatorTtsVoicesResponse
} from '@vishnucreator/protocol';
import type { RuntimeClient } from '../runtime/client.js';

type ClientLike = Pick<RuntimeClient, 'get' | 'patch' | 'delete' | 'rawRequest'>;

export type CreatorServicesSettingsService = Omit<ReturnType<typeof createCreatorServicesService>, 'getCodexImageStatus' | 'getCodexModelStatus' | 'getNetwork' | 'saveNetwork'> & {
  getCodexImageStatus?: () => Promise<CodexImageStatus>;
  getCodexModelStatus?: () => Promise<CodexProviderConfig>;
  getNetwork?: () => Promise<{ proxy: string }>;
  saveNetwork?: (network: { proxy: string }) => Promise<{ proxy: string }>;
};

export function createCreatorServicesService(client: ClientLike) {
  return {
    getNetwork(): Promise<{ proxy: string }> { return client.get('/creator-services/network'); },
    saveNetwork(network: { proxy: string }): Promise<{ proxy: string }> { return client.patch('/creator-services/network', network); },
    getCodexModelStatus(): Promise<CodexProviderConfig> {
      return client.get('/creator-services/model/codex/status');
    },
    getCodexImageStatus(): Promise<CodexImageStatus> {
      return client.get('/creator-services/image/codex/status');
    },
    getCapabilities(): Promise<CreatorServicesCapabilitiesResponse> {
      return client.get('/creator-services/capabilities');
    },
    getConfig(): Promise<CreatorServicesConfigResponse> {
      return client.get('/creator-services/config');
    },
    saveConfig(config: CreatorServicesConfig): Promise<CreatorServicesConfigResponse> {
      return client.patch('/creator-services/config', config);
    },
    testTranscriptionConnection(config: CreatorServicesConfig['transcription']['funasr']): Promise<{ connected: boolean; model: string; models: string[]; capabilities: string[] }> { return client.rawRequest('/creator-services/transcription/test', { method: 'POST', body: config }).then(response => response.json()); },
    resetConfig(): Promise<CreatorServicesConfigResponse> {
      return client.delete('/creator-services/config');
    },
    getTtsVoices(
      provider: CreatorTtsProvider,
      model?: string
    ): Promise<CreatorTtsVoicesResponse> {
      const query = new URLSearchParams({ provider });
      if (model?.trim()) query.set('model', model.trim());
      return client.get(`/creator-services/tts/voices?${query.toString()}`);
    },
    testDubEngineConnection(config: {
      mode: 'local' | 'remote';
      url: string;
      port: number;
      token: string;
    }): Promise<{
      connected: boolean;
      version?: string;
      tier?: string;
      ramTotalGb?: number;
      ramFreeGb?: number;
      gpuName?: string | null;
    }> {
      return client.rawRequest('/creator-services/dub-engine/test', {
        method: 'POST',
        body: config
      }).then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          throw new Error(typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`);
        }
        return response.json();
      });
    },
    previewTtsVoice(request: CreatorTtsPreviewRequest): Promise<Response> {
      return client.rawRequest('/creator-services/tts/preview', {
        method: 'POST',
        body: request
      });
    }
  };
}
