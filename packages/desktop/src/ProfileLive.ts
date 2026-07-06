import { Effect, Layer } from "effect";
import {
  AppConfig,
  AppConfigError,
  defaultAgentProviderPreference,
  type ProfileConfig,
} from "@cycle/config/app-config";
import { supportedAgentProviders } from "@cycle/config/agent-providers";
import {
  Profile,
  type CompleteOnboardingInput,
  type ProfileUpdateInput,
} from "./shared/Profile.ts";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email: string): Effect.Effect<string, AppConfigError> =>
  Effect.sync(() => email.trim()).pipe(
    Effect.flatMap((trimmed) => {
      if (trimmed === "" || emailPattern.test(trimmed)) return Effect.succeed(trimmed);
      return Effect.fail(
        new AppConfigError({
          message: "Profile email must be empty or a valid email address.",
          operation: "Profile.email",
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

export const ProfileLive = Layer.effect(
  Profile,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;

    return {
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
      getProfile: () => appConfig.read().pipe(Effect.map((config) => config.profile)),
      updateProfile: (input) =>
        Effect.gen(function* () {
          const current = yield* appConfig.read();
          const profile = yield* normalizeProfileUpdate(current.profile, input);
          const next = yield* appConfig.replace({
            ...current,
            profile,
          });
          return next.profile;
        }),
    };
  }),
);
