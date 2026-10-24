import {
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { vishnuCreatorLanguages } from '@vishnucreator/protocol';
import {
  readVishnuCreatorConfig,
  resolveDesktopConfig,
  resolveVishnuCreatorPaths,
  resolveStorageSettings,
  resolveUiSettings,
  updateVishnuCreatorConfig,
  updateVishnuCreatorStorageSettings,
  updateVishnuCreatorUiSettings
} from './index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const path of tempDirs.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('VishnuCreator config', () => {
  it.each(vishnuCreatorLanguages)('preserves %s across config writes and reads', language => {
    const root = mkdtempSync(join(tmpdir(), 'vishnucreator-config-'));
    tempDirs.push(root);
    const path = join(root, 'config.toml');
    updateVishnuCreatorUiSettings(path, { language });
    expect(resolveUiSettings(readVishnuCreatorConfig(path)).language).toBe(language);
  });

  it('resolves the product-owned directory layout', () => {
    const home = '/Users/demo';
    const root = resolve(join(home, '.vishnucreator'));
    expect(resolveVishnuCreatorPaths({ homeDir: home, env: {} })).toMatchObject({
      root,
      configFile: join(root, 'config.toml'),
      dataDir: join(root, 'data'),
      codexHome: join(root, 'runtime', 'codex'),
      creatorCodexHome: join(root, 'runtime', 'creator-codex')
    });
  });

  it('isolates development state below the product directory', () => {
    const home = '/Users/demo';
    const root = resolve(join(home, '.vishnucreator', 'development'));
    expect(resolveVishnuCreatorPaths({
      homeDir: home,
      env: {},
      runtimeChannel: 'development'
    })).toMatchObject({
      root,
      configFile: join(root, 'config.toml'),
      dataDir: join(root, 'data'),
      codexHome: join(root, 'runtime', 'codex')
    });
  });

  it('keeps an explicit product home authoritative in development', () => {
    const explicitHome = '/tmp/vishnucreator-explicit';
    expect(resolveVishnuCreatorPaths({
      homeDir: '/Users/demo',
      env: { VISHNUCREATOR_HOME: explicitHome },
      runtimeChannel: 'development'
    }).root).toBe(resolve(explicitHome));
  });

  it('creates VishnuCreator settings from an empty product directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'vishnucreator-config-'));
    tempDirs.push(root);
    const path = join(root, 'config.toml');

    expect(resolveUiSettings(readVishnuCreatorConfig(path)).accentColor).toBe('red');

    updateVishnuCreatorUiSettings(path, { colorMode: 'light', language: 'sv-SE' });

    expect(resolveUiSettings(readVishnuCreatorConfig(path)).colorMode).toBe('light');
    expect(resolveUiSettings(readVishnuCreatorConfig(path)).language).toBe('sv-SE');
  });

  it('persists anonymous telemetry preferences and the install identifier', () => {
    const root = mkdtempSync(join(tmpdir(), 'vishnucreator-config-'));
    tempDirs.push(root);
    const path = join(root, 'config.toml');
    const telemetryInstallId = '123e4567-e89b-42d3-a456-426614174000';

    updateVishnuCreatorConfig(path, document => ({
      ...document,
      desktop: {
        closeBehavior: 'hide',
        notificationsEnabled: true,
        telemetryEnabled: false,
        telemetryInstallId
      }
    }));

    const source = readFileSync(path, 'utf8');
    expect(source).toContain('telemetry_enabled = false');
    expect(source).toContain(`telemetry_install_id = "${telemetryInstallId}"`);
    expect(resolveDesktopConfig(readVishnuCreatorConfig(path))).toMatchObject({
      telemetryEnabled: false,
      telemetryInstallId
    });
  });

  it('persists project and completed output locations', () => {
    const root = mkdtempSync(join(tmpdir(), 'vishnucreator-config-'));
    tempDirs.push(root);
    const path = join(root, 'config.toml');
    const defaults = {
      defaultProjectRoot: join(root, 'VishnuCreator'),
      outputRoot: join(root, 'VishnuCreator', 'Exports')
    };

    expect(resolveStorageSettings(readVishnuCreatorConfig(path), defaults)).toEqual(defaults);
    updateVishnuCreatorStorageSettings(path, {
      defaultProjectRoot: join(root, 'Projects'),
      outputRoot: join(root, 'Outputs')
    });

    expect(resolveStorageSettings(readVishnuCreatorConfig(path), defaults)).toEqual({
      defaultProjectRoot: join(root, 'Projects'),
      outputRoot: join(root, 'Outputs')
    });
    expect(readFileSync(path, 'utf8')).toContain('[storage]');
  });
});
