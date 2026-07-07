import type { JsonObject } from "@cycle/contracts/schemas";
import { supportedAgentProviders, type AgentProviderId } from "@cycle/config/agent-providers";
import {
  AppConfig,
  AppConfigError,
  defaultAgentProviderPreference,
  ThemePreference,
  type AppConfigState,
  type InterfaceDensity,
  type ProfileConfig,
  type ThemePreference as ThemePreferenceType,
} from "@cycle/config/app-config";
import { AgentProviderId as AgentProviderIdSchema } from "@cycle/contracts/schemas";
import { Context, Effect, Layer, Schema } from "effect";
import { LocalWorkspace, type UpdateRepositoryPreferencesInput } from "./LocalWorkspace.ts";

export const ProfileUpdateInput = Schema.Struct({
  displayName: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
});
export type ProfileUpdateInput = typeof ProfileUpdateInput.Type;

export const CompleteOnboardingInput = Schema.Struct({
  displayName: Schema.String,
  email: Schema.String,
  enabledAgentProviderIds: Schema.optional(Schema.Array(AgentProviderIdSchema)),
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
  readonly providerId: AgentProviderId;
};

export type LocalSettingsService = {
  readonly completeOnboarding: (
    input: CompleteOnboardingInput,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly getProfile: () => Effect.Effect<ProfileConfig, AppConfigError>;
  readonly read: () => Effect.Effect<AppConfigState, AppConfigError>;
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
  readonly updateRepositoryPreferences: (
    input: UpdateRepositoryPreferencesInput,
  ) => Effect.Effect<import("@cycle/config/app-config").RepositoryRecord | null, AppConfigError>;
};

export class LocalSettings extends Context.Service<LocalSettings, LocalSettingsService>()(
  "@cycle/backend/LocalSettings",
) {}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email: string): Effect.Effect<string, AppConfigError> =>
  Effect.sync(() => email.trim()).pipe(
    Effect.flatMap((trimmed) => {
      if (trimmed === "" || emailPattern.test(trimmed)) return Effect.succeed(trimmed);
      return Effect.fail(
        new AppConfigError({
          message: "Profile email must be empty or a valid email address.",
          operation: "LocalSettings.email",
        }),
      );
    }),
  );

const normalizeProfileUpdate = (
  current: ProfileConfig,
  input: ProfileUpdateInput,
): Effect.Effect<ProfileConfig, AppConfigError> =>
  Effect.gen(function* () {
    return {
      displayName: input.displayName === undefined ? current.displayName : input.displayName.trim(),
      email: input.email === undefined ? current.email : yield* normalizeEmail(input.email),
    };
  });

const normalizeOnboardingProfile = (
  input: CompleteOnboardingInput,
): Effect.Effect<ProfileConfig, AppConfigError> =>
  Effect.gen(function* () {
    return {
      displayName: input.displayName.trim(),
      email: yield* normalizeEmail(input.email),
    };
  });

const normalizeNullableText = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const jsonObject = (value: Readonly<Record<string, unknown>>): JsonObject =>
  JSON.parse(JSON.stringify(value)) as JsonObject;

export const LocalSettingsLive = Layer.effect(
  LocalSettings,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const localWorkspace = yield* LocalWorkspace;

    const getProfile = () => appConfig.read().pipe(Effect.map((config) => config.profile));
    const updateProfile = (input: ProfileUpdateInput) =>
      Effect.gen(function* () {
        const current = yield* appConfig.read();
        const profile = yield* normalizeProfileUpdate(current.profile, input);
        const next = yield* appConfig.replace({
          ...current,
          profile,
        });
        return next.profile;
      });

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
      read: () => appConfig.read(),
      removeRepository: (id) =>
        localWorkspace.removeRepository(id).pipe(Effect.flatMap(() => appConfig.read())),
      setInterfaceDensity: (density) => appConfig.setInterfaceDensity(density),
      setThemePreference: (preference) => appConfig.setThemePreference(preference),
      shouldAutoSyncRepository: (repositoryId) =>
        appConfig
          .read()
          .pipe(
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
      updateRepositoryPreferences: (input: UpdateRepositoryPreferencesInput) =>
        localWorkspace.updateRepositoryPreferences(input),
    });
  }),
);

export const LocalSettingsTest = (service: LocalSettingsService) =>
  Layer.succeed(LocalSettings, LocalSettings.of(service));
