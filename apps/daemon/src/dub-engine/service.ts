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

import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  config: Partial<DubEngineConfig>;
  onHealthChanged?: (healthy: boolean) => void;
  onJobProgress?: (jobId: string, progress: DubJobProgress) => void;
  onJobCompleted?: (jobId: string) => void;
  onJobFailed?: (jobId: string, error: string) => void;
  onEngineStarted?: () => void;
  onEngineStopped?: () => void;
  onEngineCrashed?: (error: Error) => void;
};

export type {
  DubJobRequest,
  DubJobStatus,
  DubJobProgress,
  DubJobResponse,
  DubJobStatusResponse,
  DubHardwareProfile,
  DubBenchmarkResponse,
  DubEngineHealth,
};
export { DubEngineError, DubEngineClient, defaultDubEngineConfig };

/**
 * Engine folder: the configured path, else `services/dub-engine` under the
 * working directory, else under the repository root. The dev daemon runs from
 * `apps/daemon`, so the working directory alone never found it.
 */
export function resolveDubEngineDirectory(
  config: Pick<DubEngineConfig, 'enginePath'>,
  cwd: string = process.cwd(),
  moduleDir: string = dirname(fileURLToPath(import.meta.url))
): string {
  if (config.enginePath) return resolve(config.enginePath);
  const candidates = [
    join(cwd, 'services', 'dub-engine'),
    // apps/daemon/{src,dist}/dub-engine -> repository root
    resolve(moduleDir, '..', '..', '..', '..', 'services', 'dub-engine')
  ];
  return candidates.find(candidate => existsSync(join(candidate, 'vishnu_dub'))) ?? candidates[0]!;
}

/** Python for the local engine: configured, else the engine's own venv, else `python`. */
export function resolveDubEnginePython(config: Pick<DubEngineConfig, 'pythonPath'>, engineDir: string): string {
  if (config.pythonPath) return config.pythonPath;
  const venvPython = join(
    engineDir,
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python'
  );
  return existsSync(venvPython) ? venvPython : 'python';
}

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
    if (this.config.mode === 'remote') {
      await this.startRemote();
    } else {
      await this.startLocal();
    }

    // Begin health monitoring
    this.startHealthMonitoring();
  }

  private async startLocal(): Promise<void> {
    if (this.isRunning()) return;
    this.isStopping = false;
    // An engine already serving this port (e.g. `pnpm dub:engine`) is reused.
    if (await this.client.getHealth().then(health => health.status === 'ok', () => false)) {
      this.lastHealthy = true;
      this.emit('health-changed', true);
      return;
    }

    const engineDir = resolveDubEngineDirectory(this.config);
    const pythonPath = resolveDubEnginePython(this.config, engineDir);

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
      if (process.platform === 'win32' && this.child.pid !== undefined) {
        // The venv python.exe is a launcher that starts the real interpreter as
        // a child; killing only the launcher leaves the engine on its port.
        spawnSync('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        this.child.kill('SIGTERM');
        // Give it a moment to shut down gracefully
        await new Promise(resolve => setTimeout(resolve, 1_000));
        if (!this.child.killed) {
          this.child.kill('SIGKILL');
        }
      }
      this.child = null;
    }
    this.lastHealthy = false;

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

  async downloadArtifact(jobId: string, filename: string, signal?: AbortSignal): Promise<Buffer> {
    return this.client.downloadArtifact(jobId, filename, signal);
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
