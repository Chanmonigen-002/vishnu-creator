import {
  readVishnuCreatorConfig,
  resolveStorageSettings,
  resolveUiSettings,
  updateVishnuCreatorStorageSettings,
  updateVishnuCreatorUiSettings
} from '@vishnucreator/config';
import type {
  VishnuCreatorStorageSettings,
  VishnuCreatorStorageSettingsResponse,
  VishnuCreatorUiSettingsResponse,
  UpdateVishnuCreatorStorageSettingsRequest,
  UpdateVishnuCreatorUiSettingsRequest
} from '@vishnucreator/protocol';

export type VishnuCreatorSettingsStore = ReturnType<typeof createVishnuCreatorSettingsStore>;

export function createVishnuCreatorSettingsStore(
  configFile: string,
  storageDefaults: VishnuCreatorStorageSettings
) {
  return {
    readUi(): VishnuCreatorUiSettingsResponse {
      const snapshot = readVishnuCreatorConfig(configFile);
      return {
        settings: resolveUiSettings(snapshot),
        configured: snapshot.configured.ui
      };
    },
    updateUi(update: UpdateVishnuCreatorUiSettingsRequest): VishnuCreatorUiSettingsResponse {
      const snapshot = updateVishnuCreatorUiSettings(configFile, update);
      return {
        settings: resolveUiSettings(snapshot),
        configured: true
      };
    },
    readStorage(): VishnuCreatorStorageSettingsResponse {
      const snapshot = readVishnuCreatorConfig(configFile);
      return {
        settings: resolveStorageSettings(snapshot, storageDefaults),
        configured: snapshot.configured.storage
      };
    },
    updateStorage(
      update: UpdateVishnuCreatorStorageSettingsRequest
    ): VishnuCreatorStorageSettingsResponse {
      const current = resolveStorageSettings(readVishnuCreatorConfig(configFile), storageDefaults);
      const snapshot = updateVishnuCreatorStorageSettings(configFile, { ...current, ...update });
      return {
        settings: resolveStorageSettings(snapshot, storageDefaults),
        configured: true
      };
    }
  };
}
