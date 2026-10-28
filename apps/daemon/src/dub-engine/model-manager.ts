/**
 * Vishnu Dub Engine — Model Download Manager.
 *
 * Implements:
 * 1. Cache directory resolution (.vishnucreator/models, largest drive per ADR-0003, env overrides).
 * 2. Disk space pre-checking with safety margin.
 * 3. Resumable downloads via HTTP Range (.part file).
 * 4. Streaming SHA-256 checksum verification and atomic file move.
 * 5. Real-time progress tracking (bytes, percent, speed) and active job supervision.
 */

import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statfsSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { pipeline } from 'node:stream/promises';
import {
  DEFAULT_MODEL_CATALOG,
  findModelInCatalog,
  type ModelCatalogItem,
  type ModelCatalogListResponse,
  type ModelDeleteResponse,
  type ModelDownloadProgress,
  type ModelDownloadRequest,
  type ModelVerifyResponse,
} from '@vishnucreator/protocol';

export const ONE_GB = 1024 * 1024 * 1024;
export const DEFAULT_SAFETY_MARGIN_BYTES = ONE_GB; // 1 GB safety margin

export type ModelManagerOptions = {
  modelsDir?: string;
  catalog?: readonly ModelCatalogItem[];
  safetyMarginBytes?: number;
  fetchFn?: typeof fetch;
};

/**
 * Resolves the model storage directory.
 * Priority:
 * 1. customDir (explicit option)
 * 2. VISHNU_DUB_MODEL_STORE / VISHNUCREATOR_MODELS_DIR / VISHNU_MODEL_DIR env
 * 3. Largest accessible disk drive (e.g. D:\.vishnucreator\models on Windows)
 * 4. Fallback to ~/.vishnucreator/models
 * 5. Fallback to ./vishnucreator/models
 */
export function resolveModelsCacheDirectory(options?: {
  customDir?: string;
  cwd?: string;
  userHome?: string;
}): string {
  const custom = options?.customDir ||
    process.env.VISHNU_DUB_MODEL_STORE ||
    process.env.VISHNUCREATOR_MODELS_DIR ||
    process.env.VISHNU_MODEL_DIR;

  if (custom && custom.trim()) {
    const resolved = resolve(custom.trim());
    mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  const isWin = platform() === 'win32';
  const home = options?.userHome || homedir();
  const baseCwd = options?.cwd || process.cwd();

  if (isWin) {
    let bestDrive: string | null = null;
    let maxFreeBytes = -1;

    // Scan standard drive letters A..Z
    for (let i = 65; i <= 90; i++) {
      const driveLetter = String.fromCharCode(i);
      const driveRoot = `${driveLetter}:\\`;
      try {
        if (!existsSync(driveRoot)) continue;
        const stats = statfsSync(driveRoot);
        const freeBytes = Number(stats.bavail) * Number(stats.bsize);
        if (freeBytes > maxFreeBytes) {
          maxFreeBytes = freeBytes;
          bestDrive = driveRoot;
        }
      } catch {
        // Drive inaccessible or removable media without disk
      }
    }

    if (bestDrive) {
      // Check for .vishnucreator/models, with fallback to existing VishnuCreatorData/models
      const candidateVishnuCreator = join(bestDrive, '.vishnucreator', 'models');
      const candidateLegacy = join(bestDrive, 'VishnuCreatorData', 'models');

      if (!existsSync(candidateVishnuCreator) && existsSync(candidateLegacy)) {
        return candidateLegacy;
      }
      mkdirSync(candidateVishnuCreator, { recursive: true });
      return candidateVishnuCreator;
    }
  }

  // Non-Windows or Windows fallback
  const userModelsDir = join(home, '.vishnucreator', 'models');
  try {
    mkdirSync(userModelsDir, { recursive: true });
    return userModelsDir;
  } catch {
    const cwdModelsDir = join(baseCwd, '.vishnucreator', 'models');
    mkdirSync(cwdModelsDir, { recursive: true });
    return cwdModelsDir;
  }
}

/**
 * Pre-checks available free disk space on the given path's filesystem.
 */
export function checkFreeDiskSpace(
  targetPath: string,
  requiredBytes: number,
  safetyMarginBytes: number = DEFAULT_SAFETY_MARGIN_BYTES
): void {
  const dir = existsSync(targetPath) && statSync(targetPath).isDirectory()
    ? targetPath
    : dirname(targetPath);

  mkdirSync(dir, { recursive: true });

  try {
    const stats = statfsSync(dir);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const totalNeeded = requiredBytes + safetyMarginBytes;

    if (freeBytes < totalNeeded) {
      const freeGb = (freeBytes / ONE_GB).toFixed(2);
      const neededGb = (totalNeeded / ONE_GB).toFixed(2);
      throw new Error(
        `Insufficient disk space on ${dir}: ${freeGb} GB free, need at least ${neededGb} GB (including ${(safetyMarginBytes / ONE_GB).toFixed(1)} GB safety margin)`
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Insufficient disk space')) {
      throw err;
    }
    // If statfs is not supported on some virtual mount, continue
  }
}

/**
 * Computes SHA-256 hex digest for a file by streaming chunks.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest('hex').toLowerCase();
}

type ActiveDownload = {
  progress: ModelDownloadProgress;
  abortController: AbortController;
};

export class DubModelManager extends EventEmitter {
  private modelsDir: string;
  private catalog: Map<string, ModelCatalogItem> = new Map();
  private safetyMarginBytes: number;
  private activeDownloads: Map<string, ActiveDownload> = new Map();
  private customFetch: typeof fetch;

  constructor(options: ModelManagerOptions = {}) {
    super();
    this.modelsDir = resolveModelsCacheDirectory({ customDir: options.modelsDir });
    this.safetyMarginBytes = options.safetyMarginBytes ?? DEFAULT_SAFETY_MARGIN_BYTES;
    this.customFetch = options.fetchFn ?? globalThis.fetch;

    const catalogItems = options.catalog ?? DEFAULT_MODEL_CATALOG;
    for (const item of catalogItems) {
      this.catalog.set(item.id, { ...item });
    }
  }

  getModelsDirectory(): string {
    return this.modelsDir;
  }

  getAvailableDiskFreeBytes(): number {
    try {
      const stats = statfsSync(this.modelsDir);
      return Number(stats.bavail) * Number(stats.bsize);
    } catch {
      return 0;
    }
  }

  resolveLocalModelPath(item: ModelCatalogItem): string {
    return join(this.modelsDir, item.targetSubdir, item.filename);
  }

  /**
   * List all models in the catalog with their current installed and verification state.
   */
  async listModels(): Promise<ModelCatalogListResponse> {
    const items: ModelCatalogItem[] = [];

    for (const item of this.catalog.values()) {
      const localPath = this.resolveLocalModelPath(item);
      const active = this.activeDownloads.get(item.id);

      if (existsSync(localPath)) {
        try {
          const stats = statSync(localPath);
          items.push({
            ...item,
            installed: true,
            localPath,
            localSizeBytes: stats.size,
          });
          continue;
        } catch {
          // File stat failure
        }
      }

      items.push({
        ...item,
        installed: false,
        localPath: active?.progress.localPath ?? localPath,
        localSizeBytes: 0,
      });
    }

    return {
      modelsRoot: this.modelsDir,
      availableDiskFreeBytes: this.getAvailableDiskFreeBytes(),
      models: items,
    };
  }

  async getModel(modelId: string): Promise<ModelCatalogItem | undefined> {
    const item = this.catalog.get(modelId);
    if (!item) return undefined;

    const localPath = this.resolveLocalModelPath(item);
    if (existsSync(localPath)) {
      try {
        const stats = statSync(localPath);
        return {
          ...item,
          installed: true,
          localPath,
          localSizeBytes: stats.size,
        };
      } catch {
        // Fall through
      }
    }

    return {
      ...item,
      installed: false,
      localPath,
      localSizeBytes: 0,
    };
  }

  getProgress(modelId: string): ModelDownloadProgress | undefined {
    return this.activeDownloads.get(modelId)?.progress;
  }

  /**
   * Verifies the SHA-256 checksum of an installed model.
   */
  async verifyModel(modelId: string): Promise<ModelVerifyResponse> {
    const item = this.catalog.get(modelId);
    if (!item) {
      return {
        modelId,
        valid: false,
        expectedSha256: '',
        error: `Model "${modelId}" is not in the catalog`,
      };
    }

    const localPath = this.resolveLocalModelPath(item);
    if (!existsSync(localPath)) {
      return {
        modelId,
        valid: false,
        expectedSha256: item.expectedSha256,
        error: `Model file not found at ${localPath}`,
      };
    }

    try {
      const calculated = await computeFileSha256(localPath);
      const valid = calculated.toLowerCase() === item.expectedSha256.toLowerCase();
      return {
        modelId,
        valid,
        expectedSha256: item.expectedSha256,
        calculatedSha256: calculated,
        ...(valid ? {} : { error: `SHA-256 verification mismatch for ${modelId}` }),
      };
    } catch (err) {
      return {
        modelId,
        valid: false,
        expectedSha256: item.expectedSha256,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Deletes a model from the local cache directory.
   */
  async deleteModel(modelId: string): Promise<ModelDeleteResponse> {
    this.cancelDownload(modelId);

    const item = this.catalog.get(modelId);
    if (!item) {
      return { modelId, deleted: false, message: `Model "${modelId}" not found in catalog` };
    }

    const localPath = this.resolveLocalModelPath(item);
    const partPath = `${localPath}.part`;

    let deletedAny = false;
    if (existsSync(localPath)) {
      try {
        unlinkSync(localPath);
        deletedAny = true;
      } catch (err) {
        return { modelId, deleted: false, message: err instanceof Error ? err.message : String(err) };
      }
    }

    if (existsSync(partPath)) {
      try {
        unlinkSync(partPath);
        deletedAny = true;
      } catch {
        // Ignore part deletion error
      }
    }

    this.emit('model-deleted', modelId);
    return {
      modelId,
      deleted: deletedAny,
      message: deletedAny ? `Model "${modelId}" deleted successfully` : 'Model file was not on disk',
    };
  }

  /**
   * Cancels an active download, preserving the .part file for later resume.
   */
  cancelDownload(modelId: string): boolean {
    const active = this.activeDownloads.get(modelId);
    if (!active) return false;

    active.abortController.abort();
    active.progress.status = 'idle';
    active.progress.speedBytesPerSec = 0;
    this.activeDownloads.delete(modelId);

    this.emit('model-download-cancelled', modelId);
    return true;
  }

  /**
   * Downloads a model with resumable HTTP Range, disk space pre-check,
   * progress tracking, and SHA-256 verification.
   */
  async downloadModel(
    request: ModelDownloadRequest,
    onProgress?: (progress: ModelDownloadProgress) => void
  ): Promise<ModelDownloadProgress> {
    const item = this.catalog.get(request.modelId);
    if (!item) {
      throw new Error(`Model "${request.modelId}" is not defined in the catalog`);
    }

    const destPath = this.resolveLocalModelPath(item);
    const destDir = dirname(destPath);
    mkdirSync(destDir, { recursive: true });

    // If destination already exists and force is not set, verify checksum
    if (existsSync(destPath) && !request.forceRedownload) {
      const verification = await this.verifyModel(item.id);
      if (verification.valid) {
        const stats = statSync(destPath);
        const progress: ModelDownloadProgress = {
          modelId: item.id,
          status: 'installed',
          bytesDownloaded: stats.size,
          totalBytes: stats.size,
          percent: 100,
          speedBytesPerSec: 0,
          localPath: destPath,
        };
        onProgress?.(progress);
        return progress;
      } else {
        // Damaged file; delete and redownload
        try {
          unlinkSync(destPath);
        } catch {
          // Fall through
        }
      }
    }

    // Cancel any existing active download for this model
    this.cancelDownload(item.id);

    const partPath = `${destPath}.part`;
    let startByte = 0;
    if (existsSync(partPath) && !request.forceRedownload) {
      try {
        startByte = statSync(partPath).size;
      } catch {
        startByte = 0;
      }
    } else if (existsSync(partPath) && request.forceRedownload) {
      try {
        unlinkSync(partPath);
      } catch {
        // Fall through
      }
    }

    const abortController = new AbortController();
    const progress: ModelDownloadProgress = {
      modelId: item.id,
      status: 'downloading',
      bytesDownloaded: startByte,
      totalBytes: item.sizeBytes,
      percent: item.sizeBytes > 0 ? Math.min(100, Number(((startByte / item.sizeBytes) * 100).toFixed(1))) : 0,
      speedBytesPerSec: 0,
      localPath: destPath,
    };

    this.activeDownloads.set(item.id, { progress, abortController });
    this.emit('model-download-started', item.id, progress);
    onProgress?.(progress);

    try {
      const headers: Record<string, string> = {};
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
      }

      let response = await this.customFetch(item.sourceUrl, {
        headers,
        signal: abortController.signal,
      });

      // Handle 416 (Range Not Satisfiable): part is corrupted or server does not accept range
      if (response.status === 416) {
        if (existsSync(partPath)) {
          try {
            unlinkSync(partPath);
          } catch {
            // Ignore
          }
        }
        startByte = 0;
        delete headers['Range'];
        response = await this.customFetch(item.sourceUrl, {
          headers,
          signal: abortController.signal,
        });
      }

      if (!response.ok) {
        throw new Error(`Download failed with HTTP ${response.status}: ${response.statusText}`);
      }

      const isResumed = response.status === 206;
      if (!isResumed && startByte > 0) {
        startByte = 0;
      }

      const contentLengthHeader = response.headers.get('content-length');
      const totalBytes = contentLengthHeader
        ? parseInt(contentLengthHeader, 10) + startByte
        : item.sizeBytes;

      progress.totalBytes = totalBytes;

      // Pre-check free disk space
      const remainingBytes = Math.max(0, totalBytes - startByte);
      checkFreeDiskSpace(destPath, remainingBytes, this.safetyMarginBytes);

      // Stream into .part file
      const fileStream = createWriteStream(partPath, { flags: isResumed ? 'a' : 'w' });

      let downloadedBytes = startByte;
      let lastReportTime = Date.now();
      let lastReportBytes = startByte;

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Convert response.body (ReadableStream) to chunks
      const reader = response.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value && value.length > 0) {
            fileStream.write(Buffer.from(value));
            downloadedBytes += value.length;

            const now = Date.now();
            const elapsedMs = now - lastReportTime;
            if (elapsedMs >= 200 || downloadedBytes >= totalBytes) {
              const speed = elapsedMs > 0 ? ((downloadedBytes - lastReportBytes) / elapsedMs) * 1000 : 0;
              progress.bytesDownloaded = downloadedBytes;
              progress.percent = totalBytes > 0
                ? Math.min(100, Number(((downloadedBytes / totalBytes) * 100).toFixed(1)))
                : 0;
              progress.speedBytesPerSec = Math.round(speed);

              lastReportTime = now;
              lastReportBytes = downloadedBytes;

              this.emit('model-download-progress', item.id, progress);
              onProgress?.(progress);
            }
          }
        }
      } finally {
        fileStream.end();
        await new Promise<void>(resolve => {
          fileStream.on('finish', () => resolve());
        });
      }

      // Verify SHA-256 checksum
      progress.status = 'verifying';
      this.emit('model-download-verifying', item.id, progress);
      onProgress?.(progress);

      const calculatedSha = await computeFileSha256(partPath);
      if (calculatedSha.toLowerCase() !== item.expectedSha256.toLowerCase()) {
        try {
          unlinkSync(partPath);
        } catch {
          // Fall through
        }
        throw new Error(
          `SHA-256 verification failed for ${item.id}: expected ${item.expectedSha256.toLowerCase()}, got ${calculatedSha.toLowerCase()}`
        );
      }

      // Atomically move .part to final destination
      if (existsSync(destPath)) {
        try {
          unlinkSync(destPath);
        } catch {
          // Fall through
        }
      }
      renameSync(partPath, destPath);

      progress.status = 'installed';
      progress.bytesDownloaded = totalBytes;
      progress.percent = 100;
      progress.speedBytesPerSec = 0;
      this.activeDownloads.delete(item.id);

      this.emit('model-download-completed', item.id, progress);
      onProgress?.(progress);

      return progress;
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        progress.status = 'idle';
        progress.speedBytesPerSec = 0;
        this.activeDownloads.delete(item.id);
        return progress;
      }

      progress.status = 'error';
      progress.error = err instanceof Error ? err.message : String(err);
      progress.speedBytesPerSec = 0;
      this.activeDownloads.delete(item.id);

      this.emit('model-download-failed', item.id, progress.error);
      onProgress?.(progress);
      throw err;
    }
  }
}
