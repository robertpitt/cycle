import type { AgentProviderId } from "@cycle/contracts/schemas/agents";
import { LocalSettings } from "@cycle/backend/settings";
import { session } from "electron";
import { Context, Effect, Layer, Scope } from "effect";
import { ElectronError } from "./errors/ElectronError.ts";
import {
  ElectronTheme,
  type ElectronThemeLifecycleHandlers,
  type ElectronThemeState,
} from "./ElectronTheme.ts";
import type { AppConfigError } from "@cycle/config";
import type {
  AppConfigState,
  InterfaceDensity,
  LocalWorkspacePreferencesPatch,
  ProfileConfig,
  RepositoryRecord,
  ThemePreference,
  UpdateRepositoryPreferencesInput,
} from "@cycle/config";
import { type CompleteOnboardingInput, type ProfileUpdateInput } from "./shared/Profile.ts";

export type ElectronPreferencesService = {
  readonly clearCache: Effect.Effect<void, ElectronError>;
  readonly completeOnboarding: (
    input: CompleteOnboardingInput,
  ) => Effect.Effect<AppConfigState, AppConfigError | ElectronError>;
  readonly read: Effect.Effect<AppConfigState, AppConfigError>;
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
  readonly syncThemePreference: Effect.Effect<ElectronThemeState, AppConfigError | ElectronError>;
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
      const electronTheme = yield* ElectronTheme;
      const settings = yield* LocalSettings;

      const clearCache = Effect.tryPromise({
        try: () => session.defaultSession.clearCache(),
        catch: (cause) =>
          new ElectronError({
            category: "electron",
            cause,
            message: cause instanceof Error ? cause.message : "session.clearCache failed.",
            operation: "session.clearCache",
          }),
      });
      const syncThemePreference = settings.read.pipe(
        Effect.map((config) => config.theme.preference),
        Effect.flatMap(electronTheme.setSource),
      );

      return {
        clearCache,
        completeOnboarding: (input) =>
          settings
            .completeOnboarding(input)
            .pipe(Effect.tap(() => electronTheme.setSource(input.themePreference))),
        read: settings.read,
        removeRepository: (id) => settings.removeRepository(id),
        setInterfaceDensity: (density) => settings.setInterfaceDensity(density),
        setThemePreference: (preference) =>
          settings
            .setThemePreference(preference)
            .pipe(Effect.tap(() => electronTheme.setSource(preference))),
        shouldAutoSyncRepository: (repositoryId) => settings.shouldAutoSyncRepository(repositoryId),
        startThemeLifecycleSupervision: (handlers) =>
          electronTheme.startLifecycleSupervision(handlers),
        syncThemePreference,
        themeState: electronTheme.current,
        updateProfile: (input) => settings.updateProfile(input),
        updateLocalWorkspacePreferences: (preferences) =>
          settings.updateLocalWorkspacePreferences(preferences),
        updateRepositoryPreferences: (input) => settings.updateRepositoryPreferences(input),
        updateAgentProviderPreference: (input) => settings.updateAgentProviderPreference(input),
      };
    }),
  );
}

export const ElectronPreferencesLive = ElectronPreferences.defaultLayer;
