import type { JsonObject } from "@cycle/contracts/schemas";
import { Config, ConfigProvider, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";
import {
  ApiConfig,
  AppConfig,
  AppConfigState,
  AgentProvidersConfig,
  CURRENT_APP_CONFIG_SCHEMA_VERSION,
  DEFAULT_API_PORT,
  LocalWorkspaceConfig,
  OnboardingConfig,
  ProfileConfig,
  RepositoryRecord,
  ThemeConfig,
  defaultAgentProviderPreference,
  defaultAppConfig,
  defaultApiConfig,
  defaultRepositoryPreferences,
  AppConfigError,
  parseAppConfig,
  type ApiConfig as ApiConfigType,
  type AgentProvidersConfig as AgentProvidersConfigType,
  type InterfaceDensity,
  type LocalWorkspaceConfig as LocalWorkspaceConfigType,
  type OnboardingConfig as OnboardingConfigType,
  type ProfileConfig as ProfileConfigType,
  type RepositoryRecord as RepositoryRecordType,
  type ThemeConfig as ThemeConfigType,
  type ThemePreference,
} from "../shared/AppConfig.ts";
import { isAgentProviderId, supportedAgentProviders } from "../shared/AgentProviders.ts";
import { cycleAppConfigFileName, cycleAppConfigPath } from "./CycleDirectory.ts";

const isNodeError = (cause: unknown): cause is NodeJS.ErrnoException =>
  cause instanceof Error && "code" in cause;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isMissingFileError = (cause: unknown): boolean =>
  (isNodeError(cause) && cause.code === "ENOENT") ||
  (isRecord(cause) &&
    cause._tag === "PlatformError" &&
    isRecord(cause.reason) &&
    cause.reason._tag === "NotFound");

const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let encoded = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    encoded += base64UrlAlphabet[(chunk >> 18) & 0x3f];
    encoded += base64UrlAlphabet[(chunk >> 12) & 0x3f];
    if (second !== undefined) encoded += base64UrlAlphabet[(chunk >> 6) & 0x3f];
    if (third !== undefined) encoded += base64UrlAlphabet[chunk & 0x3f];
  }

  return encoded;
};

const generateStaticToken = (): Effect.Effect<string, AppConfigError, Crypto.Crypto> =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = yield* crypto.randomBytes(32).pipe(
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "Unable to generate API token.",
            operation: "AppConfig.generateToken",
          }),
      ),
    );
    return bytesToBase64Url(bytes);
  });

const ensureApiDefaults = (
  config: AppConfigState,
): Effect.Effect<
  { readonly shouldWrite: boolean; readonly value: AppConfigState },
  AppConfigError,
  Crypto.Crypto
> =>
  Effect.gen(function* () {
    let shouldWrite = false;
    let value = config;

    if (value.api.staticToken.trim().length === 0) {
      shouldWrite = true;
      const staticToken = yield* generateStaticToken();
      value = {
        ...value,
        api: {
          ...value.api,
          staticToken,
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
  });

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
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "App config section is invalid.",
            operation: "AppConfig.parseSection",
          }),
      ),
    );

const readConfigText = (
  configPath: string,
): Effect.Effect<string | undefined, AppConfigError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(configPath, "utf8");
  }).pipe(
    Effect.catch((cause) =>
      isMissingFileError(cause)
        ? Effect.as(Effect.void, undefined)
        : Effect.fail(
            new AppConfigError({
              cause,
              message: "Unable to read app config.",
              operation: "AppConfig.readFile",
            }),
          ),
    ),
  );

const backupConfigFile = (
  configPath: string,
  kind: "invalid" | "unsupported",
): Effect.Effect<void, AppConfigError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* fs.rename(configPath, path.join(path.dirname(configPath), backupName(kind))).pipe(
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "Unable to back up app config.",
            operation: "AppConfig.backup",
          }),
      ),
    );
  });

const writeValidatedConfig = (
  configPath: string,
  next: AppConfigState,
): Effect.Effect<AppConfigState, AppConfigError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const validated = yield* parseAppConfig(next);
    const directory = path.dirname(configPath);
    const temporaryPath = path.join(
      directory,
      `${cycleAppConfigFileName}.${process.pid}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}.tmp`,
    );
    const serialized = `${JSON.stringify(validated, null, 2)}\n`;

    yield* fs.makeDirectory(directory, { recursive: true }).pipe(
      Effect.andThen(fs.writeFileString(temporaryPath, serialized)),
      Effect.andThen(fs.rename(temporaryPath, configPath)),
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "Unable to write app config.",
            operation: "AppConfig.writeFile",
          }),
      ),
    );

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
          sidebarCollapsed:
            typeof value.sidebarCollapsed === "boolean"
              ? value.sidebarCollapsed
              : fallback.sidebarCollapsed,
        };
      }),
    ),
  );

const salvageTheme = (value: unknown, fallback: ThemeConfigType): ThemeConfigType => {
  if (!isRecord(value)) return fallback;

  const preference: ThemePreference =
    value.preference === "light" || value.preference === "dark" || value.preference === "system"
      ? value.preference
      : fallback.preference;
  const density: InterfaceDensity =
    value.density === "compact" || value.density === "spacious" ? value.density : fallback.density;

  return { density, preference };
};

const normalizeProviderPreferenceCandidate = (candidate: unknown) => {
  if (!isRecord(candidate) || typeof candidate.id !== "string") return undefined;
  if (!isAgentProviderId(candidate.id)) return undefined;

  const fallback = defaultAgentProviderPreference(candidate.id, candidate.enabled === true);
  const maxConcurrentRuns =
    candidate.maxConcurrentRuns === null
      ? null
      : typeof candidate.maxConcurrentRuns === "number" &&
          Number.isInteger(candidate.maxConcurrentRuns) &&
          candidate.maxConcurrentRuns >= 1
        ? candidate.maxConcurrentRuns
        : fallback.maxConcurrentRuns;
  const defaultModel =
    typeof candidate.defaultModel === "string" && candidate.defaultModel.trim().length > 0
      ? candidate.defaultModel.trim()
      : null;
  const executablePath =
    typeof candidate.executablePath === "string" && candidate.executablePath.trim().length > 0
      ? candidate.executablePath.trim()
      : null;
  const config = isJsonObject(candidate.config) ? candidate.config : {};

  return {
    ...fallback,
    config,
    defaultModel,
    enabled: candidate.enabled === true,
    executablePath,
    maxConcurrentRuns,
  };
};

const salvageAgentProviders = (
  value: unknown,
  fallback: AgentProvidersConfigType,
): Effect.Effect<AgentProvidersConfigType, AppConfigError> =>
  parseSection(AgentProvidersConfig, value).pipe(
    Effect.catch(() =>
      Effect.sync(() => {
        if (!isRecord(value) || !Array.isArray(value.preferences)) return fallback;

        const byId = new Map(
          value.preferences
            .map(normalizeProviderPreferenceCandidate)
            .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
            .map((entry) => [entry.id, entry] as const),
        );

        return {
          preferences: supportedAgentProviders
            .map((provider) => byId.get(provider.id))
            .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined),
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
    const agentProviders = yield* salvageAgentProviders(
      raw.agentProviders,
      defaults.agentProviders as AgentProvidersConfigType,
    );
    const profile = yield* parseSection(ProfileConfig, raw.profile).pipe(
      Effect.catch(() => Effect.succeed(defaults.profile as ProfileConfigType)),
    );
    const api = yield* parseSection(ApiConfig, raw.api).pipe(
      Effect.catch(() => Effect.succeed(defaultApiConfig() as ApiConfigType)),
    );
    const theme = yield* parseSection(ThemeConfig, raw.theme).pipe(
      Effect.catch(() => Effect.succeed(salvageTheme(raw.theme, defaults.theme))),
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

const isJsonObject = (value: unknown): value is JsonObject => {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
};

const isJsonValue = (value: unknown): boolean => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
};

const readJsonConfig = (text: string): Effect.Effect<unknown, AppConfigError> =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: (cause) =>
      new AppConfigError({
        cause,
        message: "App config is not valid JSON.",
        operation: "AppConfig.parseJson",
      }),
  });

const readOrRecoverConfig = (
  configPath: string,
): Effect.Effect<
  AppConfigState,
  AppConfigError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const text = yield* readConfigText(configPath);
    if (text === undefined) {
      const defaults = yield* ensureApiDefaults(defaultAppConfig());
      return yield* writeValidatedConfig(configPath, defaults.value);
    }

    const raw = yield* readJsonConfig(text).pipe(
      Effect.catch(() =>
        Effect.gen(function* () {
          yield* backupConfigFile(configPath, "invalid");
          const defaults = yield* ensureApiDefaults(defaultAppConfig());
          return yield* writeValidatedConfig(configPath, defaults.value);
        }),
      ),
    );

    if (
      isRecord(raw) &&
      typeof raw.schemaVersion === "number" &&
      raw.schemaVersion > CURRENT_APP_CONFIG_SCHEMA_VERSION
    ) {
      yield* backupConfigFile(configPath, "unsupported");
      const defaults = yield* ensureApiDefaults(defaultAppConfig());
      return yield* writeValidatedConfig(configPath, defaults.value);
    }

    const migrated = withVersion(raw);
    const parsed = yield* parseAppConfig(migrated.value).pipe(
      Effect.catch(() =>
        salvageAppConfig(migrated.value).pipe(
          Effect.flatMap((salvaged) => writeValidatedConfig(configPath, salvaged)),
        ),
      ),
    );

    const withApiDefaults = yield* ensureApiDefaults(parsed);
    if (migrated.shouldWrite || withApiDefaults.shouldWrite) {
      return yield* writeValidatedConfig(configPath, withApiDefaults.value);
    }
    return withApiDefaults.value;
  });

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedConfigPath = yield* cycleAppConfigPath;
    const providePlatform = <A, E>(
      effect: Effect.Effect<A, E, Crypto.Crypto | FileSystem.FileSystem | Path.Path>,
    ): Effect.Effect<A, E> =>
      effect.pipe(
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );

    const read = (): Effect.Effect<AppConfigState, AppConfigError> =>
      providePlatform(readOrRecoverConfig(resolvedConfigPath));

    const replace = (next: AppConfigState): Effect.Effect<AppConfigState, AppConfigError> =>
      providePlatform(writeValidatedConfig(resolvedConfigPath, next));

    const update = (
      mutator: (current: AppConfigState) => AppConfigState,
    ): Effect.Effect<AppConfigState, AppConfigError> =>
      Effect.gen(function* () {
        const current = yield* read();
        const next = yield* Effect.try({
          try: () => mutator(current),
          catch: (cause) =>
            new AppConfigError({
              cause,
              message: "Unable to update app config.",
              operation: "AppConfig.update",
            }),
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
            ...current.theme,
            preference,
          },
        })),
      setInterfaceDensity: (density) =>
        update((current) => ({
          ...current,
          theme: {
            ...current.theme,
            density,
          },
        })),
      update,
    };
  }),
);
