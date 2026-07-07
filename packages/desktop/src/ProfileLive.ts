import { LocalSettings } from "@cycle/backend/settings";
import { Effect, Layer } from "effect";
import { Profile } from "./shared/Profile.ts";

export const ProfileLive = Layer.effect(
  Profile,
  Effect.gen(function* () {
    const settings = yield* LocalSettings;

    return {
      completeOnboarding: (input) => settings.completeOnboarding(input),
      getProfile: () => settings.getProfile(),
      updateProfile: (input) => settings.updateProfile(input),
    };
  }),
);
