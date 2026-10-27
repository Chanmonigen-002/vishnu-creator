import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createProductionServerInput,
  parseRuntimeChannel,
  prepareSchedulerStartup,
  requiresPaidStartupProbe,
  resolveDaemonListenPort,
  resolveProductionRuntimePaths,
  resolveProductionServerEnvironment
} from '../../src/startup.js';

describe('daemon production startup', () => {
  it('listens on a random port unless VISHNUCREATOR_DAEMON_PORT sets a valid one', () => {
    expect(resolveDaemonListenPort({})).toBe(0);
    expect(resolveDaemonListenPort({ VISHNUCREATOR_DAEMON_PORT: '  ' })).toBe(0);
    expect(resolveDaemonListenPort({ VISHNUCREATOR_DAEMON_PORT: '19862' })).toBe(19862);
    for (const invalid of ['0', '65536', '18789.5', 'abc', '-1']) {
      expect(() => resolveDaemonListenPort({ VISHNUCREATOR_DAEMON_PORT: invalid })).toThrow('VISHNUCREATOR_DAEMON_PORT');
    }
  });

  it('requires explicit paid-test opt-in instead of charging for desktop readiness checks', () => {
    expect(requiresPaidStartupProbe({ VISHNUCREATOR_REQUIRE_CODEX_PROBE: '1' })).toBe(false);
    expect(requiresPaidStartupProbe({ VISHNUCREATOR_ENABLE_PAID_STARTUP_PROBE: '1' })).toBe(false);
    expect(requiresPaidStartupProbe({ VISHNUCREATOR_REQUIRE_CODEX_PROBE: '1', VISHNUCREATOR_ENABLE_PAID_STARTUP_PROBE: '1' })).toBe(true);
    expect(requiresPaidStartupProbe({ VISHNUCREATOR_REQUIRE_CODEX_PROBE: '1', VISHNUCREATOR_ENABLE_PAID_STARTUP_PROBE: '1', VISHNUCREATOR_CODEX_PROBE_VERIFIED: '1' })).toBe(false);
  });

  it('enables scheduler autostart and built-in agent tools for the production server', () => {
    const input = createProductionServerInput({
      token: 'runtime-token'
    });

    expect(input).toMatchObject({
      token: 'runtime-token',
      schedulerAutostart: true,
      agentToolsEnabled: true,
      persistentAppServerEnabled: true
    });
  });

  it('repairs schedule bindings before classifying sessions', () => {
    const steps: string[] = [];

    const result = prepareSchedulerStartup({
      coordinator: {
        ensureBindings() {
          steps.push('repair');
          return { scanned: 2, repaired: 1, failed: 0, unchanged: 1 };
        }
      },
      classifySessions() {
        steps.push('classify');
      }
    });

    expect(steps).toEqual(['repair', 'classify']);
    expect(result).toEqual({ scanned: 2, repaired: 1, failed: 0, unchanged: 1 });
  });

  it('maps isolated runtime paths from non-empty environment variables', () => {
    expect(resolveProductionServerEnvironment({
      VISHNUCREATOR_DATA_DIR: ' /tmp/vishnucreator-data ',
      VISHNUCREATOR_CODEX_BIN: ' /tmp/fake-codex ',
      CODEX_HOME: ' /tmp/vishnucreator-codex-home ',
      VISHNUCREATOR_LOCAL_CODEX_HOME: ' /tmp/local-codex-home ',
      VISHNUCREATOR_DEFAULT_CWD: ' /tmp/default-workspace ',
      VISHNUCREATOR_DEFAULT_PROJECT_ROOT: ' /tmp/Documents ',
      VISHNUCREATOR_YT_DLP_PATH: ' /tmp/yt-dlp '
    })).toEqual({
      gatewayOrigin: 'https://www.vishnu-creator.ai',
      dataDir: '/tmp/vishnucreator-data',
      codexBin: '/tmp/fake-codex',
      codexHome: '/tmp/vishnucreator-codex-home',
      localCodexHome: '/tmp/local-codex-home',
      defaultCwd: '/tmp/default-workspace',
      defaultProjectRoot: '/tmp/Documents',
      creatorYtDlpPath: '/tmp/yt-dlp'
    });

    expect(resolveProductionServerEnvironment({
      VISHNUCREATOR_DATA_DIR: ' ',
      VISHNUCREATOR_CODEX_BIN: '',
      CODEX_HOME: '\t',
      VISHNUCREATOR_LOCAL_CODEX_HOME: ' ',
      VISHNUCREATOR_DEFAULT_CWD: '\n',
      VISHNUCREATOR_DEFAULT_PROJECT_ROOT: ' ',
      VISHNUCREATOR_YT_DLP_PATH: ''
    })).toEqual({ gatewayOrigin: 'https://www.vishnu-creator.ai' });
  });

  it('uses the production gateway by default and allows an explicit local gateway', () => {
    expect(resolveProductionServerEnvironment({
      VISHNUCREATOR_GATEWAY_ORIGIN: ' '
    }).gatewayOrigin).toBe('https://www.vishnu-creator.ai');
    expect(resolveProductionServerEnvironment({
      VISHNUCREATOR_GATEWAY_ORIGIN: ' http://127.0.0.1:8787 '
    }).gatewayOrigin).toBe('http://127.0.0.1:8787');
  });

  it('prefers standard CODEX_HOME and keeps the legacy variable as a fallback', () => {
    expect(resolveProductionServerEnvironment({
      CODEX_HOME: '/tmp/standard-codex-home',
      VISHNUCREATOR_CODEX_HOME: '/tmp/legacy-codex-home'
    })).toMatchObject({
      codexHome: '/tmp/standard-codex-home'
    });
    expect(resolveProductionServerEnvironment({
      VISHNUCREATOR_CODEX_HOME: '/tmp/legacy-codex-home'
    })).toMatchObject({
      codexHome: '/tmp/legacy-codex-home'
    });
  });

  it('resolves the default VishnuCreator layout without a Codex home segment', () => {
    const appHome = resolve('/Users/demo', '.vishnucreator');
    expect(resolveProductionRuntimePaths({}, {
      homeDir: '/Users/demo'
    })).toEqual({
      appHome,
      dataDir: join(appHome, 'data'),
      configFile: join(appHome, 'config.toml'),
      credentialsFile: join(appHome, 'credentials.json'),
      runtimeDir: join(appHome, 'runtime'),
      creatorDir: join(appHome, 'creator'),
      codexHome: join(appHome, 'runtime', 'codex')
    });
  });

  it('resolves an isolated development layout', () => {
    const appHome = resolve('/Users/demo', '.vishnucreator', 'development');
    expect(resolveProductionRuntimePaths({}, {
      homeDir: '/Users/demo',
      runtimeChannel: 'development'
    })).toEqual({
      appHome,
      dataDir: join(appHome, 'data'),
      configFile: join(appHome, 'config.toml'),
      credentialsFile: join(appHome, 'credentials.json'),
      runtimeDir: join(appHome, 'runtime'),
      creatorDir: join(appHome, 'creator'),
      codexHome: join(appHome, 'runtime', 'codex')
    });
  });

  it('validates the runtime channel', () => {
    expect(parseRuntimeChannel(undefined)).toBe('production');
    expect(parseRuntimeChannel(' production ')).toBe('production');
    expect(parseRuntimeChannel(' development ')).toBe('development');
    expect(() => parseRuntimeChannel('preview')).toThrow(
      /Unsupported VishnuCreator Runtime channel/
    );
  });

  it('keeps isolated test configuration next to an explicit data directory', () => {
    const appHome = resolve('/tmp/vishnucreator-e2e');
    const dataDir = resolve('/tmp/vishnucreator-e2e/runtime');
    expect(resolveProductionRuntimePaths({
      dataDir: '/tmp/vishnucreator-e2e/runtime'
    })).toMatchObject({
      appHome,
      dataDir,
      configFile: join(appHome, 'config.toml'),
      credentialsFile: join(appHome, 'credentials.json'),
      codexHome: join(dataDir, 'codex')
    });
  });
});
