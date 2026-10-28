/**
 * Runtime control of the dub engine (T6.7): the daemon used to create the
 * engine service only at startup and only when it was already enabled, so
 * turning it on later had no effect until a restart.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CreatorDubEngineConfig, CreatorServicesConfig, DubEngineRuntimeStatus } from '@vishnucreator/protocol';
import { DubEngineService, DubModelManager, resolveDubEngineDirectory, resolveDubEnginePython } from './service.js';

type ConfigStore = {
  read(): Promise<CreatorServicesConfig>;
  write(config: CreatorServicesConfig): Promise<CreatorServicesConfig>;
};

export class DubEngineRuntime {
  private service: DubEngineService | undefined;
  private defaultModelManager: DubModelManager | undefined;
  private starting: Promise<void> | undefined;
  private lastError: string | undefined;

  constructor(
    private readonly store: ConfigStore,
    private readonly createService: (config: CreatorDubEngineConfig) => DubEngineService =
      config => new DubEngineService({ config })
  ) {}

  /** The running service, for executors; undefined when the engine is off. */
  current(): DubEngineService | undefined {
    return this.service;
  }

  /** The model manager for listing, downloading, and verifying cached models. */
  getModelManager(): DubModelManager {
    if (this.service) return this.service.getModelManager();
    if (!this.defaultModelManager) {
      this.defaultModelManager = new DubModelManager();
    }
    return this.defaultModelManager;
  }

  async status(): Promise<DubEngineRuntimeStatus> {
    const config = (await this.store.read()).dubEngine;
    const local = config.mode === 'local';
    const engineDir = local ? resolveDubEngineDirectory(config) : '';
    const base = { enabled: config.enabled, mode: config.mode, engineDir };
    if (local && !isLocalEngineInstalled(config, engineDir)) {
      return { ...base, state: 'not_installed', message: `The local dub engine is not installed at ${engineDir}` };
    }
    if (this.starting !== undefined) return { ...base, state: 'starting' };
    if (this.service?.isHealthy()) return { ...base, state: 'ready' };
    if (this.lastError !== undefined) return { ...base, state: 'error', message: this.lastError };
    return { ...base, state: 'off' };
  }

  /** Turn the engine on (persisting `enabled`) and start it in the background. */
  async start(options: { persist?: boolean } = {}): Promise<DubEngineRuntimeStatus> {
    let config = await this.store.read();
    if (options.persist !== false && !config.dubEngine.enabled) {
      config = await this.store.write({ ...config, dubEngine: { ...config.dubEngine, enabled: true } });
    }
    const current = await this.status();
    if (current.state === 'not_installed' || current.state === 'ready' || current.state === 'starting') return current;

    await this.service?.stop().catch(() => undefined);
    const service = this.createService(config.dubEngine);
    this.service = service;
    this.lastError = undefined;
    this.starting = service.start().then(
      () => { this.starting = undefined; },
      error => {
        this.starting = undefined;
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    );
    return await this.status();
  }

  async stop(): Promise<DubEngineRuntimeStatus> {
    const service = this.service;
    this.service = undefined;
    this.lastError = undefined;
    await service?.stop().catch(() => undefined);
    return await this.status();
  }

  /** Resolves when an in-progress start finishes (for tests and shutdown). */
  async settled(): Promise<void> {
    await this.starting;
  }
}

function isLocalEngineInstalled(config: CreatorDubEngineConfig, engineDir: string): boolean {
  if (!existsSync(join(engineDir, 'vishnu_dub', 'api.py'))) return false;
  const python = resolveDubEnginePython(config, engineDir);
  // A bare `python` fallback means no engine venv was found.
  return python !== 'python' || config.pythonPath.length > 0;
}
