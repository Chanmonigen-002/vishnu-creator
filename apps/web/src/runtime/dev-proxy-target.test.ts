import { describe, expect, it } from 'vitest';
import {
  buildDevProxyTarget,
  parseDevDaemonConfig,
  parseDevDaemonStartupError
} from './dev-proxy-target.js';

describe('Vite Runtime proxy target', () => {
  it('accepts only a loopback HTTP daemon with a non-empty token', () => {
    expect(parseDevDaemonConfig({
      address: '127.0.0.1:60764',
      token: 'secret'
    })).toEqual({
      baseUrl: 'http://127.0.0.1:60764',
      token: 'secret'
    });

    for (const address of [
      'localhost:60764',
      'https://127.0.0.1:60764',
      'http://127.0.0.2:60764',
      'http://127.0.0.1:60764/path'
    ]) {
      expect(() => parseDevDaemonConfig({ address, token: 'secret' })).toThrow();
    }
    expect(() => parseDevDaemonConfig({
      address: '127.0.0.1:60764',
      token: ''
    })).toThrow();
  });

  it('keeps runtime requests on the validated daemon origin', () => {
    expect(buildDevProxyTarget(
      'http://127.0.0.1:60764',
      '/.vishnucreator/runtime/healthz?full=1'
    ).toString()).toBe('http://127.0.0.1:60764/healthz?full=1');
  });

  it('rejects prefix collisions and network-path variants', () => {
    for (const incomingUrl of [
      '/.vishnucreator/runtimeevil',
      '/.vishnucreator/runtime//attacker.example/path',
      '/.vishnucreator/runtime/%2f%2fattacker.example/path',
      '/.vishnucreator/runtime/%5c%5cattacker.example/path',
      '/.vishnucreator/runtime/%00healthz',
      '/.vishnucreator/runtime/%'
    ]) {
      expect(() => buildDevProxyTarget(
        'http://127.0.0.1:60764',
        incomingUrl
      ), incomingUrl).toThrow();
    }
  });

  it('extracts structured daemon startup failures', () => {
    expect(parseDevDaemonStartupError([
      'build output',
      JSON.stringify({
        type: 'vishnucreator_daemon_bootstrap_error',
        code: 'CODEX_VERSION_CHECK_FAILED',
        message: 'Codex CLI 无法正常启动'
      })
    ].join('\n'))).toEqual({
      code: 'CODEX_VERSION_CHECK_FAILED',
      message: 'Codex CLI 无法正常启动'
    });
    expect(parseDevDaemonStartupError('plain stderr')).toBeUndefined();
  });
});
