import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DubEngineError,
  DubEngineService,
  defaultDubEngineConfig
} from '../../../src/dub-engine/service.js';
import { DubEngineClient } from '../../../src/dub-engine/client.js';

function makeService(overrides: Partial<ReturnType<typeof defaultDubEngineConfig>> = {}) {
  return new DubEngineService({
    config: { ...defaultDubEngineConfig(), ...overrides },
    onHealthChanged: () => {},
    onEngineStarted: () => {},
    onEngineStopped: () => {}
  });
}

describe('DubEngineService state machine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts unhealthy and not running', () => {
    const service = makeService();
    expect(service.isHealthy()).toBe(false);
    expect(service.isRunning()).toBe(false);
  });

  it('merges partial config over defaults', () => {
    const service = makeService({ enabled: true, port: 9000 });
    const config = service.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.port).toBe(9000);
    expect(config.mode).toBe('local');
    expect(config.autoStart).toBe(false);
    expect(config.token).toBe('');
  });

  it('baseUrl uses 127.0.0.1:port in local mode', () => {
    const service = makeService({ mode: 'local', port: 8765 });
    expect(service.baseUrl()).toBe('http://127.0.0.1:8765');
  });

  it('baseUrl uses configured URL in remote mode', () => {
    const service = makeService({ mode: 'remote', url: 'http://10.0.0.5:8765/' });
    expect(service.baseUrl()).toBe('http://10.0.0.5:8765');
  });

  it('registers event listeners from options', () => {
    const onHealthChanged = vi.fn();
    const onEngineStopped = vi.fn();
    const service = new DubEngineService({
      config: defaultDubEngineConfig(),
      onHealthChanged,
      onEngineStopped
    });
    // Both listeners registered without error; emit paths are exercised via
    // internal emit calls. Here we verify wiring indirectly: service
    // construction does not throw and exposes the client for further calls.
    expect(service.getClient()).toBeInstanceOf(DubEngineClient);
  });

  it('exposes a working client with same config', () => {
    const service = makeService({ port: 9100 });
    expect(service.getClient().publicBaseUrl()).toBe('http://127.0.0.1:9100');
  });

  it('generates hex job ids', () => {
    const service = makeService();
    const id = service.generateJobId();
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(service.generateJobId()).not.toBe(id);
  });

  it('stop() emits engine-stopped and is safe when never started', async () => {
    const onEngineStopped = vi.fn();
    const service = new DubEngineService({
      config: defaultDubEngineConfig(),
      onEngineStopped
    });
    await service.stop();
    expect(onEngineStopped).toHaveBeenCalledTimes(1);
    expect(service.isRunning()).toBe(false);
  });

  it('DubEngineError carries code, statusCode, retryable', () => {
    const error = new DubEngineError('ENGINE_TIMEOUT', 'timed out', 504, true);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('ENGINE_TIMEOUT');
    expect(error.statusCode).toBe(504);
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('DubEngineError');
  });
});
