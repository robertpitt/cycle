import { Context, Effect } from "effect";
import type {
  AppConfigError,
  AppConfigState,
  ProfileConfig,
  ThemePreference,
} from "./AppConfig.ts";
import type { AgentProviderId } from "./AgentProviders.ts";

export type ProfileUpdateInput = {
  readonly displayName?: string;
  readonly email?: string;
};

export type CompleteOnboardingInput = {
  readonly displayName: string;
  readonly email: string;
  readonly enabledAgentProviderIds?: ReadonlyArray<AgentProviderId>;
  readonly themePreference: ThemePreference;
};

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
