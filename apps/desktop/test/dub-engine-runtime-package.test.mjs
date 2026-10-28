import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hashFile,
  verifyDubEngineRuntime
} from '../scripts/dub-engine-runtime-contract.mjs';
import {
  listFiles,
  prepareDubEngineRuntime,
  removePythonBytecodeCaches
} from '../scripts/prepare-dub-engine-runtime.mjs';

let roots = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

function write(filePath, content = '') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dub-engine-runtime-test-'));
  roots.push(root);

  const platform = overrides.platform ?? process.platform;
  const arch = overrides.arch ?? process.arch;
  const isWin = platform === 'win32';
  const exePath = isWin ? 'python/Scripts/python.exe' : 'python/bin/python3';

  write(join(root, exePath), '#!/bin/sh\n');
  write(join(root, 'vishnu_dub', 'api.py'), 'def main(): pass\n');
  write(join(root, 'vishnu_dub', '__init__.py'), '');
  write(join(root, 'pyproject.toml'), '[project]\nname = "vishnu-dub"\n');

  const gpuPack = {
    name: 'vishnu-dub-gpu-pack',
    version: '1.0.0',
    description: 'Optional GPU pack',
    targetTier: ['T2', 'T3'],
    cudaVersion: '12.1',
    downloadUrl: 'https://releases.vishnucreator.org/dub-engine/gpu-pack.tar.gz',
    sha256: 'a'.repeat(64),
    requirements: ['torch==2.14.1+cu121']
  };
  write(join(root, 'dub-engine-gpu-pack.json'), JSON.stringify(gpuPack, null, 2));

  const resourcePaths = [
    exePath,
    'vishnu_dub/api.py',
    'vishnu_dub/__init__.py',
    'pyproject.toml'
  ];

  const resources = resourcePaths.map(p => ({
    path: p,
    sha256: hashFile(join(root, p)),
    kind: p === exePath ? 'executable' : (p.endsWith('.py') ? 'source' : 'asset')
  }));

  const manifest = {
    version: 1,
    buildType: 'cpu',
    engineVersion: '0.1.0',
    pythonVersion: '3.12',
    platform,
    arch,
    executable: exePath,
    entryPoint: 'vishnu_dub/api.py',
    entryModule: 'vishnu_dub.api',
    gpuPack,
    resources,
    ...overrides
  };

  write(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { root, manifest, exePath };
}

describe('Dub Engine Runtime Package Contract', () => {
  it('accepts a valid CPU build with GPU pack specification', () => {
    const { root } = fixture();
    const verified = verifyDubEngineRuntime(root, process.platform, process.arch);
    expect(verified.buildType).toBe('cpu');
    expect(verified.engineVersion).toBe('0.1.0');
    expect(verified.gpuPack.targetTier).toEqual(['T2', 'T3']);
    expect(verified.resources.length).toBe(4);
  });

  it('rejects non-CPU builds by default', () => {
    const { root, manifest } = fixture();
    manifest.buildType = 'gpu';
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
    expect(() => verifyDubEngineRuntime(root, process.platform, process.arch)).toThrow(/invalid or targets another/);
  });

  it('rejects manifest without optional GPU pack specification', () => {
    const { root, manifest } = fixture();
    delete manifest.gpuPack;
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
    expect(() => verifyDubEngineRuntime(root, process.platform, process.arch)).toThrow(/GPU pack specification/);
  });

  it('rejects mutable Python bytecode caches in resources', () => {
    const { root, manifest } = fixture();
    write(join(root, 'vishnu_dub', '__pycache__', 'api.cpython-312.pyc'), 'cached');
    manifest.resources.push({
      path: 'vishnu_dub/__pycache__/api.cpython-312.pyc',
      sha256: hashFile(join(root, 'vishnu_dub', '__pycache__', 'api.cpython-312.pyc')),
      kind: 'asset'
    });
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
    expect(() => verifyDubEngineRuntime(root, process.platform, process.arch)).toThrow(/mutable Python bytecode caches/);
  });

  it('rejects missing resources', () => {
    const { root } = fixture();
    unlinkSync(join(root, 'vishnu_dub', '__init__.py'));
    expect(() => verifyDubEngineRuntime(root, process.platform, process.arch)).toThrow(/resource is missing|differs from manifest/);
  });

  it('rejects extra unlisted resources', () => {
    const { root } = fixture();
    write(join(root, 'extra.txt'), 'extra file');
    expect(() => verifyDubEngineRuntime(root, process.platform, process.arch)).toThrow(/file list differs from manifest/);
  });

  it('rejects resource hash mismatch', () => {
    const { root } = fixture();
    writeFileSync(join(root, 'vishnu_dub', 'api.py'), 'tampered content');
    expect(() => verifyDubEngineRuntime(root, process.platform, process.arch)).toThrow(/hash mismatch/);
  });

  it('rejects missing executable or wrong executable type', () => {
    const { root, manifest, exePath } = fixture();
    const exe = manifest.resources.find(r => r.path === exePath);
    exe.kind = 'asset';
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
    expect(() => verifyDubEngineRuntime(root, process.platform, process.arch)).toThrow(/not marked as executable/);
  });

  it('rejects missing entry point', () => {
    const { root, manifest } = fixture();
    manifest.entryPoint = 'missing/entry.py';
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
    expect(() => verifyDubEngineRuntime(root, process.platform, process.arch)).toThrow(/entry point is missing/);
  });

  it('cleans bytecode caches with removePythonBytecodeCaches', () => {
    const testDir = mkdtempSync(join(tmpdir(), 'dub-bytecode-clean-'));
    roots.push(testDir);
    write(join(testDir, '__pycache__', 'test.pyc'), 'c');
    write(join(testDir, 'sub', 'test.pyc'), 'c');
    write(join(testDir, 'sub', 'test.py'), 'print(1)');

    removePythonBytecodeCaches(testDir);
    expect(listFiles(testDir)).toEqual([join(testDir, 'sub', 'test.py')]);
  });
});
