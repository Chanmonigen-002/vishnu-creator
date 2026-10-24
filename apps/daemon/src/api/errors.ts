import type { ApiError, VishnuCreatorIssue, PublicErrorFacts, RuntimeErrorCode } from '@vishnucreator/protocol';

export function apiError(
  code: RuntimeErrorCode,
  message: string,
  details?: Record<string, unknown>,
  issue?: VishnuCreatorIssue,
  publicFacts?: PublicErrorFacts
): ApiError {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(issue !== undefined ? { issue } : {}),
      ...(publicFacts !== undefined ? { publicFacts } : {})
    }
  };
}
