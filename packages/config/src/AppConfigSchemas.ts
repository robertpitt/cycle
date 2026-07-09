import { Effect, Option, Schema, SchemaIssue } from "effect";
import { AppConfigError } from "./ConfigErrors.ts";
import { generateStaticToken, makeRedactedToken, redactedTokenValue } from "./internal/token.ts";

export const CURRENT_APP_CONFIG_SCHEMA_VERSION = 4;
export const DEFAULT_API_PORT = 4738;
export const DEFAULT_API_HOST = "127.0.0.1";
export const DEFAULT_STATIC_TOKEN = "cycle-default-static-token";

export const AgentProviderId = Schema.Literals(["codex", "claude-code"]).annotate({
  identifier: "@cycle/config/AgentProviderId",
  title: "AgentProviderId",
});
export type AgentProviderId = typeof AgentProviderId.Type;

export const ThemePreference = Schema.Literals(["light", "dark", "system"]);
export type ThemePreference = typeof ThemePreference.Type;

export const InterfaceDensity = Schema.Literals(["compact", "spacious"]);
export type InterfaceDensity = typeof InterfaceDensity.Type;

export const RepositoryCommitStyle = Schema.Literals(["descriptive", "compact"]);
export type RepositoryCommitStyle = typeof RepositoryCommitStyle.Type;

export const isThemePreference = Schema.is(ThemePreference);
export const isInterfaceDensity = Schema.is(InterfaceDensity);
export const isRepositoryCommitStyle = Schema.is(RepositoryCommitStyle);

export const JsonValue = Schema.Json;
export type JsonValue = typeof JsonValue.Type;

export const JsonObject = Schema.Record(Schema.String, JsonValue);
export type JsonObject = typeof JsonObject.Type;

const ApiPort = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(65535),
);
const NonEmptyOptionalString = Schema.NullOr(Schema.NonEmptyString);
const PositiveInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));

export const RepositoryPreferences = Schema.Struct({
  autoSync: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true))),
  commitStyle: RepositoryCommitStyle.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed("descriptive")),
  ),
  sidebarExpanded: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true))),
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
  gitDbRootCommitId: Schema.optionalKey(Schema.String),
  id: Schema.NonEmptyString,
  lastOpenedAt: Schema.optionalKey(Schema.NonEmptyString),
  path: Schema.NonEmptyString,
  preferences: RepositoryPreferences.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(defaultRepositoryPreferences())),
  ),
});
export type RepositoryRecord = typeof RepositoryRecord.Type;

export const LocalWorkspaceConfig = Schema.Struct({
  repositories: Schema.Array(RepositoryRecord).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([])),
  ),
});
export type LocalWorkspaceConfig = typeof LocalWorkspaceConfig.Type;

export const ThemeConfig = Schema.Struct({
  density: InterfaceDensity.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("compact"))),
  preference: ThemePreference.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed("system"))),
});
export type ThemeConfig = typeof ThemeConfig.Type;

export const OnboardingConfig = Schema.Struct({
  completed: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false))),
  completedAt: Schema.optionalKey(Schema.String),
});
export type OnboardingConfig = typeof OnboardingConfig.Type;

export const ProfileConfig = Schema.Struct({
  displayName: Schema.String.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(""))),
  email: Schema.String.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(""))),
});
export type ProfileConfig = typeof ProfileConfig.Type;

export const defaultAgentProviderPreference = (
  id: AgentProviderId,
  enabled = false,
): AgentProviderPreference => ({
  config: {},
  defaultModel: null,
  enabled,
  executablePath: null,
  id,
  maxConcurrentRuns: null,
});

export const AgentProviderPreference = Schema.Struct({
  config: JsonObject.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed({}))),
  defaultModel: NonEmptyOptionalString.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null)),
  ),
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false))),
  executablePath: NonEmptyOptionalString.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null)),
  ),
  id: AgentProviderId,
  maxConcurrentRuns: Schema.NullOr(PositiveInteger).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null)),
  ),
});
export type AgentProviderPreference = typeof AgentProviderPreference.Type;

export const AgentProvidersConfig = Schema.Struct({
  preferences: Schema.Array(AgentProviderPreference).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([])),
  ),
});
export type AgentProvidersConfig = typeof AgentProvidersConfig.Type;

const apiDefaults = {
  enabled: true,
  host: DEFAULT_API_HOST,
  port: DEFAULT_API_PORT,
} as const;

const tokenDefault = generateStaticToken.pipe(
  Effect.mapError(
    () =>
      new Schema.SchemaError(
        new SchemaIssue.InvalidValue(Option.none(), {
          message: "Unable to generate the Cycle API token.",
        }),
      ),
  ),
);

export const ApiConfig = Schema.Struct({
  enabled: Schema.Boolean.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(apiDefaults.enabled)),
  ),
  host: Schema.Literals([DEFAULT_API_HOST, "localhost"]).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(apiDefaults.host)),
  ),
  port: Schema.Union([ApiPort, Schema.Literal("auto")]).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(apiDefaults.port)),
  ),
  staticToken: Schema.RedactedFromValue(Schema.NonEmptyString, {
    label: "Cycle API token",
  }).pipe(Schema.withDecodingDefaultTypeKey(tokenDefault)),
});
export type ApiConfig = typeof ApiConfig.Type;

export const ApiConfigEncoded = Schema.Struct({
  enabled: Schema.Boolean,
  host: Schema.Literals([DEFAULT_API_HOST, "localhost"]),
  port: Schema.Union([ApiPort, Schema.Literal("auto")]),
  staticToken: Schema.NonEmptyString,
});
export type ApiConfigEncoded = typeof ApiConfigEncoded.Type;

export const AppConfigState = Schema.Struct({
  agentProviders: AgentProvidersConfig.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed({ preferences: [] })),
  ),
  api: ApiConfig.pipe(
    Schema.withDecodingDefaultTypeKey(
      tokenDefault.pipe(Effect.map((staticToken) => ({ ...apiDefaults, staticToken }))),
    ),
  ),
  localWorkspace: LocalWorkspaceConfig.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed({ repositories: [] })),
  ),
  onboarding: OnboardingConfig.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed({ completed: false })),
  ),
  profile: ProfileConfig.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed({ displayName: "", email: "" })),
  ),
  schemaVersion: Schema.Literal(CURRENT_APP_CONFIG_SCHEMA_VERSION).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(CURRENT_APP_CONFIG_SCHEMA_VERSION)),
  ),
  theme: ThemeConfig.pipe(
    Schema.withDecodingDefaultTypeKey(
      Effect.succeed({ density: "compact" as const, preference: "system" as const }),
    ),
  ),
});
export type AppConfigState = typeof AppConfigState.Type;

export const AppConfigEncoded = Schema.Struct({
  agentProviders: AgentProvidersConfig,
  api: ApiConfigEncoded,
  localWorkspace: LocalWorkspaceConfig,
  onboarding: OnboardingConfig,
  profile: ProfileConfig,
  schemaVersion: Schema.Literal(CURRENT_APP_CONFIG_SCHEMA_VERSION),
  theme: ThemeConfig,
});
export type AppConfigEncoded = typeof AppConfigEncoded.Type;

const AppConfigJson = Schema.fromJsonString(AppConfigState);

const invalidAppConfig = (operation: string, message: string) => () =>
  new AppConfigError({ message, operation });

export const decodeAppConfig = (value: unknown) =>
  Schema.decodeUnknownEffect(AppConfigState)(value).pipe(
    Effect.mapError(
      invalidAppConfig("AppConfig.decode", "App config does not match the current schema."),
    ),
  );

export const parseAppConfig = decodeAppConfig;

export const encodeAppConfig = Effect.fn("encodeAppConfig")(
  function* (value: AppConfigState) {
    const encoded = yield* Schema.encodeEffect(AppConfigState)(value);
    return yield* Schema.decodeUnknownEffect(AppConfigEncoded)(encoded);
  },
  Effect.mapError(invalidAppConfig("AppConfig.encode", "Unable to encode app config.")),
);

export const decodeAppConfigJson = (text: string) =>
  Schema.decodeUnknownEffect(AppConfigJson)(text).pipe(
    Effect.mapError(
      invalidAppConfig("AppConfig.decode", "App config does not match the current schema."),
    ),
  );

export const encodeAppConfigJson = (value: AppConfigState) =>
  Schema.encodeEffect(AppConfigJson)(value).pipe(
    Effect.mapError(invalidAppConfig("AppConfig.encode", "Unable to encode app config.")),
  );

export const defaultApiConfig = (staticToken: string = DEFAULT_STATIC_TOKEN): ApiConfigEncoded => ({
  ...apiDefaults,
  staticToken,
});

export const defaultAppConfig = (staticToken: string = DEFAULT_STATIC_TOKEN): AppConfigEncoded => ({
  agentProviders: { preferences: [] },
  api: defaultApiConfig(staticToken),
  localWorkspace: { repositories: [] },
  onboarding: { completed: false },
  profile: { displayName: "", email: "" },
  schemaVersion: CURRENT_APP_CONFIG_SCHEMA_VERSION,
  theme: { density: "compact", preference: "system" },
});

export const defaultAppConfigState = (
  staticToken: string = DEFAULT_STATIC_TOKEN,
): AppConfigState => ({
  ...defaultAppConfig(staticToken),
  api: { ...defaultApiConfig(staticToken), staticToken: makeRedactedToken(staticToken) },
});

export const appConfigStaticToken = (config: AppConfigState): string =>
  redactedTokenValue(config.api.staticToken);

export const encodedAppConfigStaticToken = (config: AppConfigEncoded): string =>
  config.api.staticToken;

export const InitializeRepositoryPathInput = Schema.Struct({
  displayName: Schema.optionalKey(Schema.String),
  path: Schema.NonEmptyString,
});
export type InitializeRepositoryPathInput = typeof InitializeRepositoryPathInput.Type;

export const UpdateRepositoryPreferencesInput = Schema.Struct({
  id: Schema.String,
  preferences: Schema.Struct({
    autoSync: Schema.optionalKey(Schema.Boolean),
    commitStyle: Schema.optionalKey(RepositoryCommitStyle),
    sidebarExpanded: Schema.optionalKey(Schema.Boolean),
  }),
});
export type UpdateRepositoryPreferencesInput = typeof UpdateRepositoryPreferencesInput.Type;
