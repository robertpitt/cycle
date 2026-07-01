import { session } from "electron";
import { Context, Effect, Layer, Scope } from "effect";
import { ElectronError } from "../platform/ElectronError.ts";
import {
  ElectronTheme,
  type ElectronThemeLifecycleHandlers,
  type ElectronThemeState,
} from "../platform/ElectronTheme.ts";
import {
  AppConfig,
  type AppConfigError,
  type AppConfigState,
  type InterfaceDensity,
  type ProfileConfig,
  type RepositoryRecord,
  type ThemePreference,
} from "../shared/AppConfig.ts";
import { LocalWorkspace, type UpdateRepositoryPreferencesInput } from "../shared/LocalWorkspace.ts";
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
  readonly updateRepositoryPreferences: (
    input: UpdateRepositoryPreferencesInput,
  ) => Effect.Effect<RepositoryRecord | null, AppConfigError>;
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
        updateRepositoryPreferences: (input) => localWorkspace.updateRepositoryPreferences(input),
      };
    }),
  );
}

export const ElectronPreferencesLive = ElectronPreferences.defaultLayer;
