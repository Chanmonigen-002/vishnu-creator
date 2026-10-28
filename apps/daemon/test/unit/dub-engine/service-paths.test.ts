import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  resolveDubEngineDirectory,
  resolveDubEnginePython
} from '../../../src/dub-engine/service.js';

describe('DubEngineService path resolution (T7.1)', () => {
  let roots: string[] = [];
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VISHNUCREATOR_DUB_ENGINE_ROOT;
    delete process.env.VISHNUCREATOR_DUB_ENGINE_PYTHON;
  });

  afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots = [];
    process.env = { ...originalEnv };
  });

  function makeTmpDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    roots.push(dir);
    return dir;
  }

  describe('resolveDubEngineDirectory', () => {
    it('prioritizes explicit config.enginePath', () => {
      const explicit = makeTmpDir('explicit-engine-');
      const resolved = resolveDubEngineDirectory({ enginePath: explicit });
      expect(resolved).toBe(explicit);
    });

    it('uses VISHNUCREATOR_DUB_ENGINE_ROOT when vishnu_dub exists', () => {
      const customRoot = makeTmpDir('custom-dub-root-');
      mkdirSync(join(customRoot, 'vishnu_dub'));
      process.env.VISHNUCREATOR_DUB_ENGINE_ROOT = customRoot;

      const resolved = resolveDubEngineDirectory({ enginePath: '' });
      expect(resolved).toBe(customRoot);
    });

    it('resolves packaged desktop runtime directory when present', () => {
      const tempDesktop = makeTmpDir('packaged-desktop-');
      const packDubEngine = join(tempDesktop, 'apps', 'desktop', '.pack', 'dub-engine-runtime');
      mkdirSync(join(packDubEngine, 'vishnu_dub'), { recursive: true });

      // Simulate moduleDir being inside apps/daemon/dist/dub-engine
      const fakeModuleDir = join(tempDesktop, 'apps', 'daemon', 'dist', 'dub-engine');
      mkdirSync(fakeModuleDir, { recursive: true });

      const resolved = resolveDubEngineDirectory({ enginePath: '' }, tempDesktop, fakeModuleDir);
      expect(resolved).toBe(packDubEngine);
    });
  });

  describe('resolveDubEnginePython', () => {
    const isWin = process.platform === 'win32';

    it('prioritizes explicit config.pythonPath', () => {
      const resolved = resolveDubEnginePython({ pythonPath: '/custom/bin/python' }, '/some/dir');
      expect(resolved).toBe('/custom/bin/python');
    });

    it('uses VISHNUCREATOR_DUB_ENGINE_PYTHON if file exists', () => {
      const dir = makeTmpDir('custom-py-');
      const pyExe = join(dir, isWin ? 'python.exe' : 'python');
      writeFileSync(pyExe, '');
      process.env.VISHNUCREATOR_DUB_ENGINE_PYTHON = pyExe;

      const resolved = resolveDubEnginePython({ pythonPath: '' }, dir);
      expect(resolved).toBe(pyExe);
    });

    it('resolves packaged portable python inside engineDir/python', () => {
      const engineDir = makeTmpDir('packaged-engine-');
      const pyDir = join(engineDir, 'python', isWin ? 'Scripts' : 'bin');
      mkdirSync(pyDir, { recursive: true });
      const pyExe = join(pyDir, isWin ? 'python.exe' : 'python');
      writeFileSync(pyExe, '');

      const resolved = resolveDubEnginePython({ pythonPath: '' }, engineDir);
      expect(resolved).toBe(pyExe);
    });

    it('resolves venv python inside engineDir/.venv', () => {
      const engineDir = makeTmpDir('venv-engine-');
      const pyDir = join(engineDir, '.venv', isWin ? 'Scripts' : 'bin');
      mkdirSync(pyDir, { recursive: true });
      const pyExe = join(pyDir, isWin ? 'python.exe' : 'python');
      writeFileSync(pyExe, '');

      const resolved = resolveDubEnginePython({ pythonPath: '' }, engineDir);
      expect(resolved).toBe(pyExe);
    });

    it('falls back to "python" when no binary is found', () => {
      const emptyDir = makeTmpDir('empty-engine-');
      const resolved = resolveDubEnginePython({ pythonPath: '' }, emptyDir);
      expect(resolved).toBe('python');
    });
  });
});
