import {
  AgentProviderId,
  supportedAgentProviders,
  type AgentProviderId as AgentProviderIdType,
} from "@cycle/contracts/schemas/agents";
import { AppConfig, AppConfigError } from "@cycle/config";
import {
  defaultAgentProviderPreference,
  ThemePreference,
  type AppConfigState,
  type InterfaceDensity,
  type LocalWorkspacePreferencesPatch,
  type ProfileConfig,
  type RepositoryRecord,
  type ThemePreference as ThemePreferenceType,
} from "@cycle/config";
import { Context, Effect, Layer, Schema } from "effect";
import {
  jsonObject,
  normalizeNullableText,
  normalizeOnboardingProfile,
  normalizeProfileUpdate,
} from "./internals/localSettings.ts";
import { LocalWorkspace, type UpdateRepositoryPreferencesInput } from "./LocalWorkspace.ts";

export const ProfileUpdateInput = Schema.Struct({
  displayName: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
});
export type ProfileUpdateInput = typeof ProfileUpdateInput.Type;

export const CompleteOnboardingInput = Schema.Struct({
  displayName: Schema.String,
  email: Schema.String,
  enabledAgentProviderIds: Schema.optional(Schema.Array(AgentProviderId)),
  themePreference: ThemePreference,
});
export type CompleteOnboardingInput = typeof CompleteOnboardingInput.Type;

export type AgentProviderPreferencePatch = {
  readonly config?: Readonly<Record<string, unknown>>;
  readonly defaultModel?: string | null;
  readonly enabled?: boolean;
  readonly executablePath?: string | null;
  readonly maxConcurrentRuns?: number | null;
};

export type UpdateAgentProviderPreferenceInput = {
  readonly preference: AgentProviderPreferencePatch;
  readonly providerId: AgentProviderIdType;
};

export type LocalSettingsService = {
  readonly completeOnboarding: (
    input: CompleteOnboardingInput,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly getProfile: Effect.Effect<ProfileConfig, AppConfigError>;
  readonly read: Effect.Effect<AppConfigState, AppConfigError>;
  readonly removeRepository: (id: string) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly setInterfaceDensity: (
    density: InterfaceDensity,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly setThemePreference: (
    preference: ThemePreferenceType,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly shouldAutoSyncRepository: (
    repositoryId: string,
  ) => Effect.Effect<boolean, AppConfigError>;
  readonly updateAgentProviderPreference: (
    input: UpdateAgentProviderPreferenceInput,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly updateProfile: (
    input: ProfileUpdateInput,
  ) => Effect.Effect<ProfileConfig, AppConfigError>;
  readonly updateLocalWorkspacePreferences: (
    preferences: LocalWorkspacePreferencesPatch,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly updateRepositoryPreferences: (
    input: UpdateRepositoryPreferencesInput,
  ) => Effect.Effect<RepositoryRecord | null, AppConfigError>;
};

export class LocalSettings extends Context.Service<LocalSettings, LocalSettingsService>()(
  "@cycle/backend/LocalSettings",
) {}

export const LocalSettingsLive = Layer.effect(
  LocalSettings,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const localWorkspace = yield* LocalWorkspace;

    const getProfile = appConfig.read.pipe(Effect.map((config) => config.profile));
    const updateProfile = (input: ProfileUpdateInput) =>
      appConfig
        .updateEffect((current) =>
          normalizeProfileUpdate(current.profile, input).pipe(
            Effect.map((profile) => ({ ...current, profile })),
          ),
        )
        .pipe(Effect.map((config) => config.profile));

    return LocalSettings.of({
      completeOnboarding: (input) =>
        Effect.gen(function* () {
          const profile = yield* normalizeOnboardingProfile(input);
          const enabledAgentProviderIds = new Set(input.enabledAgentProviderIds ?? []);
          return yield* appConfig.update((current) => ({
            ...current,
            agentProviders: {
              preferences: supportedAgentProviders.map((provider) =>
                defaultAgentProviderPreference(
                  provider.id,
                  enabledAgentProviderIds.has(provider.id),
                ),
              ),
            },
            onboarding: {
              completed: true,
              completedAt: new Date().toISOString(),
            },
            profile,
            theme: {
              ...current.theme,
              preference: input.themePreference,
            },
          }));
        }),
      getProfile,
      read: appConfig.read,
      removeRepository: (id) =>
        localWorkspace.removeRepository(id).pipe(Effect.flatMap(() => appConfig.read)),
      setInterfaceDensity: (density) =>
        appConfig.update((current) => ({
          ...current,
          theme: { ...current.theme, density },
        })),
      setThemePreference: (preference) =>
        appConfig.update((current) => ({
          ...current,
          theme: { ...current.theme, preference },
        })),
      shouldAutoSyncRepository: (repositoryId) =>
        appConfig.read.pipe(
          Effect.map(
            (config) =>
              config.localWorkspace.repositories.find(
                (repository) => repository.id === repositoryId,
              )?.preferences.autoSync ?? false,
          ),
        ),
      updateAgentProviderPreference: (input) =>
        appConfig.update((current) => {
          const knownProvider = supportedAgentProviders.find(
            (provider) => provider.id === input.providerId,
          );
          const fallback = defaultAgentProviderPreference(
            input.providerId,
            knownProvider?.defaultEnabled ?? false,
          );
          const currentPreference =
            current.agentProviders.preferences.find(
              (preference) => preference.id === input.providerId,
            ) ?? fallback;
          const nextPreference = {
            ...currentPreference,
            ...input.preference,
            config:
              input.preference.config === undefined
                ? (currentPreference.config ?? {})
                : jsonObject(input.preference.config),
            defaultModel:
              input.preference.defaultModel === undefined
                ? (currentPreference.defaultModel ?? null)
                : normalizeNullableText(input.preference.defaultModel),
            executablePath:
              input.preference.executablePath === undefined
                ? (currentPreference.executablePath ?? null)
                : normalizeNullableText(input.preference.executablePath),
            maxConcurrentRuns:
              input.preference.maxConcurrentRuns === undefined
                ? currentPreference.maxConcurrentRuns
                : input.preference.maxConcurrentRuns,
          };
          const preferences = [
            ...current.agentProviders.preferences.filter(
              (preference) => preference.id !== input.providerId,
            ),
            nextPreference,
          ].sort(
            (left, right) =>
              supportedAgentProviders.findIndex((provider) => provider.id === left.id) -
              supportedAgentProviders.findIndex((provider) => provider.id === right.id),
          );

          return {
            ...current,
            agentProviders: {
              preferences,
            },
          };
        }),
      updateProfile,
      updateLocalWorkspacePreferences: (preferences) =>
        localWorkspace.updatePreferences(preferences).pipe(Effect.flatMap(() => appConfig.read)),
      updateRepositoryPreferences: (input: UpdateRepositoryPreferencesInput) =>
        localWorkspace.updateRepositoryPreferences(input),
    });
  }),
);
