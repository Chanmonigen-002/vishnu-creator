#!/usr/bin/env node
/**
 * Vishnu Creator — Dub Engine launcher.
 *
 * Starts the local Khmer-first dubbing/translation engine (FastAPI bridge over
 * the ZastTranslate-derived pipeline: WhisperX ASR, LLM translation with Khmer
 * dubbing rules, VoxCPM2 voice cloning, ffmpeg assembly).
 *
 * The engine binds to 127.0.0.1 only and never leaves the local machine.
 *
 * Usage:  pnpm dub:engine
 * Env:    VISHNU_DUB_ENGINE_PATH  (default: sibling ../ZastTranslate)
 *         VISHNU_DUB_ENGINE_PORT  (default: 8765)
 *         VISHNU_DUB_PYTHON       (default: C:\Python314\python.exe on Windows, python3 elsewhere)
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const enginePath = path.resolve(
  process.env.VISHNU_DUB_ENGINE_PATH ?? path.join(repoRoot, '..', 'ZastTranslate'),
);
const port = Number(process.env.VISHNU_DUB_ENGINE_PORT ?? 8765);

const engineFile = path.join(enginePath, 'vishnu_api.py');
if (!existsSync(engineFile)) {
  console.error(`[dub-engine] Bridge not found at ${engineFile}`);
  console.error('[dub-engine] Clone the dubbing engine repo next to this project:');
  console.error(`[dub-engine]   git clone https://github.com/zast57/ZastTranslate.git "${enginePath}"`);
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const pythonExe = process.env.VISHNU_DUB_PYTHON ?? (isWindows ? 'C:\\Python314\\python.exe' : 'python3');

if (!existsSync(pythonExe)) {
  console.error(`[dub-engine] Python interpreter not found: ${pythonExe}`);
  console.error('[dub-engine] Set VISHNU_DUB_PYTHON to a Python 3.10+ with fastapi+uvicorn installed.');
  process.exit(1);
}

const uvicornArgs = [
  engineFile,
];

console.log(`[dub-engine] starting ${pythonExe} ${uvicornArgs.join(' ')}`);
const child = spawn(pythonExe, uvicornArgs, {
  cwd: enginePath,
  env: {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    VISHNU_DUB_PORT: String(port),
    VISHNU_CREATOR_HOME: process.env.VISHNU_CREATOR_HOME ?? path.join(repoRoot, '.vishnucreator'),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const shutdown = (signal) => {
  console.log(`[dub-engine] ${signal} received, stopping engine...`);
  child.kill(signal);
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

child.on('exit', (code) => {
  console.log(`[dub-engine] exited with code ${code}`);
  process.exit(code ?? 0);
});
