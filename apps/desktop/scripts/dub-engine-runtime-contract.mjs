import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

export function readDubEngineRuntimeManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    throw new Error(`Dub Engine Runtime manifest is missing: ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

export function hashFile(filePath) {
  const contents = readFileSync(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

export function hashDirectory(root) {
  const files = [];
  walk(root, path => {
    if (!statSync(path).isFile()) return;
    files.push(relative(root, path).replaceAll('\\', '/'));
  });
  files.sort();

  const aggregate = createHash('sha256');
  for (const relativePath of files) {
    const contents = readFileSync(join(root, relativePath));
    const contentHash = createHash('sha256').update(contents).digest('hex');
    aggregate.update(relativePath).update('\0').update(contentHash).update('\0');
  }
  return {
    files,
    fileCount: files.length,
    hash: aggregate.digest('hex')
  };
}

function walk(directory, visitor) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    visitor(path);
    if (entry.isDirectory()) walk(path, visitor);
  }
}

export function verifyDubEngineRuntime(root, platform, arch) {
  const manifestPath = join(root, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Dub Engine Runtime manifest is missing: ${manifestPath}`);
  }
  const manifest = readDubEngineRuntimeManifest(manifestPath);

  if (
    manifest?.version !== 1
    || manifest.buildType !== 'cpu'
    || typeof manifest.engineVersion !== 'string'
    || typeof manifest.pythonVersion !== 'string'
    || manifest.platform !== platform
    || manifest.arch !== arch
    || typeof manifest.executable !== 'string'
    || typeof manifest.entryPoint !== 'string'
    || !Array.isArray(manifest.resources)
  ) {
    throw new Error('Dub Engine Runtime manifest is invalid or targets another platform/architecture');
  }

  // GPU pack specification must be present for optional GPU acceleration download
  if (
    !manifest.gpuPack
    || typeof manifest.gpuPack.name !== 'string'
    || typeof manifest.gpuPack.version !== 'string'
    || !Array.isArray(manifest.gpuPack.targetTier)
    || !Array.isArray(manifest.gpuPack.requirements)
  ) {
    throw new Error('Dub Engine Runtime manifest must define the optional GPU pack specification');
  }

  const expected = new Set(['manifest.json']);
  if (existsSync(join(root, 'dub-engine-gpu-pack.json'))) {
    expected.add('dub-engine-gpu-pack.json');
  }

  const resourcesByPath = new Map();
  for (const resource of manifest.resources) {
    if (
      typeof resource?.path !== 'string'
      || !/^[a-f0-9]{64}$/i.test(resource?.sha256 ?? '')
      || !['executable', 'source', 'asset'].includes(resource?.kind)
    ) {
      throw new Error(`Dub Engine Runtime contains an invalid resource record: ${JSON.stringify(resource)}`);
    }

    // No mutable bytecode caches allowed in packaged runtime
    if (
      /(?:^|\/)__pycache__(?:\/|$)/i.test(resource.path)
      || /\.py[co]$/i.test(resource.path)
    ) {
      throw new Error(`Dub Engine Runtime must not package mutable Python bytecode caches: ${resource.path}`);
    }

    if (resourcesByPath.has(resource.path)) {
      throw new Error(`Dub Engine Runtime resource is declared more than once: ${resource.path}`);
    }

    const fullPath = resolve(root, resource.path);
    const relativePath = relative(root, fullPath);
    if (relativePath.startsWith('..') || resolve(root, relativePath) !== fullPath) {
      throw new Error(`Dub Engine Runtime resource escapes its root: ${resource.path}`);
    }

    if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
      throw new Error(`Dub Engine Runtime resource is missing: ${resource.path}`);
    }

    if (hashFile(fullPath) !== resource.sha256.toLowerCase()) {
      throw new Error(`Dub Engine Runtime resource hash mismatch: ${resource.path}`);
    }

    resourcesByPath.set(resource.path, resource);
    expected.add(relativePath.replaceAll('\\', '/'));
  }

  // Check for undeclared extra files
  const actual = new Set();
  walk(root, path => {
    if (statSync(path).isFile()) {
      actual.add(relative(root, path).replaceAll('\\', '/'));
    }
  });

  const extra = [...actual].find(path => !expected.has(path));
  const missing = [...expected].find(path => !actual.has(path));
  if (extra || missing) {
    throw new Error(`Dub Engine Runtime file list differs from manifest: ${extra ?? missing}`);
  }

  // Ensure python executable is declared and present
  const normalizedExecutable = manifest.executable.replaceAll('\\', '/');
  const executableResource = resourcesByPath.get(normalizedExecutable);
  if (!executableResource || executableResource.kind !== 'executable') {
    throw new Error(`Dub Engine Runtime executable is missing or not marked as executable: ${manifest.executable}`);
  }

  // Ensure entry point is declared and present
  const normalizedEntryPoint = manifest.entryPoint.replaceAll('\\', '/');
  if (!resourcesByPath.has(normalizedEntryPoint)) {
    throw new Error(`Dub Engine Runtime entry point is missing: ${manifest.entryPoint}`);
  }

  return manifest;
}
