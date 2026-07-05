import type { JsonObject } from "@cycle/contracts/schemas";
import { session } from "electron";
import { Context, Effect, Layer, Scope } from "effect";
import { ElectronError } from "../errors/ElectronError.ts";
import {
  ElectronTheme,
  type ElectronThemeLifecycleHandlers,
  type ElectronThemeState,
} from "../platform/ElectronTheme.ts";
import {
  AppConfig,
  type AppConfigError,
  type AppConfigState,
  defaultAgentProviderPreference,
  type InterfaceDensity,
  type ProfileConfig,
  type RepositoryRecord,
  type ThemePreference,
} from "../shared/AppConfig.ts";
import type { AgentProviderId } from "../shared/AgentProviders.ts";
import { supportedAgentProviders } from "../shared/AgentProviders.ts";
import {
  LocalWorkspace,
  type LocalWorkspacePreferencesPatch,
  type UpdateRepositoryPreferencesInput,
} from "../shared/LocalWorkspace.ts";
import {
  Profile,
  type CompleteOnboardingInput,
  type ProfileUpdateInput,
} from "../shared/Profile.ts";

export type ElectronPreferencesService = {
  readonly clearCache: () => Effect.Effect<void, ElectronError>;
  readonly completeOnboarding: (
    input: CompleteOnboardingInput,
  ) => Effect.Effect<AppConfigState, AppConfigError | ElectronError>;
  readonly read: () => Effect.Effect<AppConfigState, AppConfigError>;
  readonly removeRepository: (id: string) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly setInterfaceDensity: (
    density: InterfaceDensity,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly setThemePreference: (
    preference: ThemePreference,
  ) => Effect.Effect<AppConfigState, AppConfigError | ElectronError>;
  readonly shouldAutoSyncRepository: (
    repositoryId: string,
  ) => Effect.Effect<boolean, AppConfigError>;
  readonly startThemeLifecycleSupervision: (
    handlers: ElectronThemeLifecycleHandlers,
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly syncThemePreference: () => Effect.Effect<
    ElectronThemeState,
    AppConfigError | ElectronError
  >;
  readonly themeState: Effect.Effect<ElectronThemeState>;
  readonly updateProfile: (
    input: ProfileUpdateInput,
  ) => Effect.Effect<ProfileConfig, AppConfigError>;
  readonly updateLocalWorkspacePreferences: (
    preferences: LocalWorkspacePreferencesPatch,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly updateRepositoryPreferences: (
    input: UpdateRepositoryPreferencesInput,
  ) => Effect.Effect<RepositoryRecord | null, AppConfigError>;
  readonly updateAgentProviderPreference: (input: {
    readonly providerId: AgentProviderId;
    readonly preference: {
      readonly config?: Readonly<Record<string, unknown>>;
      readonly defaultModel?: string | null;
      readonly enabled?: boolean;
      readonly executablePath?: string | null;
      readonly maxConcurrentRuns?: number | null;
    };
  }) => Effect.Effect<AppConfigState, AppConfigError>;
};

export class ElectronPreferences extends Context.Service<
  ElectronPreferences,
  ElectronPreferencesService
>()("@cycle/desktop/ElectronPreferences") {
  static readonly defaultLayer = Layer.effect(
    ElectronPreferences,
    Effect.gen(function* () {
      const appConfig = yield* AppConfig;
      const electronTheme = yield* ElectronTheme;
      const localWorkspace = yield* LocalWorkspace;
      const profile = yield* Profile;

      const syncThemePreference = () =>
        appConfig.getThemePreference().pipe(Effect.flatMap(electronTheme.setSource));

      return {
        clearCache: () =>
          Effect.tryPromise({
            try: () => session.defaultSession.clearCache(),
            catch: (cause) =>
              new ElectronError({
                category: "electron",
                cause,
                message: cause instanceof Error ? cause.message : "session.clearCache failed.",
                operation: "session.clearCache",
              }),
          }),
        completeOnboarding: (input) =>
          profile
            .completeOnboarding(input)
            .pipe(Effect.tap(() => electronTheme.setSource(input.themePreference))),
        read: () => appConfig.read(),
        removeRepository: (id) =>
          localWorkspace.removeRepository(id).pipe(Effect.flatMap(() => appConfig.read())),
        setInterfaceDensity: (density) => appConfig.setInterfaceDensity(density),
        setThemePreference: (preference) =>
          appConfig
            .setThemePreference(preference)
            .pipe(Effect.tap(() => electronTheme.setSource(preference))),
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
        startThemeLifecycleSupervision: (handlers) =>
          electronTheme.startLifecycleSupervision(handlers),
        syncThemePreference,
        themeState: electronTheme.current,
        updateProfile: (input) => profile.updateProfile(input),
        updateLocalWorkspacePreferences: (preferences) =>
          localWorkspace
            .updatePreferences(preferences)
            .pipe(Effect.flatMap(() => appConfig.read())),
        updateRepositoryPreferences: (input) => localWorkspace.updateRepositoryPreferences(input),
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
      };
    }),
  );
}

export const ElectronPreferencesLive = ElectronPreferences.defaultLayer;

const normalizeNullableText = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const jsonObject = (value: Readonly<Record<string, unknown>>): JsonObject =>
  JSON.parse(JSON.stringify(value)) as JsonObject;
