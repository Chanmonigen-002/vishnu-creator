import type {
  CodexMcpListResponse,
  CodexProfileListResponse,
  CodexSkillListResponse
} from '@vishnucreator/protocol';
import type { RuntimeClient } from '../runtime/client.js';

export type { CodexProfileListResponse } from '@vishnucreator/protocol';

export function createCapabilityService(client: RuntimeClient) {
  return {
    listSkills(): Promise<CodexSkillListResponse> {
      return client.get('/codex/skills');
    },
    listMcp(): Promise<CodexMcpListResponse> {
      return client.get('/codex/mcp');
    },
    listProfiles(): Promise<CodexProfileListResponse> {
      return client.get('/codex/profiles');
    }
  };
}
