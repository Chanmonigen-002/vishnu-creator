import { dirname, join, resolve } from 'node:path';
import {
  resolveVishnuCreatorPaths,
  type VishnuCreatorRuntimeChannel
} from '@vishnucreator/config';
import type { BuildServerInput } from './api/server.js';
import type {
  ScheduleBindingRepairResult,
  ScheduleCoordinator
} from './scheduler/coordinator.js';

type ProductionPathEnvironment = Pick<
  BuildServerInput,
  | 'appHome'
  | 'dataDir'
  | 'configFile'
  | 'credentialsFile'
  | 'runtimeDir'
  | 'creatorDir'
  | 'codexHome'
>;

export type ProductionRuntimePaths = {
  appHome: string;
  dataDir: string;
  configFile: string;
  credentialsFile: string;
  runtimeDir: string;
  creatorDir: string;
  codexHome: string;
};

export function requiresPaidStartupProbe(env: NodeJS.ProcessEnv = process.env): boolean {
  // Desktop readiness checks alone must not trigger billable model inference.
  return env.VISHNUCREATOR_REQUIRE_CODEX_PROBE === '1'
    && env.VISHNUCREATOR_ENABLE_PAID_STARTUP_PROBE === '1'
    && env.VISHNUCREATOR_CODEX_PROBE_VERIFIED !== '1';
}

export function resolveProductionServerEnvironment(
  env: NodeJS.ProcessEnv = process.env
): Pick<
  BuildServerInput,
  | 'appHome'
  | 'dataDir'
  | 'configFile'
  | 'credentialsFile'
  | 'runtimeDir'
  | 'creatorDir'
  | 'codexBin'
  | 'codexHome'
  | 'localCodexHome'
  | 'defaultCwd'
  | 'defaultProjectRoot'
  | 'creatorYtDlpPath'
  | 'gatewayOrigin'
> {
  return {
    gatewayOrigin: env.VISHNUCREATOR_GATEWAY_ORIGIN?.trim() || 'https://www.vishnu-creator.ai',
    ...optionalEnvironmentValue('appHome', env.VISHNUCREATOR_HOME),
    ...optionalEnvironmentValue('dataDir', env.VISHNUCREATOR_DATA_DIR),
    ...optionalEnvironmentValue('configFile', env.VISHNUCREATOR_CONFIG_FILE),
    ...optionalEnvironmentValue('credentialsFile', env.VISHNUCREATOR_CREDENTIALS_FILE),
    ...optionalEnvironmentValue('runtimeDir', env.VISHNUCREATOR_RUNTIME_DIR),
    ...optionalEnvironmentValue('creatorDir', env.VISHNUCREATOR_CREATOR_DIR),
    ...optionalEnvironmentValue('codexBin', env.VISHNUCREATOR_CODEX_BIN),
    ...optionalEnvironmentValue(
      'codexHome',
      env.CODEX_HOME ?? env.VISHNUCREATOR_CODEX_HOME
    ),
    ...optionalEnvironmentValue('localCodexHome', env.VISHNUCREATOR_LOCAL_CODEX_HOME),
    ...optionalEnvironmentValue('defaultCwd', env.VISHNUCREATOR_DEFAULT_CWD),
    ...optionalEnvironmentValue(
      'defaultProjectRoot',
      env.VISHNUCREATOR_DEFAULT_PROJECT_ROOT
    ),
    ...optionalEnvironmentValue(
      'creatorYtDlpPath',
      env.VISHNUCREATOR_YT_DLP_PATH
    )
  };
}

export function createProductionServerInput(
  input: Omit<BuildServerInput, 'schedulerAutostart'>
): BuildServerInput {
  return {
    ...input,
    schedulerAutostart: true,
    agentToolsEnabled: true,
    persistentAppServerEnabled: input.persistentAppServerEnabled ?? true
  };
}

export function resolveProductionRuntimePaths(
  environment: ProductionPathEnvironment,
  input: {
    homeDir?: string;
    runtimeChannel?: VishnuCreatorRuntimeChannel;
  } = {}
): ProductionRuntimePaths {
  const defaults = resolveVishnuCreatorPaths({
    env: {},
    ...(input.homeDir === undefined ? {} : { homeDir: input.homeDir }),
    ...(input.runtimeChannel === undefined
      ? {}
      : { runtimeChannel: input.runtimeChannel })
  });
  const configuredDataDir = environment.dataDir === undefined
    ? undefined
    : resolve(environment.dataDir);
  const appHome = resolve(
    environment.appHome
      ?? (configuredDataDir === undefined ? defaults.root : dirname(configuredDataDir))
  );
  const dataDir = configuredDataDir ?? join(appHome, 'data');
  const runtimeDir = resolve(environment.runtimeDir ?? join(appHome, 'runtime'));
  return {
    appHome,
    dataDir,
    configFile: resolve(environment.configFile ?? join(appHome, 'config.toml')),
    credentialsFile: resolve(
      environment.credentialsFile ?? join(appHome, 'credentials.json')
    ),
    runtimeDir,
    creatorDir: resolve(environment.creatorDir ?? join(appHome, 'creator')),
    codexHome: resolve(environment.codexHome ?? join(runtimeDir, 'codex'))
  };
}

export function parseRuntimeChannel(
  value: string | undefined
): VishnuCreatorRuntimeChannel {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0 || normalized === 'production') {
    return 'production';
  }
  if (normalized === 'development') return 'development';
  throw new Error(`Unsupported VishnuCreator Runtime channel: ${normalized}`);
}

export function prepareSchedulerStartup(input: {
  coordinator: Pick<ScheduleCoordinator, 'ensureBindings'>;
  classifySessions?(): void;
}): ScheduleBindingRepairResult {
  const result = input.coordinator.ensureBindings();
  input.classifySessions?.();
  return result;
}

function optionalEnvironmentValue<Key extends keyof BuildServerInput>(
  key: Key,
  value: string | undefined
): Partial<Record<Key, string>> {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? {}
    : { [key]: normalized } as Record<Key, string>;
}
