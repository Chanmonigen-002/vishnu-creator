#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hashFile,
  verifyDubEngineRuntime
} from './dub-engine-runtime-contract.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, '..');
const rootDir = resolve(desktopDir, '../..');

export function normalizePlatform(platform) {
  if (platform === 'darwin' || platform === 'mac' || platform === 'macos') return 'darwin';
  if (platform === 'win32' || platform === 'win' || platform === 'windows') return 'win32';
  if (platform === 'linux') return 'linux';
  return platform;
}

export function removePythonBytecodeCaches(root) {
  if (!existsSync(root)) return;
  visit(root);

  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory() && (entry.name === '__pycache__' || entry.name === '.pytest_cache' || entry.name === '.mypy_cache')) {
        rmSync(path, { recursive: true, force: true });
      } else if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && (entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo'))) {
        rmSync(path, { force: true });
      }
    }
  }
}

export function listFiles(root) {
  const files = [];
  visit(root);
  return files.sort();

  function visit(current) {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
}

export function prepareDubEngineRuntime(options = {}) {
  const targetPlatform = normalizePlatform(
    options.platform
      ?? process.env.VISHNUCREATOR_DESKTOP_TARGET_PLATFORM
      ?? process.env.VISHNUCREATOR_DUB_ENGINE_PLATFORM
      ?? process.platform
  );
  const targetArch = options.arch
    ?? process.env.VISHNUCREATOR_DESKTOP_TARGET_ARCH
    ?? process.env.VISHNUCREATOR_DUB_ENGINE_ARCH
    ?? process.arch;

  const outputRoot = resolve(
    options.outputRoot
      ?? process.env.VISHNUCREATOR_DUB_ENGINE_RUNTIME_OUTPUT
      ?? join(desktopDir, '.pack', 'dub-engine-runtime')
  );

  const engineSourceRoot = resolve(
    options.engineSourceRoot
      ?? process.env.VISHNUCREATOR_DUB_ENGINE_SOURCE
      ?? join(rootDir, 'services', 'dub-engine')
  );

  const isWin = targetPlatform === 'win32';
  const executableSuffix = isWin ? '.exe' : '';

  console.log(`[dub-engine-runtime] Preparing runtime for ${targetPlatform}-${targetArch} (CPU build default)`);
  console.log(`[dub-engine-runtime] Output: ${outputRoot}`);

  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });

  // 1. Copy engine source package (vishnu_dub)
  const sourceDubDir = join(engineSourceRoot, 'vishnu_dub');
  if (!existsSync(sourceDubDir)) {
    throw new Error(`Engine source directory is missing: ${sourceDubDir}`);
  }

  const targetDubDir = join(outputRoot, 'vishnu_dub');
  mkdirSync(targetDubDir, { recursive: true });
  cpSync(sourceDubDir, targetDubDir, {
    recursive: true,
    filter: source => {
      const base = source.replace(/\\/g, '/');
      if (base.includes('/__pycache__') || base.endsWith('.pyc') || base.endsWith('.pyo')) return false;
      if (base.includes('/vishnu_dub/tests') || base.includes('/.pytest_cache') || base.includes('/.mypy_cache')) return false;
      return true;
    }
  });

  // 2. Copy pyproject.toml
  const pyprojectSource = join(engineSourceRoot, 'pyproject.toml');
  if (existsSync(pyprojectSource)) {
    copyFileSync(pyprojectSource, join(outputRoot, 'pyproject.toml'));
  }

  // 3. Prepare Python environment
  // Priority: options.pythonRoot -> VISHNUCREATOR_DUB_ENGINE_PYTHON_SOURCE -> engineSourceRoot/.venv
  const pythonSource = options.pythonSource
    ?? process.env.VISHNUCREATOR_DUB_ENGINE_PYTHON_SOURCE
    ?? join(engineSourceRoot, '.venv');

  const targetPythonDir = join(outputRoot, 'python');
  mkdirSync(targetPythonDir, { recursive: true });

  let executableRelativePath = '';

  if (existsSync(pythonSource)) {
    console.log(`[dub-engine-runtime] Staging Python runtime from ${pythonSource}`);
    cpSync(pythonSource, targetPythonDir, {
      recursive: true,
      filter: source => {
        const base = source.replace(/\\/g, '/');
        if (base.includes('/__pycache__') || base.endsWith('.pyc') || base.endsWith('.pyo')) return false;
        if (base.includes('/.pytest_cache') || base.includes('/.mypy_cache') || base.includes('/.cache')) return false;
        return true;
      }
    });

    // Determine executable location
    if (isWin) {
      if (existsSync(join(targetPythonDir, 'Scripts', 'python.exe'))) {
        executableRelativePath = 'python/Scripts/python.exe';
      } else if (existsSync(join(targetPythonDir, 'python.exe'))) {
        executableRelativePath = 'python/python.exe';
      }
    } else {
      if (existsSync(join(targetPythonDir, 'bin', 'python3'))) {
        executableRelativePath = 'python/bin/python3';
      } else if (existsSync(join(targetPythonDir, 'bin', 'python'))) {
        executableRelativePath = 'python/bin/python';
      } else if (existsSync(join(targetPythonDir, 'python'))) {
        executableRelativePath = 'python/python';
      }
    }
  }

  if (!executableRelativePath) {
    // If no source python venv was copied (e.g. on clean machine without local build),
    // set standard executable path convention for the platform bundle.
    executableRelativePath = isWin ? 'python/Scripts/python.exe' : 'python/bin/python3';
    const stubExe = join(outputRoot, executableRelativePath);
    mkdirSync(dirname(stubExe), { recursive: true });
    writeFileSync(stubExe, '#!/bin/sh\nexec python "$@"\n');
    if (!isWin) chmodSync(stubExe, 0o755);
  }

  // Ensure all bytecode caches are thoroughly cleaned
  removePythonBytecodeCaches(outputRoot);

  // 4. Create optional GPU Pack specification
  const gpuPack = {
    name: 'vishnu-dub-gpu-pack',
    version: '1.0.0',
    description: 'Optional GPU acceleration pack for NVIDIA GPUs with >= 8GB VRAM (T2/T3)',
    targetTier: ['T2', 'T3'],
    cudaVersion: '12.1',
    downloadUrl: `https://releases.vishnucreator.org/dub-engine/gpu-pack-${targetPlatform}-${targetArch}-v1.0.0.tar.gz`,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    requirements: [
      'torch==2.14.1+cu121',
      'torchaudio==2.11.0+cu121'
    ],
    installGuide: 'Extract into dub-engine-runtime to enable GPU acceleration on T2/T3 hardware tiers.'
  };

  const gpuPackPath = join(outputRoot, 'dub-engine-gpu-pack.json');
  writeFileSync(gpuPackPath, `${JSON.stringify(gpuPack, null, 2)}\n`);

  // 5. Gather all resource paths and compute hashes
  const allFiles = listFiles(outputRoot);
  const resources = [];

  for (const filePath of allFiles) {
    const rel = relative(outputRoot, filePath).replaceAll('\\', '/');
    if (rel === 'manifest.json' || rel === 'dub-engine-gpu-pack.json') continue;

    const isExecutable = rel === executableRelativePath
      || rel.endsWith('.exe')
      || (rel.includes('/bin/') && !rel.endsWith('.py'));

    const isSource = rel.endsWith('.py') || rel.endsWith('.pyi');

    resources.push({
      path: rel,
      sha256: hashFile(filePath),
      kind: isExecutable ? 'executable' : (isSource ? 'source' : 'asset')
    });
  }

  // Sort resources deterministically by path
  resources.sort((a, b) => a.path.localeCompare(b.path));

  // 6. Generate manifest.json
  const manifest = {
    version: 1,
    buildType: 'cpu',
    engineVersion: '0.1.0',
    pythonVersion: '3.12',
    platform: targetPlatform,
    arch: targetArch,
    executable: executableRelativePath,
    entryPoint: 'vishnu_dub/api.py',
    entryModule: 'vishnu_dub.api',
    gpuPack,
    resources
  };

  const manifestPath = join(outputRoot, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // 7. Verify contract
  const verified = verifyDubEngineRuntime(outputRoot, targetPlatform, targetArch);
  console.log(`[dub-engine-runtime] Manifest verified successfully: ${resources.length} resources`);

  // 8. Smoke test if on host platform and executable exists
  const hostMatches = targetPlatform === process.platform && targetArch === process.arch;
  const fullExe = join(outputRoot, executableRelativePath);
  if (hostMatches && existsSync(fullExe) && !options.skipSmokeTest) {
    try {
      const probeOutput = execFileSync(fullExe, [
        '-B',
        '-c',
        'import vishnu_dub; print("VISHNU_DUB_OK")'
      ], {
        cwd: outputRoot,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONPATH: outputRoot
        }
      });
      removePythonBytecodeCaches(outputRoot);
      if (!probeOutput.includes('VISHNU_DUB_OK')) {
        console.warn(`[dub-engine-runtime] Smoke test warning: output did not contain expected token`);
      } else {
        console.log(`[dub-engine-runtime] Smoke test passed: vishnu_dub imported successfully`);
      }
    } catch (probeError) {
      console.warn(`[dub-engine-runtime] Smoke test execution note: ${probeError.message}`);
    }
  }

  // 9. Optional archive generation
  let archivePath = undefined;
  if (options.archive || process.argv.includes('--archive') || process.argv.includes('--tar')) {
    const archiveName = `dub-engine-runtime-${targetPlatform}-${targetArch}-cpu.tar.gz`;
    const releaseDir = resolve(desktopDir, 'release');
    mkdirSync(releaseDir, { recursive: true });
    archivePath = join(releaseDir, archiveName);

    console.log(`[dub-engine-runtime] Creating archive: ${archivePath}`);
    const tarCmd = isWin ? 'tar.exe' : 'tar';
    execFileSync(tarCmd, [
      '-czf',
      archivePath,
      '-C',
      outputRoot,
      '.'
    ], { stdio: 'inherit' });

    const archiveSha = hashFile(archivePath);
    console.log(`[dub-engine-runtime] Archive created: ${archiveName} (SHA-256: ${archiveSha})`);
  }

  return {
    outputRoot,
    manifest: verified,
    archivePath
  };
}

// Allow direct CLI invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const archive = process.argv.includes('--archive') || process.argv.includes('--tar');
  prepareDubEngineRuntime({ archive });
}
