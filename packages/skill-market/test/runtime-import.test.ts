import { execFile } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceDir = dirname(dirname(packageDir));
const runtimeImportTestTimeoutMs = 180_000;

describe('skill market runtime exports', () => {
  it('builds from a clean dist, loads natively, and boots the workspace daemon', async () => {
    rmSync(join(packageDir, 'dist'), { recursive: true, force: true });

    const packageManagerArgs = ['--filter', '@vishnucreator/daemon', 'build'];
    const packageManagerScript = [
      process.env.npm_execpath,
      process.platform === 'win32' && process.env.APPDATA !== undefined
        ? join(process.env.APPDATA, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
        : undefined
    ].find(candidate => candidate !== undefined && existsSync(candidate));
    await execFileAsync(
      packageManagerScript === undefined
        ? process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
        : process.execPath,
      packageManagerScript === undefined
        ? packageManagerArgs
        : [packageManagerScript, ...packageManagerArgs],
      {
        cwd: workspaceDir,
        shell: packageManagerScript === undefined && process.platform === 'win32'
      }
    );

    const { stdout: nativeOutput } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          "const market = await import('@vishnucreator/skill-market');",
          "if (market.skillMarketCatalog.length !== 0) throw new Error('published catalog should be empty');",
          "if (market.skillMarketCandidateCatalog.length !== 52) throw new Error('candidate catalog import failed');",
          "process.stdout.write('runtime-import-ok');"
        ].join('\n')
      ],
      {
        cwd: join(workspaceDir, 'apps/daemon'),
        encoding: 'utf8'
      }
    );

    const { stdout: daemonOutput } = await execFileAsync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        [
          "const { buildServer } = await import('./dist/api/server.js');",
          "const { mkdtempSync, rmSync } = await import('node:fs');",
          "const { tmpdir } = await import('node:os');",
          "const { join } = await import('node:path');",
          "const smokeRoot = mkdtempSync(join(tmpdir(), 'vishnucreator-daemon-runtime-smoke-'));",
          "const server = await buildServer({",
          "  token: 'runtime-smoke-token',",
          "  dataDir: join(smokeRoot, 'data'),",
          "  codexHome: join(smokeRoot, 'codex-home'),",
          "  schedulerAutostart: false",
          "});",
          "await server.ready();",
          "await server.close();",
          "rmSync(smokeRoot, { recursive: true, force: true });",
          "process.stdout.write('daemon-smoke-ok');"
        ].join('\n')
      ],
      {
        cwd: join(workspaceDir, 'apps/daemon'),
        encoding: 'utf8'
      }
    );

    expect(nativeOutput).toBe('runtime-import-ok');
    expect(daemonOutput).toBe('daemon-smoke-ok');
  }, runtimeImportTestTimeoutMs);
});
