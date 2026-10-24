import type { CreatorServicesConfig } from '@vishnucreator/protocol';
import {
  readVishnuRuntimeManifest,
  verifyVishnuRuntimeManifest
} from './manifest.js';

export function preflightVishnuDependencies(
  resourceRoot: string,
  config: CreatorServicesConfig,
  input: { cachePath?: string } = {}
) {
  const manifest = readVishnuRuntimeManifest(resourceRoot);
  verifyVishnuRuntimeManifest(resourceRoot, manifest, {
    cachePath: input.cachePath
  });
  return {
    manifest,
    config
  };
}
