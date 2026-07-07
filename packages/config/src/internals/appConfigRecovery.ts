import type { JsonObject } from "@cycle/contracts/schemas";
import { Config, ConfigProvider, Effect, Schema } from "effect";
import { isAgentProviderId, supportedAgentProviders } from "../AgentProviders.ts";
import { AppConfigError } from "../AppConfigError.ts";
import {
  AgentProvidersConfig,
  ApiConfig,
  type AppConfigState,
  InterfaceDensity,
  LocalWorkspaceConfig,
  OnboardingConfig,
  ProfileConfig,
  RepositoryCommitStyle,
  type RepositoryPreferences,
  type RepositoryRecord,
  type ThemeConfig,
  ThemePreference,
  defaultAgentProviderPreference,
  defaultApiConfig,
  defaultAppConfig,
  defaultRepositoryPreferences,
} from "../AppConfigSchema.ts";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

export const salvageAppConfig = (raw: unknown): Effect.Effect<AppConfigState, AppConfigError> =>
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
