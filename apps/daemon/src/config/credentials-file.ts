import {
  readPrivateJsonFile,
  writePrivateJsonFile
} from './private-json-file.js';

export type VishnuCreatorCredentialsDocument = {
  version: 1;
  creatorServices?: Record<string, string>;
  codexProvider?: {
    apiKey: string;
    baseUrl?: string;
  };
};

const updateQueues = new Map<string, Promise<void>>();

export async function readVishnuCreatorCredentials(
  path: string
): Promise<VishnuCreatorCredentialsDocument> {
  const value = await readPrivateJsonFile(path);
  if (!isRecord(value) || value.version !== 1) return { version: 1 };
  return {
    version: 1,
    ...(isStringRecord(value.creatorServices)
      ? { creatorServices: value.creatorServices }
      : {}),
    ...(isRecord(value.codexProvider) && typeof value.codexProvider.apiKey === 'string'
      ? { codexProvider: {
          apiKey: value.codexProvider.apiKey,
          ...(typeof value.codexProvider.baseUrl === 'string'
            ? { baseUrl: value.codexProvider.baseUrl }
            : {})
        } }
      : {})
  };
}

export function updateVishnuCreatorCredentials(
  path: string,
  update: (
    document: VishnuCreatorCredentialsDocument
  ) => VishnuCreatorCredentialsDocument
): Promise<VishnuCreatorCredentialsDocument> {
  let result: VishnuCreatorCredentialsDocument | undefined;
  const queued = (updateQueues.get(path) ?? Promise.resolve())
    .then(async () => {
      result = update(await readVishnuCreatorCredentials(path));
      await writePrivateJsonFile(path, result);
    });
  updateQueues.set(path, queued.then(() => undefined, () => undefined));
  return queued.then(() => result!);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value)
    && Object.values(value).every(candidate => typeof candidate === 'string');
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
