import { BackendDatabaseLive } from "@cycle/backend/database";
import { LocalSettings } from "@cycle/backend/settings";
import { Effect, Layer } from "effect";
import type { AppConfigError } from "@cycle/config";
import { Profile } from "./shared/Profile.ts";

const LocalSettingsFromProfile = Layer.effect(
  LocalSettings,
  Effect.gen(function* () {
    const profile = yield* Profile;
    const unavailable = <A>() =>
      Effect.die(
        new Error("DesktopDatabaseLive only requires LocalSettings.getProfile"),
      ) as Effect.Effect<A, AppConfigError>;

    return LocalSettings.of({
      completeOnboarding: unavailable,
      getProfile: profile.getProfile,
      read: unavailable(),
      removeRepository: unavailable,
      setInterfaceDensity: unavailable,
      setThemePreference: unavailable,
      shouldAutoSyncRepository: unavailable,
      updateAgentProviderPreference: unavailable,
      updateProfile: (input) => profile.updateProfile(input),
      updateLocalWorkspacePreferences: unavailable,
      updateRepositoryPreferences: unavailable,
    });
  }),
);

export const DesktopDatabaseLive = BackendDatabaseLive().pipe(
  Layer.provide(LocalSettingsFromProfile),
);
