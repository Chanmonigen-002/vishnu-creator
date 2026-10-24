import type {
  VishnuCreatorStorageSettingsResponse,
  UpdateVishnuCreatorStorageSettingsRequest,
  VishnuCreatorUiSettingsResponse,
  UpdateVishnuCreatorUiSettingsRequest
} from '@vishnucreator/protocol';
import type { RuntimeClient } from '../runtime/client.js';

type ClientLike = Pick<RuntimeClient, 'get' | 'patch'>;

export function createVishnuCreatorSettingsService(client: ClientLike) {
  return {
    getUiSettings(): Promise<VishnuCreatorUiSettingsResponse> {
      return client.get('/settings/ui');
    },
    updateUiSettings(
      update: UpdateVishnuCreatorUiSettingsRequest
    ): Promise<VishnuCreatorUiSettingsResponse> {
      return client.patch('/settings/ui', update);
    },
    getStorageSettings(): Promise<VishnuCreatorStorageSettingsResponse> {
      return client.get('/settings/storage');
    },
    updateStorageSettings(
      update: UpdateVishnuCreatorStorageSettingsRequest
    ): Promise<VishnuCreatorStorageSettingsResponse> {
      return client.patch('/settings/storage', update);
    }
  };
}

export type VishnuCreatorSettingsService =
  ReturnType<typeof createVishnuCreatorSettingsService>;
