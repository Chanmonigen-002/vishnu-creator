import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startVishnuRuntimeVerification } from '../../src/creator/vishnu/runtime-verifier.js';

let tempDir = '';

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('Vishnu Runtime 后台校验', () => {
  it('异步完成完整校验并复用生成的缓存', async () => {
    const fixture = createFixture();

    const first = startVishnuRuntimeVerification({
      resourceRoot: fixture.root,
      cachePath: fixture.cachePath
    });

    expect(existsSync(fixture.cachePath)).toBe(false);
    await expect(first).resolves.toEqual({ cacheHit: false });
    expect(existsSync(fixture.cachePath)).toBe(true);
    await expect(startVishnuRuntimeVerification({
      resourceRoot: fixture.root,
      cachePath: fixture.cachePath
    })).resolves.toEqual({ cacheHit: true });
  });

  it('资源损坏时拒绝就绪 Promise', async () => {
    const fixture = createFixture();
    writeFileSync(fixture.executable, 'tampered-runtime');

    await expect(startVishnuRuntimeVerification({
      resourceRoot: fixture.root,
      cachePath: fixture.cachePath
    })).rejects.toThrow('dependency_hash_mismatch: bin/vishnuai-cli');
    expect(existsSync(fixture.cachePath)).toBe(false);
  });
});

function createFixture() {
  tempDir = mkdtempSync(join(tmpdir(), 'vishnucreator-runtime-verifier-'));
  const root = join(tempDir, 'runtime');
  const executable = join(root, 'bin', 'vishnuai-cli');
  const cachePath = join(tempDir, 'cache', 'vishnuai.json');
  mkdirSync(dirname(executable), { recursive: true });
  writeFileSync(executable, 'packaged-runtime');
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({
    version: 1,
    platform: process.platform,
    arch: process.arch,
    resources: [{
      path: 'bin/vishnuai-cli',
      kind: 'executable',
      sha256: createHash('sha256').update('packaged-runtime').digest('hex')
    }]
  }));
  return { root, executable, cachePath };
}
