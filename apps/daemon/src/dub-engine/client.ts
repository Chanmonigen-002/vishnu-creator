/**
 * Vishnu Dub Engine — Typed HTTP client for the local/remote dub engine.
 *
 * Talks to the FastAPI engine (services/dub-engine/vishnu_dub/api.py) on
 * port 8765 by default. Supports local mode (spawned by the daemon) and
 * remote mode (connecting to an engine URL + token). All routes are
 * loopback-only; remote mode requires an explicit URL + bearer token.
 *
 * Independent implementation — no ZastTranslate code copied.
 */

import { createHash } from 'node:crypto';

export type DubEngineProvider = 'local-engine' | 'remote-engine';

export type DubEngineConfig = {
  enabled: boolean;
  mode: 'local' | 'remote';
  url: string;
  port: number;
  token: string;
  enginePath: string;
  pythonPath: string;
  autoStart: boolean;
};

export type DubJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type DubJobProgress = {
  phase: string;
  percent: number;
  message?: string;
};

export type DubJobRequest = {
  sourceUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
  ttsProvider: string;
  ttsVoiceId?: string;
  ttsStyle?: string;
  ttsSpeed: number;
  separateVocals: boolean;
  bilingualSubtitles: boolean;
  composeVideo: boolean;
};

export type DubJobResponse = {
  jobId: string;
  status: DubJobStatus;
  message: string;
};

export type DubJobStatusResponse = {
  jobId: string;
  status: DubJobStatus;
  progress: DubJobProgress | null;
  resultUrl: string | null;
  error: string | null;
};

export type DubHardwareProfile = {
  cpuCores: number;
  cpuThreads: number;
  cpuAvx2: boolean;
  cpuAvx512: boolean;
  ramTotalGb: number;
  ramFreeGb: number;
  gpuName: string | null;
  gpuVramGb: number | null;
  cudaVersion: string | null;
  gpuComputeCapability: string | null;
  diskFreeGb: Record<string, number>;
  tier: string;
  tierDescription: string;
};

export type DubBenchmarkResponse = {
  asrTimeSeconds: number;
  translationTimeSeconds: number;
  ttsTimeSeconds: number;
  separationTimeSeconds: number;
  totalTimeSeconds: number;
  tier: string;
};

export type DubEngineHealth = {
  status: string;
  version: string;
};

export class DubEngineError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;

  constructor(code: string, message: string, statusCode: number, retryable = false) {
    super(message);
    this.name = 'DubEngineError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

const DEFAULT_PORT = 8765;
const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

function baseUrlFromConfig(config: DubEngineConfig): string {
  if (config.mode === 'remote' && config.url) return config.url.replace(/\/$/, '');
  return `http://127.0.0.1:${config.port ?? DEFAULT_PORT}`;
}

function headersFor(config: DubEngineConfig): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.token) headers['Authorization'] = `*** ${config.token}`;
  return headers;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseErrorBody(body: unknown): { code?: string; message?: string } {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    const code =
      typeof record.code === 'string' ? record.code : undefined;
    const message =
      typeof record.message === 'string' ? record.message : undefined;
    return { code, message };
  }
  return {};
}

function isRetriableError(error: DubEngineError): boolean {
  return error.retryable || error.statusCode >= 500 || error.statusCode === 429;
}

export class DubEngineClient {
  private config: DubEngineConfig;

  constructor(config: Partial<DubEngineConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      mode: config.mode ?? 'local',
      url: config.url ?? DEFAULT_BASE_URL,
      port: config.port ?? DEFAULT_PORT,
      token: config.token ?? '',
      enginePath: config.enginePath ?? '',
      pythonPath: config.pythonPath ?? '',
      autoStart: config.autoStart ?? false,
    };
  }

  getConfig(): DubEngineConfig {
    return { ...this.config };
  }

  updateConfig(patch: Partial<DubEngineConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  publicBaseUrl(): string {
    return this.baseUrl();
  }

  private baseUrl(): string {
    return baseUrlFromConfig(this.config);
  }

  private async fetchWithRetry(
    path: string,
    init: RequestInit,
    retriesLeft: number = MAX_RETRIES
  ): Promise<Response> {
    const url = `${this.baseUrl()}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new DubEngineError(
          'ENGINE_TIMEOUT',
          `Engine request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`,
          504,
          true
        );
      }
      if (retriesLeft > 0 && error instanceof TypeError) {
        // Connection refused — engine may be starting up, retry after backoff
        await sleep(RETRY_BASE_MS * (MAX_RETRIES - retriesLeft + 1));
        return this.fetchWithRetry(path, init, retriesLeft - 1);
      }
      throw new DubEngineError(
        'ENGINE_UNREACHABLE',
        error instanceof Error ? error.message : 'Engine request failed',
        502,
        true
      );
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retriesLeft: number = MAX_RETRIES
  ): Promise<T> {
    const response = await this.fetchWithRetry(path, {
      method,
      headers: headersFor(this.config),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const statusCode = response.status;
      let errorBody: { code?: string; message?: string } = {};
      try {
        errorBody = (await response.json()) as { code?: string; message?: string };
      } catch {
        // Ignore JSON parse errors — use status text as message
      }

      const retryable =
        statusCode >= 500 || statusCode === 429 || statusCode === 408;

      if (retriesLeft > 0 && retryable) {
        await sleep(RETRY_BASE_MS * (MAX_RETRIES - retriesLeft + 1));
        return this.request(method, path, body, retriesLeft - 1);
      }

      throw new DubEngineError(
        errorBody.code || `ENGINE_HTTP_${statusCode}`,
        errorBody.message || `Engine request failed with status ${statusCode}`,
        statusCode,
        retryable
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async getHealth(): Promise<DubEngineHealth> {
    return this.request<DubEngineHealth>('GET', '/health');
  }

  async getHardware(): Promise<DubHardwareProfile> {
    return this.request<DubHardwareProfile>('GET', '/v1/hardware');
  }

  async createDubJob(request: DubJobRequest): Promise<DubJobResponse> {
    return this.request<DubJobResponse>('POST', '/v1/dub', request);
  }

  async getJobStatus(jobId: string): Promise<DubJobStatusResponse> {
    return this.request<DubJobStatusResponse>('GET', `/v1/dub/${encodeURIComponent(jobId)}`);
  }

  async *jobProgressStream(
    jobId: string,
    onProgress?: (progress: DubJobProgress) => void
  ): AsyncGenerator<DubJobProgress, void, unknown> {
    const url = `${this.baseUrl()}/v1/dub/${encodeURIComponent(jobId)}/progress`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: headersFor(this.config),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new DubEngineError('ENGINE_TIMEOUT', 'Progress stream timed out', 504, true);
      }
      throw new DubEngineError(
        'ENGINE_UNREACHABLE',
        error instanceof Error ? error.message : 'Progress stream failed',
        502,
        true
      );
    }

    clearTimeout(timeoutId);

    if (!response.ok || !response.body) {
      const statusCode = response.status;
      throw new DubEngineError(
        `ENGINE_HTTP_${statusCode}`,
        `Progress stream failed with status ${statusCode}`,
        statusCode,
        statusCode >= 500
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice('data: '.length).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as DubJobProgress;
            onProgress?.(parsed);
            yield parsed;
            if (parsed.percent >= 100) return;
          } catch {
            // Ignore malformed progress lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async runBenchmark(
    durationSeconds: number,
    ttsSentences: number
  ): Promise<DubBenchmarkResponse> {
    return this.request<DubBenchmarkResponse>('POST', '/v1/benchmark', {
      durationSeconds,
      ttsSentences,
    });
  }

  async downloadResult(jobId: string, signal?: AbortSignal): Promise<Buffer> {
    const controller = new AbortController();
    const linkedSignal = signal
      ? AbortSignal.any([controller.signal, signal])
      : controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${this.baseUrl()}/v1/dub/${encodeURIComponent(jobId)}/download`,
        { headers: headersFor(this.config), signal: linkedSignal }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new DubEngineError(
          `ENGINE_HTTP_${response.status}`,
          `Download failed with status ${response.status}`,
          response.status,
          response.status >= 500
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DubEngineError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new DubEngineError('ENGINE_TIMEOUT', 'Download timed out', 504, true);
      }
      throw new DubEngineError(
        'ENGINE_DOWNLOAD_FAILED',
        error instanceof Error ? error.message : 'Download failed',
        502,
        true
      );
    }
  }

  generateJobId(): string {
    return createHash('sha256').update(`${Date.now()}:${crypto.randomUUID()}`).digest('hex').slice(0, 12);
  }
}

export function createDubEngineClient(config?: Partial<DubEngineConfig>): DubEngineClient {
  return new DubEngineClient(config);
}

export function defaultDubEngineConfig(): DubEngineConfig {
  return {
    enabled: false,
    mode: 'local',
    url: DEFAULT_BASE_URL,
    port: DEFAULT_PORT,
    token: '',
    enginePath: '',
    pythonPath: '',
    autoStart: false,
  };
}

export function isDubEngineError(error: unknown): error is DubEngineError {
  return error instanceof DubEngineError;
}

export function dubEngineErrorCode(error: unknown): string {
  if (isDubEngineError(error)) return error.code;
  return 'ENGINE_UNKNOWN_ERROR';
}
