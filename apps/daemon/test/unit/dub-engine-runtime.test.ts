import { createDefaultCreatorServicesConfig, type CreatorServicesConfig } from '@vishnucreator/protocol';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DubEngineRuntime } from '../../src/dub-engine/runtime.js';
import { resolveDubEngineDirectory, type DubEngineService } from '../../src/dub-engine/service.js';

describe('DubEngineRuntime (T6.7)', () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

  function engineDir(installed: boolean): string {
    const root = mkdtempSync(join(tmpdir(), 'vishnu-engine-runtime-'));
    roots.push(root);
    mkdirSync(join(root, 'vishnu_dub'));
    writeFileSync(join(root, 'vishnu_dub', 'api.py'), '');
    if (installed) {
      const bin = join(root, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, process.platform === 'win32' ? 'python.exe' : 'python'), '');
    }
    return root;
  }

  function store(update: (config: CreatorServicesConfig) => void) {
    let config = createDefaultCreatorServicesConfig();
    update(config);
    return {
      read: vi.fn(async () => structuredClone(config)),
      write: vi.fn(async (next: CreatorServicesConfig) => { config = structuredClone(next); return structuredClone(config); })
    };
  }

  function fakeService(start: () => Promise<void>) {
    let healthy = false;
    return {
      start: vi.fn(async () => { await start(); healthy = true; }),
      stop: vi.fn(async () => { healthy = false; }),
      isHealthy: () => healthy
    } as unknown as DubEngineService & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  }

  it('reports not_installed without a venv and never starts a process', async () => {
    const dir = engineDir(false);
    const configStore = store(config => { config.dubEngine.enginePath = dir; });
    const create = vi.fn();
    const runtime = new DubEngineRuntime(configStore, create);

    expect(await runtime.status()).toMatchObject({ state: 'not_installed', engineDir: dir });
    expect(await runtime.start()).toMatchObject({ state: 'not_installed' });
    expect(create).not.toHaveBeenCalled();
  });

  it('starts an installed engine, persists enabled, and reports starting then ready', async () => {
    const dir = engineDir(true);
    const configStore = store(config => { config.dubEngine.enginePath = dir; config.dubEngine.enabled = false; });
    let finish!: () => void;
    const service = fakeService(() => new Promise<void>(resolve => { finish = resolve; }));
    const runtime = new DubEngineRuntime(configStore, () => service);

    expect(await runtime.status()).toMatchObject({ state: 'off', enabled: false });
    expect(await runtime.start()).toMatchObject({ state: 'starting', enabled: true });
    expect(configStore.write).toHaveBeenCalledWith(expect.objectContaining({ dubEngine: expect.objectContaining({ enabled: true }) }));
    expect(runtime.current()).toBe(service);

    finish();
    await runtime.settled();
    expect(await runtime.status()).toMatchObject({ state: 'ready' });

    expect(await runtime.stop()).toMatchObject({ state: 'off' });
    expect(service.stop).toHaveBeenCalledOnce();
    expect(runtime.current()).toBeUndefined();
  });

  it('reports a failed start with its message and can be started again', async () => {
    const dir = engineDir(true);
    const configStore = store(config => { config.dubEngine.enginePath = dir; });
    const failing = fakeService(async () => { throw new Error('Engine did not become healthy'); });
    const working = fakeService(async () => undefined);
    const create = vi.fn().mockReturnValueOnce(failing).mockReturnValueOnce(working);
    const runtime = new DubEngineRuntime(configStore, create);

    await runtime.start();
    await runtime.settled();
    expect(await runtime.status()).toMatchObject({ state: 'error', message: 'Engine did not become healthy' });

    await runtime.start();
    await runtime.settled();
    expect(await runtime.status()).toMatchObject({ state: 'ready' });
    expect(failing.stop).toHaveBeenCalled();
  });

  it('does not persist enabled for an autostart', async () => {
    const dir = engineDir(true);
    const configStore = store(config => { config.dubEngine.enginePath = dir; config.dubEngine.enabled = false; });
    const runtime = new DubEngineRuntime(configStore, () => fakeService(async () => undefined));

    await runtime.start({ persist: false });
    await runtime.settled();
    expect(configStore.write).not.toHaveBeenCalled();
  });
});

describe('resolveDubEngineDirectory', () => {
  it('finds services/dub-engine at the repository root when the daemon runs from apps/daemon', () => {
    const root = mkdtempSync(join(tmpdir(), 'vishnu-engine-root-'));
    try {
      mkdirSync(join(root, 'services', 'dub-engine', 'vishnu_dub'), { recursive: true });
      const moduleDir = join(root, 'apps', 'daemon', 'src', 'dub-engine');
      expect(resolveDubEngineDirectory({ enginePath: '' }, join(root, 'apps', 'daemon'), moduleDir))
        .toBe(join(root, 'services', 'dub-engine'));
      expect(resolveDubEngineDirectory({ enginePath: '' }, root, moduleDir)).toBe(join(root, 'services', 'dub-engine'));
      expect(resolveDubEngineDirectory({ enginePath: join(root, 'custom') }, root, moduleDir)).toBe(join(root, 'custom'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
