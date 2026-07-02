import { AgentProviderId, JsonObject } from "@cycle/contracts/schemas";
import { Config, ConfigProvider, Context, Effect, Schema } from "effect";
import { AppConfigError } from "../errors/index.ts";

export { AppConfigError } from "../errors/index.ts";

export const CURRENT_APP_CONFIG_SCHEMA_VERSION = 4;
export const DEFAULT_API_PORT = 4738;
const ApiPort = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(65535),
);
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

export const ThemePreference = Schema.Literals(["light", "dark", "system"]);
export type ThemePreference = typeof ThemePreference.Type;

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

export const InterfaceDensity = Schema.Literals(["compact", "spacious"]);
export type InterfaceDensity = typeof InterfaceDensity.Type;

export const isInterfaceDensity = (value: unknown): value is InterfaceDensity =>
  value === "compact" || value === "spacious";

export const OnboardingConfig = Schema.Struct({
  completed: Schema.Boolean,
  completedAt: Schema.optional(Schema.String),
});
export type OnboardingConfig = typeof OnboardingConfig.Type;

export const ProfileConfig = Schema.Struct({
  displayName: Schema.String,
  email: Schema.String,
});
export type ProfileConfig = typeof ProfileConfig.Type;

export const AgentProviderPreference = Schema.Struct({
  config: Schema.optional(JsonObject),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.Boolean,
  executablePath: Schema.optional(Schema.NullOr(Schema.String)),
  id: AgentProviderId,
  maxConcurrentRuns: Schema.NullOr(PositiveInteger),
});
export type AgentProviderPreference = typeof AgentProviderPreference.Type;

export const AgentProvidersConfig = Schema.Struct({
  preferences: Schema.Array(AgentProviderPreference),
});
export type AgentProvidersConfig = typeof AgentProvidersConfig.Type;

export const ThemeConfig = Schema.Struct({
  density: InterfaceDensity,
  preference: ThemePreference,
});
export type ThemeConfig = typeof ThemeConfig.Type;

export const ApiConfig = Schema.Struct({
  enabled: Schema.Boolean,
  host: Schema.Literals(["127.0.0.1", "localhost"]),
  port: Schema.Union([ApiPort, Schema.Literal("auto")]),
  staticToken: Schema.String,
});
export type ApiConfig = typeof ApiConfig.Type;

export const defaultApiConfig = (): ApiConfig => ({
  enabled: true,
  host: "127.0.0.1",
  port: DEFAULT_API_PORT,
  staticToken: "",
});

export const RepositoryCommitStyle = Schema.Literals(["descriptive", "compact"]);
export type RepositoryCommitStyle = typeof RepositoryCommitStyle.Type;

export const isRepositoryCommitStyle = (value: unknown): value is RepositoryCommitStyle =>
  value === "descriptive" || value === "compact";

export const RepositoryPreferences = Schema.Struct({
  autoSync: Schema.Boolean,
  commitStyle: RepositoryCommitStyle,
  sidebarExpanded: Schema.Boolean,
});
export type RepositoryPreferences = typeof RepositoryPreferences.Type;

export const defaultRepositoryPreferences = (): RepositoryPreferences => ({
  autoSync: true,
  commitStyle: "descriptive",
  sidebarExpanded: true,
});

export const RepositoryRecord = Schema.Struct({
  addedAt: Schema.String,
  displayName: Schema.String,
  gitDbRootCommitId: Schema.optional(Schema.String),
  id: Schema.String,
  lastOpenedAt: Schema.optional(Schema.String),
  path: Schema.String,
  preferences: RepositoryPreferences,
});
export type RepositoryRecord = typeof RepositoryRecord.Type;

export const LocalWorkspaceConfig = Schema.Struct({
  repositories: Schema.Array(RepositoryRecord),
});
export type LocalWorkspaceConfig = typeof LocalWorkspaceConfig.Type;

export const AppConfigState = Schema.Struct({
  agentProviders: AgentProvidersConfig,
  api: ApiConfig,
  localWorkspace: LocalWorkspaceConfig,
  onboarding: OnboardingConfig,
  profile: ProfileConfig,
  schemaVersion: Schema.Literal(CURRENT_APP_CONFIG_SCHEMA_VERSION),
  theme: ThemeConfig,
});
export type AppConfigState = typeof AppConfigState.Type;

export const defaultAppConfig = (): AppConfigState => ({
  agentProviders: {
    preferences: [],
  },
  api: defaultApiConfig(),
  localWorkspace: {
    repositories: [],
  },
  onboarding: {
    completed: false,
  },
  profile: {
    displayName: "",
    email: "",
  },
  schemaVersion: CURRENT_APP_CONFIG_SCHEMA_VERSION,
  theme: {
    density: "compact",
    preference: "system",
  },
});

export const defaultAgentProviderPreference = (
  id: AgentProviderPreference["id"],
  enabled = false,
): AgentProviderPreference => ({
  config: {},
  defaultModel: null,
  enabled,
  executablePath: null,
  id,
  maxConcurrentRuns: 1,
});

export const parseAppConfig = (value: unknown): Effect.Effect<AppConfigState, AppConfigError> =>
  Config.schema(AppConfigState)
    .parse(ConfigProvider.fromUnknown(value))
    .pipe(
      Effect.mapError(
        (cause) =>
          new AppConfigError({
            cause,
            message: "App config did not match the expected schema.",
            operation: "AppConfig.parse",
          }),
      ),
    );

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
  "@cycle/desktop/AppConfig",
) {}
