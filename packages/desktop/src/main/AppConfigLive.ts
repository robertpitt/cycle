import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Config, ConfigProvider, Effect, Layer, Schema } from "effect";
import {
  ApiConfig,
  AppConfig,
  AppConfigError,
  AppConfigState,
  AgentProvidersConfig,
  CURRENT_APP_CONFIG_SCHEMA_VERSION,
  DEFAULT_API_PORT,
  LocalWorkspaceConfig,
  OnboardingConfig,
  ProfileConfig,
  RepositoryRecord,
  ThemeConfig,
  appConfigError,
  defaultAppConfig,
  defaultApiConfig,
  defaultRepositoryPreferences,
  parseAppConfig,
  type ApiConfig as ApiConfigType,
  type AgentProvidersConfig as AgentProvidersConfigType,
  type LocalWorkspaceConfig as LocalWorkspaceConfigType,
  type OnboardingConfig as OnboardingConfigType,
  type ProfileConfig as ProfileConfigType,
  type RepositoryRecord as RepositoryRecordType,
  type ThemeConfig as ThemeConfigType,
} from "../shared/AppConfig.ts";
import { cycleAppConfigFileName, cycleAppConfigPath } from "./CycleDirectory.ts";

const isNodeError = (cause: unknown): cause is NodeJS.ErrnoException =>
  cause instanceof Error && "code" in cause;

const isMissingFileError = (cause: unknown): boolean =>
  isNodeError(cause) && cause.code === "ENOENT";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const generateStaticToken = (): string => randomBytes(32).toString("base64url");

const ensureApiDefaults = (
  config: AppConfigState,
): { readonly shouldWrite: boolean; readonly value: AppConfigState } => {
  let shouldWrite = false;
  let value = config;

  if (value.api.staticToken.trim().length === 0) {
    shouldWrite = true;
    value = {
      ...value,
      api: {
        ...value.api,
        staticToken: generateStaticToken(),
      },
    };
  }

  if (value.api.port === "auto") {
    shouldWrite = true;
    value = {
      ...value,
      api: {
        ...value.api,
        port: DEFAULT_API_PORT,
      },
    };
  }

  return { shouldWrite, value };
};

const backupName = (kind: "invalid" | "unsupported"): string => {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return `app-config.${kind}-${stamp}.json`;
};

const parseSection = <A>(
  schema: Schema.Codec<A>,
  value: unknown,
): Effect.Effect<A, AppConfigError> =>
  Config.schema(schema)
    .parse(ConfigProvider.fromUnknown(value))
    .pipe(
      Effect.mapError((cause) =>
        appConfigError("AppConfig.parseSection", "App config section is invalid.", cause),
      ),
    );

const readConfigText = (configPath: string): Effect.Effect<string | undefined, AppConfigError> =>
  Effect.tryPromise({
    try: () => readFile(configPath, "utf8"),
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      isMissingFileError(cause)
        ? Effect.succeed(undefined)
        : Effect.fail(appConfigError("AppConfig.readFile", "Unable to read app config.", cause)),
    ),
  );

const backupConfigFile = (
  configPath: string,
  kind: "invalid" | "unsupported",
): Effect.Effect<void, AppConfigError> =>
  Effect.tryPromise({
    try: async () => {
      await rename(configPath, join(dirname(configPath), backupName(kind)));
    },
    catch: (cause) => appConfigError("AppConfig.backup", "Unable to back up app config.", cause),
  });

const writeValidatedConfig = (
  configPath: string,
  next: AppConfigState,
): Effect.Effect<AppConfigState, AppConfigError> =>
  Effect.gen(function* () {
    const validated = yield* parseAppConfig(next);
    const directory = dirname(configPath);
    const temporaryPath = join(
      directory,
      `${cycleAppConfigFileName}.${process.pid}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}.tmp`,
    );
    const serialized = `${JSON.stringify(validated, null, 2)}\n`;

    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(directory, { recursive: true });
        await writeFile(temporaryPath, serialized, "utf8");
        await rename(temporaryPath, configPath);
      },
      catch: (cause) => appConfigError("AppConfig.writeFile", "Unable to write app config.", cause),
    });

    return validated;
  });

const withVersion = (raw: unknown): { readonly shouldWrite: boolean; readonly value: unknown } => {
  if (!isRecord(raw)) return { shouldWrite: true, value: defaultAppConfig() };
  if (raw.schemaVersion === CURRENT_APP_CONFIG_SCHEMA_VERSION) {
    return { shouldWrite: false, value: raw };
  }
  return {
    shouldWrite: true,
    value: {
      ...raw,
      schemaVersion: CURRENT_APP_CONFIG_SCHEMA_VERSION,
    },
  };
};

const salvageRepositories = (
  value: unknown,
): Effect.Effect<ReadonlyArray<RepositoryRecordType>, AppConfigError> =>
  Effect.gen(function* () {
    if (!Array.isArray(value)) return [];

    const repositories: Array<RepositoryRecordType> = [];
    const seenPaths = new Set<string>();

    for (const candidate of value) {
      const preferences =
        isRecord(candidate) && isRecord(candidate.preferences) ? candidate.preferences : {};
      const defaults = defaultRepositoryPreferences();
      const repositoryCandidate = isRecord(candidate)
        ? {
            ...candidate,
            preferences: {
              autoSync:
                typeof preferences.autoSync === "boolean"
                  ? preferences.autoSync
                  : defaults.autoSync,
              commitStyle:
                preferences.commitStyle === "compact" || preferences.commitStyle === "descriptive"
                  ? preferences.commitStyle
                  : defaults.commitStyle,
              sidebarExpanded:
                typeof preferences.sidebarExpanded === "boolean"
                  ? preferences.sidebarExpanded
                  : defaults.sidebarExpanded,
            },
          }
        : candidate;
      const parsed = yield* parseSection(RepositoryRecord, repositoryCandidate).pipe(
        Effect.catch(() => Effect.succeed(null)),
      );
      if (parsed === null || seenPaths.has(parsed.path)) continue;
      repositories.push(parsed);
      seenPaths.add(parsed.path);
    }

    return repositories;
  });

const salvageLocalWorkspace = (
  value: unknown,
  fallback: LocalWorkspaceConfigType,
): Effect.Effect<LocalWorkspaceConfigType, AppConfigError> =>
  parseSection(LocalWorkspaceConfig, value).pipe(
    Effect.catch(() =>
      Effect.gen(function* () {
        if (!isRecord(value)) return fallback;
        return {
          repositories: yield* salvageRepositories(value.repositories),
        };
      }),
    ),
  );

const salvageAppConfig = (raw: unknown): Effect.Effect<AppConfigState, AppConfigError> =>
  Effect.gen(function* () {
    const defaults = defaultAppConfig();
    if (!isRecord(raw)) return defaults;

    const onboarding = yield* parseSection(OnboardingConfig, raw.onboarding).pipe(
      Effect.catch(() => Effect.succeed(defaults.onboarding as OnboardingConfigType)),
    );
    const agentProviders = yield* parseSection(AgentProvidersConfig, raw.agentProviders).pipe(
      Effect.catch(() => Effect.succeed(defaults.agentProviders as AgentProvidersConfigType)),
    );
    const profile = yield* parseSection(ProfileConfig, raw.profile).pipe(
      Effect.catch(() => Effect.succeed(defaults.profile as ProfileConfigType)),
    );
    const api = yield* parseSection(ApiConfig, raw.api).pipe(
      Effect.catch(() => Effect.succeed(defaultApiConfig() as ApiConfigType)),
    );
    const theme = yield* parseSection(ThemeConfig, raw.theme).pipe(
      Effect.catch(() => Effect.succeed(defaults.theme as ThemeConfigType)),
    );
    const localWorkspace = yield* salvageLocalWorkspace(
      raw.localWorkspace,
      defaults.localWorkspace,
    );

    return {
      agentProviders,
      api,
      localWorkspace,
      onboarding,
      profile,
      schemaVersion: CURRENT_APP_CONFIG_SCHEMA_VERSION,
      theme,
    };
  });

const readJsonConfig = (text: string): Effect.Effect<unknown, AppConfigError> =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: (cause) => appConfigError("AppConfig.parseJson", "App config is not valid JSON.", cause),
  });

const readOrRecoverConfig = (configPath: string): Effect.Effect<AppConfigState, AppConfigError> =>
  Effect.gen(function* () {
    const text = yield* readConfigText(configPath);
    if (text === undefined) {
      return yield* writeValidatedConfig(configPath, ensureApiDefaults(defaultAppConfig()).value);
    }

    const raw = yield* readJsonConfig(text).pipe(
      Effect.catch(() =>
        backupConfigFile(configPath, "invalid").pipe(
          Effect.andThen(
            writeValidatedConfig(configPath, ensureApiDefaults(defaultAppConfig()).value),
          ),
        ),
      ),
    );

    if (
      isRecord(raw) &&
      typeof raw.schemaVersion === "number" &&
      raw.schemaVersion > CURRENT_APP_CONFIG_SCHEMA_VERSION
    ) {
      return yield* backupConfigFile(configPath, "unsupported").pipe(
        Effect.andThen(
          writeValidatedConfig(configPath, ensureApiDefaults(defaultAppConfig()).value),
        ),
      );
    }

    const migrated = withVersion(raw);
    const parsed = yield* parseAppConfig(migrated.value).pipe(
      Effect.catch(() =>
        salvageAppConfig(migrated.value).pipe(
          Effect.flatMap((salvaged) => writeValidatedConfig(configPath, salvaged)),
        ),
      ),
    );

    const withApiDefaults = ensureApiDefaults(parsed);
    if (migrated.shouldWrite || withApiDefaults.shouldWrite) {
      return yield* writeValidatedConfig(configPath, withApiDefaults.value);
    }
    return withApiDefaults.value;
  });

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const resolvedConfigPath = yield* cycleAppConfigPath;

    const read = (): Effect.Effect<AppConfigState, AppConfigError> =>
      readOrRecoverConfig(resolvedConfigPath);

    const replace = (next: AppConfigState): Effect.Effect<AppConfigState, AppConfigError> =>
      writeValidatedConfig(resolvedConfigPath, next);

    const update = (
      mutator: (current: AppConfigState) => AppConfigState,
    ): Effect.Effect<AppConfigState, AppConfigError> =>
      Effect.gen(function* () {
        const current = yield* read();
        const next = yield* Effect.try({
          try: () => mutator(current),
          catch: (cause) =>
            appConfigError("AppConfig.update", "Unable to update app config.", cause),
        });
        return yield* replace(next);
      });

    return {
      configPath: Effect.succeed(resolvedConfigPath),
      getThemePreference: () => read().pipe(Effect.map((config) => config.theme.preference)),
      read,
      replace,
      setThemePreference: (preference) =>
        update((current) => ({
          ...current,
          theme: {
            preference,
          },
        })),
      update,
    };
  }),
);
