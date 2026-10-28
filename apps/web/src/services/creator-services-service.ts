import type {
  CodexImageStatus,
  CodexProviderConfig,
  CreatorDubEngineMode,
  CreatorJobEstimate,
  CreatorServicesCapabilitiesResponse,
  CreatorServicesConfig,
  CreatorServicesConfigResponse,
  CreatorTtsPreviewRequest,
  CreatorTtsProvider,
  CreatorTtsVoicesResponse,
  ResynthesizeSegmentRequest,
  ResynthesizeSegmentResponse,
  VoiceLibraryItem,
  VoiceLibraryListResponse,
  SaveVoiceDesignRequest,
  DeleteVoiceDesignRequest,
  PreviewVoiceDesignRequest,
  PreviewVoiceDesignResponse,
  VoiceDesignRequest,
  VoiceDesignResponse,
  DubEngineRuntimeStatus,
  TimesyncReport
} from '@vishnucreator/protocol';
import type { RuntimeClient } from '../runtime/client.js';

type ClientLike = Pick<RuntimeClient, 'get' | 'patch' | 'delete' | 'rawRequest'>;

export type CreatorServicesSettingsService = Omit<ReturnType<typeof createCreatorServicesService>, 'getCodexImageStatus' | 'getCodexModelStatus' | 'getNetwork' | 'saveNetwork' | 'runDubEngineBenchmark' | 'estimateDubEngineJob' | 'resynthesizeSegment' | 'listVoiceDesigns' | 'saveVoiceDesign' | 'deleteVoiceDesign' | 'previewVoiceDesign' | 'designVoice' | 'listLlmModels' | 'getDubEngineStatus' | 'startDubEngine' | 'stopDubEngine' | 'getDubEngineTimesyncReport'> & {
  listLlmModels?: (input: { baseUrl: string; apiKey: string }) => Promise<{ models: string[] }>;
  getDubEngineStatus?: () => Promise<DubEngineRuntimeStatus>;
  startDubEngine?: () => Promise<DubEngineRuntimeStatus>;
  stopDubEngine?: () => Promise<DubEngineRuntimeStatus>;
  getDubEngineTimesyncReport?: (jobId: string) => Promise<TimesyncReport | null>;
  getCodexImageStatus?: () => Promise<CodexImageStatus>;
  getCodexModelStatus?: () => Promise<CodexProviderConfig>;
  getNetwork?: () => Promise<{ proxy: string }>;
  saveNetwork?: (network: { proxy: string }) => Promise<{ proxy: string }>;
  resynthesizeSegment?: (params: ResynthesizeSegmentRequest) => Promise<ResynthesizeSegmentResponse>;
  runDubEngineBenchmark?: () => Promise<{
    ok: boolean;
    benchmark: {
      asrTimeSeconds: number;
      translationTimeSeconds: number;
      ttsTimeSeconds: number;
      separationTimeSeconds: number;
      totalTimeSeconds: number;
      tier: string;
    };
  }>;
  estimateDubEngineJob?: (options: {
    durationSeconds?: number;
    mode?: 'local' | 'api-assist' | 'remote';
    benchmarkTotalSeconds?: number;
  }) => Promise<{ ok: boolean; estimate: CreatorJobEstimate }>;
  listVoiceDesigns: () => Promise<{ voices: VoiceLibraryItem[] }>;
  saveVoiceDesign: (request: SaveVoiceDesignRequest) => Promise<VoiceLibraryItem>;
  deleteVoiceDesign: (request: DeleteVoiceDesignRequest) => Promise<void>;
  previewVoiceDesign: (request: PreviewVoiceDesignRequest) => Promise<PreviewVoiceDesignResponse>;
  designVoice: (request: VoiceDesignRequest) => Promise<VoiceDesignResponse>;
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
    listLlmModels(input: { baseUrl: string; apiKey: string }): Promise<{ models: string[] }> {
      return client.rawRequest('/creator-services/llm/models', { method: 'POST', body: input }).then(response => response.json());
    },
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
    getDubEngineStatus(): Promise<DubEngineRuntimeStatus> {
      return client.get('/creator-services/dub-engine/status');
    },
    startDubEngine(): Promise<DubEngineRuntimeStatus> {
      return client.rawRequest('/creator-services/dub-engine/start', { method: 'POST' }).then(response => response.json());
    },
    stopDubEngine(): Promise<DubEngineRuntimeStatus> {
      return client.rawRequest('/creator-services/dub-engine/stop', { method: 'POST' }).then(response => response.json());
    },
    async getDubEngineTimesyncReport(jobId: string): Promise<TimesyncReport | null> {
      try {
        return await client.get<TimesyncReport>(`/creator-services/dub-engine/artifacts/${encodeURIComponent(jobId)}/timesync_report.json`);
      } catch {
        return null;
      }
    },
    testDubEngineConnection(config: {
      mode: CreatorDubEngineMode;
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
    runDubEngineBenchmark(): Promise<{
      ok: boolean;
      benchmark: {
        asrTimeSeconds: number;
        translationTimeSeconds: number;
        ttsTimeSeconds: number;
        separationTimeSeconds: number;
        totalTimeSeconds: number;
        tier: string;
      };
    }> {
      return client.rawRequest('/creator-services/dub-engine/benchmark', {
        method: 'POST'
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
    },
    estimateDubEngineJob(options: {
      durationSeconds?: number;
      mode?: 'local' | 'api-assist' | 'remote';
      benchmarkTotalSeconds?: number;
    }): Promise<{ ok: boolean; estimate: CreatorJobEstimate }> {
      return client.rawRequest('/creator-services/dub-engine/estimate', {
        method: 'POST',
        body: options
      }).then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          throw new Error(typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`);
        }
        return response.json();
      });
    },
    resynthesizeSegment(params: ResynthesizeSegmentRequest): Promise<ResynthesizeSegmentResponse> {
      return client.rawRequest('/creator-services/dub-engine/resynthesize-segment', {
        method: 'POST',
        body: params
      }).then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          throw new Error(typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`);
        }
        return response.json();
      });
    },
    listVoiceDesigns(): Promise<{ voices: VoiceLibraryItem[] }> {
      return client.get('/creator-services/tts/voices/list').then((r: unknown) => r as { voices: VoiceLibraryItem[] });
    },
    saveVoiceDesign(request: SaveVoiceDesignRequest): Promise<VoiceLibraryItem> {
      return client.rawRequest('/creator-services/tts/voices/save', {
        method: 'POST',
        body: request
      }).then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          throw new Error(typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`);
        }
        return response.json();
      });
    },
    deleteVoiceDesign(request: DeleteVoiceDesignRequest): Promise<void> {
      return client.rawRequest('/creator-services/tts/voices/delete', {
        method: 'POST',
        body: request
      }).then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          throw new Error(typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`);
        }
      });
    },
    previewVoiceDesign(request: PreviewVoiceDesignRequest): Promise<PreviewVoiceDesignResponse> {
      return client.rawRequest('/creator-services/tts/voices/preview', {
        method: 'POST',
        body: request
      }).then(async (response): Promise<PreviewVoiceDesignResponse> => {
        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          throw new Error(typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`);
        }
        const blob = await response.blob();
        return { blob };
      });
    },
    designVoice(request: VoiceDesignRequest): Promise<VoiceDesignResponse> {
      return client.rawRequest('/creator-services/tts/design-voice', {
        method: 'POST',
        body: request
      }).then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => undefined);
          throw new Error(typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`);
        }
        return response.json();
      });
    }
  };
}
