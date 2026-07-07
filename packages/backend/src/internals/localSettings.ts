import type { JsonObject } from "@cycle/contracts/schemas";
import { AppConfigError, type ProfileConfig } from "@cycle/config/app-config";
import { Effect } from "effect";
import type { CompleteOnboardingInput, ProfileUpdateInput } from "../LocalSettings.ts";

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

export const normalizeProfileUpdate = (
  current: ProfileConfig,
  input: ProfileUpdateInput,
): Effect.Effect<ProfileConfig, AppConfigError> =>
  Effect.gen(function* () {
    return {
      displayName: input.displayName === undefined ? current.displayName : input.displayName.trim(),
      email: input.email === undefined ? current.email : yield* normalizeEmail(input.email),
    };
  });

export const normalizeOnboardingProfile = (
  input: CompleteOnboardingInput,
): Effect.Effect<ProfileConfig, AppConfigError> =>
  Effect.gen(function* () {
    return {
      displayName: input.displayName.trim(),
      email: yield* normalizeEmail(input.email),
    };
  });

export const normalizeNullableText = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const jsonObject = (value: Readonly<Record<string, unknown>>): JsonObject =>
  JSON.parse(JSON.stringify(value)) as JsonObject;
