import { Schema } from "effect";
import { AgentProviderId } from "../agents/AgentProviderId.ts";
import { JsonObject } from "../components/JsonObject.ts";
import {
  ApiHost,
  DEFAULT_API_HOST,
  InterfaceDensity,
  RepositoryCommitStyle,
  ThemePreference,
} from "./AppSettings.ts";

export const DEFAULT_API_PORT = 4738;

const ApiPort = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(65535),
);
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

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
  maxConcurrentRuns: Schema.optional(Schema.NullOr(PositiveInteger)),
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
  host: ApiHost,
  port: Schema.Union([ApiPort, Schema.Literal("auto")]),
  staticToken: Schema.String,
});
export type ApiConfig = typeof ApiConfig.Type;

export const defaultApiConfig = (): ApiConfig => ({
  enabled: true,
  host: DEFAULT_API_HOST,
  port: DEFAULT_API_PORT,
  staticToken: "",
});

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
  schemaVersion: Schema.Finite,
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
  schemaVersion: 4,
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
  maxConcurrentRuns: null,
});

export const UpsertRepositoryPathInput = Schema.Struct({
  displayName: Schema.optional(Schema.String),
  path: Schema.String,
});
export type UpsertRepositoryPathInput = typeof UpsertRepositoryPathInput.Type;

export const InitializeRepositoryPathInput = UpsertRepositoryPathInput;
export type InitializeRepositoryPathInput = typeof InitializeRepositoryPathInput.Type;

export const RepositoryPreferencesPatch = Schema.Struct({
  autoSync: Schema.optional(Schema.Boolean),
  commitStyle: Schema.optional(RepositoryCommitStyle),
  sidebarExpanded: Schema.optional(Schema.Boolean),
});
export type RepositoryPreferencesPatch = typeof RepositoryPreferencesPatch.Type;

export const UpdateRepositoryPreferencesInput = Schema.Struct({
  id: Schema.String,
  preferences: RepositoryPreferencesPatch,
});
export type UpdateRepositoryPreferencesInput = typeof UpdateRepositoryPreferencesInput.Type;
