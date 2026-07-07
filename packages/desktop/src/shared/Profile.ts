import { AgentProviderId } from "@cycle/config/agent-providers";
import {
  ThemePreference,
  type AppConfigState,
  type ProfileConfig,
} from "@cycle/config/app-config-schema";
import type { AppConfigError } from "@cycle/config/errors";
import { Context, Effect, Schema } from "effect";

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

export type ProfileService = {
  readonly completeOnboarding: (
    input: CompleteOnboardingInput,
  ) => Effect.Effect<AppConfigState, AppConfigError>;
  readonly getProfile: () => Effect.Effect<ProfileConfig, AppConfigError>;
  readonly updateProfile: (
    input: ProfileUpdateInput,
  ) => Effect.Effect<ProfileConfig, AppConfigError>;
};

export class Profile extends Context.Service<Profile, ProfileService>()("@cycle/desktop/Profile") {}
