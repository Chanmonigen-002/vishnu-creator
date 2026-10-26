/**
 * Vishnu Dub Engine — Service layer for local/remote engine lifecycle.
 *
 * Two modes:
 *   - 'local': spawns `services/dub-engine/.venv/Scripts/python.exe -m vishnu_dub.api`
 *     on 127.0.0.1:8765, waits for health, supervises with restart backoff.
 *   - 'remote': connects to an existing engine at `config.url` + bearer token.
 *
 * Independent implementation — no ZastTranslate code copied.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DubEngineClient } from './client.js';
import {
  DubEngineConfig,
  DubEngineError,
  DubEngineHealth,
  DubHardwareProfile,
  DubJobProgress,
  DubJobRequest,
  DubJobResponse,
  DubJobStatus,
  DubJobStatusResponse,
  DubBenchmarkResponse,
  defaultDubEngineConfig,
} from './client.js';

const DEFAULT_HEALTH_WAIT_MS = 30_000;
const DEFAULT_HEALTH_POLL_MS = 500;
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_BASE_MS = 1_000;

export type DubEngineServiceEvents = {
  'health-changed': (healthy: boolean) => void;
  'job-progress': (jobId: string, progress: DubJobProgress) => void;
  'job-completed': (jobId: string) => void;
  'job-failed': (jobId: string, error: string) => void;
  'engine-started': () => void;
  'engine-stopped': () => void;
  'engine-crashed': (error: Error) => void;
};

export type DubEngineServiceOptions = {
  config: DubEngineConfig;
  onHealthChanged?: (healthy: boolean) => void;
  onJobProgress?: (jobId: string, progress: DubJobProgress) => void;
  onJobCompleted?: (jobId: string) => void;
  onJobFailed?: (jobId: string, error: string) => void;
  onEngineStarted?: () => void;
  onEngineStopped?: () => void;
  onEngineCrashed?: (error: Error) => void;
};

export class DubEngineService {
  private config: DubEngineConfig;
  private client: DubEngineClient;
  private child: ChildProcess | null = null;
  private restartAttempts = 0;
  private isStopping = false;
  private healthInterval: NodeJS.Timeout | null = null;
  private lastHealthy = false;
  private eventListeners: Map<keyof DubEngineServiceEvents, Set<Function>> = new Map();

  constructor(options: DubEngineServiceOptions) {
    this.config = { ...defaultDubEngineConfig(), ...options.config };
    this.client = new DubEngineClient(this.config);

    if (options.onHealthChanged) this.on('health-changed', options.onHealthChanged);
    if (options.onJobProgress) this.on('job-progress', options.onJobProgress);
    if (options.onJobCompleted) this.on('job-completed', options.onJobCompleted);
    if (options.onJobFailed) this.on('job-failed', options.onJobFailed);
    if (options.onEngineStarted) this.on('engine-started', options.onEngineStarted);
    if (options.onEngineStopped) this.on('engine-stopped', options.onEngineStopped);
    if (options.onEngineCrashed) this.on('engine-crashed', options.onEngineCrashed);
  }

  getConfig(): DubEngineConfig {
    return { ...this.config };
  }

  baseUrl(): string {
    return this.client.publicBaseUrl();
  }

  getClient(): DubEngineClient {
    return this.client;
  }

  isHealthy(): boolean {
    return this.lastHealthy;
  }

  isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }

  private on<K extends keyof DubEngineServiceEvents>(
    event: K,
    listener: DubEngineServiceEvents[K]
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener as Function);
  }

  private off<K extends keyof DubEngineServiceEvents>(
    event: K,
    listener: DubEngineServiceEvents[K]
  ): void {
    this.eventListeners.get(event)?.delete(listener as Function);
  }

  private emit<K extends keyof DubEngineServiceEvents>(
    event: K,
    ...args: Parameters<DubEngineServiceEvents[K]>
  ): void {
    this.eventListeners.get(event)?.forEach(listener => {
      try {
        (listener as Function)(...args);
      } catch {
        // Listener errors must not crash the service
      }
    });
  }

  async start(): Promise<void> {
    if (this.config.mode === 'local') {
      await this.startLocal();
    } else {
      await this.startRemote();
    }

    // Begin health monitoring
    this.startHealthMonitoring();
  }

  private async startLocal(): Promise<void> {
    if (this.isRunning()) return;

    const pythonPath = this.config.pythonPath || 'python';
    const engineDir = join(process.cwd(), 'services', 'dub-engine');

    this.child = spawn(pythonPath, ['-m', 'vishnu_dub.api'], {
      cwd: engineDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VISHNU_DUB_ENGINE: '1',
      },
    });

    this.child.stdout?.on('data', chunk => {
      // Engine stdout logs — could be parsed for progress in future
    });

    this.child.stderr?.on('data', chunk => {
      // Engine stderr logs
    });

    this.child.on('exit', (code, signal) => {
      this.child = null;
      this.lastHealthy = false;
      this.emit('engine-stopped');

      if (this.isStopping) return;

      if (code !== 0 && code !== null) {
        const error = new Error(
          `Engine process exited with code ${code ?? 'unknown'}${
            signal ? ` (signal: ${signal})` : ''
          }`
        );
        this.emit('engine-crashed', error);

        if (this.restartAttempts < MAX_RESTART_ATTEMPTS) {
          this.restartAttempts++;
          const backoffMs = RESTART_BASE_MS * 2 ** (this.restartAttempts - 1);
          setTimeout(() => {
            this.startLocal().catch(() => {
              // Restart failures are handled by health monitoring
            });
          }, backoffMs);
        } else {
          this.emit('engine-crashed', error);
        }
      }
    });

    // Wait for health
    await this.waitForHealth();
    this.emit('engine-started');
  }

  private async startRemote(): Promise<void> {
    await this.waitForHealth();
  }

  private async waitForHealth(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < DEFAULT_HEALTH_WAIT_MS) {
      try {
        const health = await this.client.getHealth();
        if (health.status === 'ok') {
          this.lastHealthy = true;
          this.emit('health-changed', true);
          return;
        }
      } catch {
        // Engine not ready yet, keep polling
      }
      await sleep(DEFAULT_HEALTH_POLL_MS);
    }

    this.lastHealthy = false;
    this.emit('health-changed', false);
    throw new DubEngineError(
      'ENGINE_HEALTH_TIMEOUT',
      `Engine did not become healthy at ${this.baseUrl()} within ${DEFAULT_HEALTH_WAIT_MS}ms`,
      504,
      false
    );
  }

  private startHealthMonitoring(): void {
    if (this.healthInterval) clearInterval(this.healthInterval);
    this.healthInterval = setInterval(async () => {
      try {
        const health = await this.client.getHealth();
        const healthy = health.status === 'ok';
        if (healthy !== this.lastHealthy) {
          this.lastHealthy = healthy;
          this.emit('health-changed', healthy);
        }
      } catch {
        if (this.lastHealthy) {
          this.lastHealthy = false;
          this.emit('health-changed', false);
        }
      }
    }, 10_000);
    this.healthInterval.unref?.();
  }

  private stopHealthMonitoring(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  async stop(): Promise<void> {
    this.isStopping = true;
    this.stopHealthMonitoring();

    if (this.child) {
      this.child.kill('SIGTERM');
      // Give it a moment to shut down gracefully
      await new Promise(resolve => setTimeout(resolve, 1_000));
      if (!this.child.killed) {
        this.child.kill('SIGKILL');
      }
      this.child = null;
    }

    this.emit('engine-stopped');
  }

  async getHardware(): Promise<DubHardwareProfile> {
    return this.client.getHardware();
  }

  async createDubJob(request: DubJobRequest): Promise<DubJobResponse> {
    return this.client.createDubJob(request);
  }

  async getJobStatus(jobId: string): Promise<DubJobStatusResponse> {
    return this.client.getJobStatus(jobId);
  }

  async *watchJobProgress(
    jobId: string
  ): AsyncGenerator<DubJobProgress, void, unknown> {
    for await (const progress of this.client.jobProgressStream(jobId)) {
      this.emit('job-progress', jobId, progress);
      yield progress;
      if (progress.percent >= 100) {
        this.emit('job-completed', jobId);
        return;
      }
    }
  }

  async runBenchmark(
    durationSeconds: number,
    ttsSentences: number
  ): Promise<DubBenchmarkResponse> {
    return this.client.runBenchmark(durationSeconds, ttsSentences);
  }

  async downloadResult(jobId: string, signal?: AbortSignal): Promise<Buffer> {
    return this.client.downloadResult(jobId, signal);
  }

  generateJobId(): string {
    return this.client.generateJobId();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createDubEngineService(options: DubEngineServiceOptions): DubEngineService {
  return new DubEngineService(options);
}
