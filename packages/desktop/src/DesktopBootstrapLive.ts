import { LocalSettings } from "@cycle/backend/settings";
import { RepositoryBootstrapLive } from "@cycle/backend/bootstrap";
import { Effect, Layer } from "effect";
import { ElectronPreferences } from "./ElectronPreferences.ts";
import type { AppConfigError } from "@cycle/config";

const LocalSettingsFromElectronPreferences = Layer.effect(
  LocalSettings,
  Effect.gen(function* () {
    const preferences = yield* ElectronPreferences;
    const mapConfigError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.mapError((error) => error as AppConfigError));

    return LocalSettings.of({
      completeOnboarding: (input) => mapConfigError(preferences.completeOnboarding(input)),
      getProfile: preferences.read.pipe(Effect.map((config) => config.profile)),
      read: preferences.read,
      removeRepository: (id) => preferences.removeRepository(id),
      setInterfaceDensity: (density) => preferences.setInterfaceDensity(density),
      setThemePreference: (preference) =>
        mapConfigError(preferences.setThemePreference(preference)),
      shouldAutoSyncRepository: (repositoryId) =>
        preferences.shouldAutoSyncRepository(repositoryId),
      updateAgentProviderPreference: (input) => preferences.updateAgentProviderPreference(input),
      updateProfile: (input) => preferences.updateProfile(input),
      updateRepositoryPreferences: (input) => preferences.updateRepositoryPreferences(input),
    });
  }),
);

export const DesktopBootstrapLive = RepositoryBootstrapLive.pipe(
  Layer.provide(LocalSettingsFromElectronPreferences),
);
