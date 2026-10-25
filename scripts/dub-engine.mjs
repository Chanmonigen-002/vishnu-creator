#!/usr/bin/env node
/**
 * Vishnu Creator — Dub Engine launcher.
 *
 * Delegates to the Python dub engine service in services/dub-engine/ using
 * the pinned venv Python. Provides health-wait and clear error messages.
 *
 * The engine binds to 127.0.0.1 only and never leaves the local machine.
 *
 * Usage:  pnpm dub:engine
 *         node scripts/dub-engine.mjs --health
 */

import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const ENGINE_DIR = join(ROOT, 'services', 'dub-engine');
const VENV_PYTHON = join(ENGINE_DIR, '.venv', 'Scripts', 'python.exe');
const HEALTH_URL = 'http://127.0.0.1:8765/health';
const HEALTH_WAIT_MS = 30000;
const HEALTH_POLL_MS = 500;

function venvPythonExists() {
  try {
    execFileSync(VENV_PYTHON, ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function waitForHealth(signal) {
  const start = Date.now();
  while (Date.now() - start < HEALTH_WAIT_MS) {
    if (signal.aborted) throw new Error('Health wait aborted');
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'ok') return true;
      }
    } catch {
      // Engine not up yet, keep polling
    }
    await new Promise(r => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error(`Dub engine did not become healthy at ${HEALTH_URL} within ${HEALTH_WAIT_MS}ms`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--health') || args.includes('-h')) {
    try {
      await waitForHealth({ aborted: false });
      console.log(`Dub engine is healthy at ${HEALTH_URL}`);
      process.exit(0);
    } catch (error) {
      console.error(`Dub engine health check failed: ${error.message}`);
      process.exit(1);
    }
    return;
  }

  if (!venvPythonExists()) {
    console.error(
      'Dub engine venv Python not found at ' + VENV_PYTHON +
      '\nRun: cd services/dub-engine && uv sync (or create .venv with Python 3.11/3.12)'
    );
    process.exit(1);
  }

  console.log('Starting Vishnu Dub Engine from ' + ENGINE_DIR);
  console.log('Python: ' + VENV_PYTHON);

  const child = spawn(VENV_PYTHON, ['-m', 'vishnu_dub.api'], {
    cwd: ENGINE_DIR,
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...process.env, VISHNU_DUB_ENGINE: '1' },
  });

  let stopped = false;
  child.on('error', error => {
    console.error('Failed to start dub engine:', error.message);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (stopped) return;
    console.error(`Dub engine exited (code=${code}, signal=${signal})`);
    process.exit(code ?? 1);
  });

  const ac = new AbortController();
  const healthTimeout = setTimeout(() => ac.abort(), HEALTH_WAIT_MS);

  try {
    await waitForHealth(ac.signal);
    clearTimeout(healthTimeout);
    console.log('Dub engine started and healthy at ' + HEALTH_URL);
  } catch (error) {
    clearTimeout(healthTimeout);
    child.kill();
    console.error(error.message);
    process.exit(1);
  }

  process.on('SIGINT', () => { stopped = true; child.kill(); process.exit(0); });
  process.on('SIGTERM', () => { stopped = true; child.kill(); process.exit(0); });
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
