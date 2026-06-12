import { Config, ConfigProvider, Context, Data, Effect, Schema } from "effect";

export const CURRENT_APP_CONFIG_SCHEMA_VERSION = 3;
export const DEFAULT_API_PORT = 4738;

export const ThemePreference = Schema.Literals(["light", "dark", "system"]);
export type ThemePreference = typeof ThemePreference.Type;

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

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
  enabled: Schema.Boolean,
  id: Schema.Literals(["codex", "claude", "opencode"]),
});
export type AgentProviderPreference = typeof AgentProviderPreference.Type;

export const AgentProvidersConfig = Schema.Struct({
  preferences: Schema.Array(AgentProviderPreference),
});
export type AgentProvidersConfig = typeof AgentProvidersConfig.Type;

export const ThemeConfig = Schema.Struct({
  preference: ThemePreference,
});
export type ThemeConfig = typeof ThemeConfig.Type;

export const ApiConfig = Schema.Struct({
  enabled: Schema.Boolean,
  host: Schema.Literals(["127.0.0.1", "localhost"]),
  port: Schema.Union([Schema.Number, Schema.Literal("auto")]),
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

export class AppConfigError extends Data.TaggedError("AppConfigError")<{
  readonly cause?: unknown;
  readonly message: string;
  readonly operation: string;
}> {}

export const appConfigError = (
  operation: string,
  message: string,
  cause?: unknown,
): AppConfigError =>
  new AppConfigError({
    cause,
    message,
    operation,
  });

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
    preference: "system",
  },
});

export const parseAppConfig = (value: unknown): Effect.Effect<AppConfigState, AppConfigError> =>
  Config.schema(AppConfigState)
    .parse(ConfigProvider.fromUnknown(value))
    .pipe(
      Effect.mapError((cause) =>
        appConfigError("AppConfig.parse", "App config did not match the expected schema.", cause),
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
  readonly update: (
    mutator: (current: AppConfigState) => AppConfigState,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
};

export class AppConfig extends Context.Service<AppConfig, AppConfigService>()(
  "@cycle/desktop/AppConfig",
) {}
