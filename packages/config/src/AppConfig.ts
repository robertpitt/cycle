import { JsonObject } from "@cycle/contracts/schemas";
import {
  Config,
  ConfigProvider,
  Context,
  Crypto,
  Effect,
  Encoding,
  FileSystem,
  Layer,
  Path,
  Schema,
} from "effect";
import { isAgentProviderId, supportedAgentProviders } from "./AgentProviders.ts";
import { AppConfigError } from "./AppConfigError.ts";
import {
  AgentProvidersConfig,
  ApiConfig,
  AppConfigState,
  DEFAULT_API_PORT,
  InterfaceDensity,
  LocalWorkspaceConfig,
  OnboardingConfig,
  ProfileConfig,
  RepositoryCommitStyle,
  RepositoryPreferences,
  RepositoryRecord,
  ThemeConfig,
  ThemePreference,
  defaultAgentProviderPreference,
  defaultApiConfig,
  defaultAppConfig,
  defaultRepositoryPreferences,
  parseAppConfig,
} from "./AppConfigSchema.ts";

export * from "./AppConfigSchema.ts";
export { AppConfigError } from "./AppConfigError.ts";

const cycleAppConfigFileName = "app-config.json";

export type AppConfigService = {
  readonly configPath: Effect.Effect<string, AppConfigError>;
  readonly getThemePreference: () => Effect.Effect<ThemePreference, AppConfigError>;
  readonly read: () => Effect.Effect<AppConfigState, AppConfigError>;
  readonly replace: (next: AppConfigState) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly setThemePreference: (
    preference: ThemePreference,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly setInterfaceDensity: (
    density: InterfaceDensity,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly update: (
    mutator: (current: AppConfigState) => AppConfigState,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
};

export class AppConfig extends Context.Service<AppConfig, AppConfigService>()(
  "@cycle/config/AppConfig",
) {}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
    return Encoding.encodeBase64Url(bytes);
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

const defaultRepositoryPreferenceValues = defaultRepositoryPreferences();

const RepositoryPreferencesRecovery = Schema.Struct({
  autoSync: Schema.Boolean.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultRepositoryPreferenceValues.autoSync)),
  ),
  commitStyle: RepositoryCommitStyle.pipe(
    Schema.withDecodingDefaultTypeKey(
      Effect.succeed(defaultRepositoryPreferenceValues.commitStyle),
    ),
  ),
  sidebarExpanded: Schema.Boolean.pipe(
    Schema.withDecodingDefaultTypeKey(
      Effect.succeed(defaultRepositoryPreferenceValues.sidebarExpanded),
    ),
  ),
});

const RepositoryRecordRecovery = Schema.Struct({
  addedAt: Schema.String,
  displayName: Schema.String,
  gitDbRootCommitId: Schema.optional(Schema.String),
  id: Schema.String,
  lastOpenedAt: Schema.optional(Schema.String),
  path: Schema.String,
  preferences: RepositoryPreferencesRecovery.pipe(
    Schema.withDecodingDefaultTypeKey(
      Effect.succeed(defaultRepositoryPreferenceValues as RepositoryPreferences),
    ),
  ),
});

const ThemeConfigRecovery = Schema.Struct({
  density: InterfaceDensity.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultAppConfig().theme.density)),
  ),
  preference: ThemePreference.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultAppConfig().theme.preference)),
  ),
});

const backupConfigFile = (
  configPath: string,
  kind: "invalid",
): Effect.Effect<void, AppConfigError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const backupName = `app-config.${kind}-${stamp}.json`;

    yield* fs.rename(configPath, path.join(path.dirname(configPath), backupName)).pipe(
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
      `${cycleAppConfigFileName}.${globalThis.process?.pid ?? "runtime"}.${Date.now()}.${Math.random()
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

const salvageRepositories = (
  value: unknown,
): Effect.Effect<ReadonlyArray<RepositoryRecord>, AppConfigError> =>
  Effect.gen(function* () {
    if (!Array.isArray(value)) return [];

    const repositories: Array<RepositoryRecord> = [];
    const seenPaths = new Set<string>();

    for (const candidate of value) {
      const parsed = yield* parseSection(RepositoryRecordRecovery, candidate).pipe(
        Effect.catch(() => Effect.succeed(null)),
      );
      if (parsed === null || seenPaths.has(parsed.path)) continue;
      repositories.push(parsed as RepositoryRecord);
      seenPaths.add(parsed.path);
    }

    return repositories;
  });

const salvageLocalWorkspace = (
  value: unknown,
  fallback: LocalWorkspaceConfig,
): Effect.Effect<LocalWorkspaceConfig, AppConfigError> =>
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
  fallback: AgentProvidersConfig,
): Effect.Effect<AgentProvidersConfig, AppConfigError> =>
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
      Effect.catch(() => Effect.succeed(defaults.onboarding as OnboardingConfig)),
    );
    const agentProviders = yield* salvageAgentProviders(
      raw.agentProviders,
      defaults.agentProviders as AgentProvidersConfig,
    );
    const profile = yield* parseSection(ProfileConfig, raw.profile).pipe(
      Effect.catch(() => Effect.succeed(defaults.profile as ProfileConfig)),
    );
    const api = yield* parseSection(ApiConfig, raw.api).pipe(
      Effect.catch(() => Effect.succeed(defaultApiConfig() as ApiConfig)),
    );
    const theme = (yield* parseSection(ThemeConfigRecovery, raw.theme).pipe(
      Effect.catch(() => Effect.succeed(defaults.theme as ThemeConfig)),
    )) as ThemeConfig;
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
      schemaVersion: defaultAppConfig().schemaVersion,
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

const readOrRecoverConfig = (
  configPath: string,
): Effect.Effect<
  AppConfigState,
  AppConfigError,
  Crypto.Crypto | FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)));

    if (!exists) {
      const defaults = yield* ensureApiDefaults(defaultAppConfig());
      return yield* writeValidatedConfig(configPath, defaults.value);
    }

    const text = yield* fs.readFileString(configPath, "utf8").pipe(
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "Unable to read app config.",
            operation: "AppConfig.readFile",
          }),
      ),
    );
    const raw = yield* Effect.try({
      try: () => JSON.parse(text) as unknown,
      catch: (cause) =>
        new AppConfigError({
          cause,
          message: "App config is not valid JSON.",
          operation: "AppConfig.parseJson",
        }),
    }).pipe(
      Effect.catch(() =>
        Effect.gen(function* () {
          yield* backupConfigFile(configPath, "invalid");
          const defaults = yield* ensureApiDefaults(defaultAppConfig());
          return yield* writeValidatedConfig(configPath, defaults.value);
        }),
      ),
    );

    const parsed = yield* parseAppConfig(raw).pipe(
      Effect.catch(() =>
        salvageAppConfig(raw).pipe(
          Effect.flatMap((salvaged) => writeValidatedConfig(configPath, salvaged)),
        ),
      ),
    );

    const withApiDefaults = yield* ensureApiDefaults(parsed);
    if (withApiDefaults.shouldWrite) {
      return yield* writeValidatedConfig(configPath, withApiDefaults.value);
    }
    return withApiDefaults.value;
  });

const appConfigPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const homeDirectory = yield* Config.string("HOME").pipe(
    Config.withDefault("."),
    Config.map((value) => value.trim() || "."),
  );

  return path.join(homeDirectory, ".cycle", cycleAppConfigFileName);
}).pipe(
  Effect.mapError(
    (cause) =>
      new AppConfigError({
        cause,
        message: "Unable to resolve app config path.",
        operation: "AppConfig.path",
      }),
  ),
);

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedConfigPath = yield* appConfigPath;
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

export const AppConfigTest = (
  initial: AppConfigState = defaultAppConfig(),
): Layer.Layer<AppConfig> => {
  let state = initial;

  return Layer.succeed(
    AppConfig,
    AppConfig.of({
      configPath: Effect.succeed("test-app-config.json"),
      getThemePreference: () => Effect.succeed(state.theme.preference),
      read: () => Effect.succeed(state),
      replace: (next) =>
        Effect.sync(() => {
          state = next;
          return state;
        }),
      setInterfaceDensity: (density) =>
        Effect.sync(() => {
          state = {
            ...state,
            theme: {
              ...state.theme,
              density,
            },
          };
          return state;
        }),
      setThemePreference: (preference) =>
        Effect.sync(() => {
          state = {
            ...state,
            theme: {
              ...state.theme,
              preference,
            },
          };
          return state;
        }),
      update: (mutator) =>
        Effect.sync(() => {
          state = mutator(state);
          return state;
        }),
    }),
  );
};
