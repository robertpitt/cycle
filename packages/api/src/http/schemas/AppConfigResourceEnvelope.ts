import { AppConfigEncoded } from "@cycle/config";
import {
  ApiHost,
  InterfaceDensity,
  RepositoryCommitStyle,
  ThemePreference,
} from "@cycle/contracts/schemas/app";
import { Schema } from "effect";
import { AgentProviderId } from "./AgentProvidersResourceEnvelope.ts";
import {
  ApiPort,
  JsonObject,
  PositiveInteger,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const ProfileOutput = Schema.Struct({
  displayName: Schema.String,
  email: Schema.String,
});
export const ProfileUpdatePayload = strictSchema(
  Schema.Struct({
    displayName: Schema.optional(Schema.String),
    email: Schema.optional(Schema.String),
  }),
);
export const ProfileResourceEnvelope = ResourceEnvelopeOf(ProfileOutput);

export const CompleteOnboardingPayload = strictSchema(
  Schema.Struct({
    displayName: Schema.String,
    email: Schema.String,
    enabledAgentProviderIds: Schema.optional(Schema.Array(AgentProviderId)),
    themePreference: ThemePreference,
  }),
);

export const ThemePreferencePayload = strictSchema(
  Schema.Struct({
    preference: ThemePreference,
  }),
);
export const InterfaceDensityPayload = strictSchema(
  Schema.Struct({
    density: InterfaceDensity,
  }),
);

export const OnboardingConfigOutput = Schema.Struct({
  completed: Schema.Boolean,
  completedAt: Schema.optional(Schema.String),
});
export const AgentProviderPreferenceOutput = Schema.Struct({
  config: Schema.optional(JsonObject),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.Boolean,
  executablePath: Schema.optional(Schema.NullOr(Schema.String)),
  id: AgentProviderId,
  maxConcurrentRuns: Schema.NullOr(PositiveInteger),
});
export const AgentProvidersConfigOutput = Schema.Struct({
  preferences: Schema.Array(AgentProviderPreferenceOutput),
});
export const AgentProviderPreferencePatch = Schema.Struct({
  config: Schema.optional(JsonObject),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.optional(Schema.Boolean),
  executablePath: Schema.optional(Schema.NullOr(Schema.String)),
  maxConcurrentRuns: Schema.optional(Schema.NullOr(PositiveInteger)),
});
export const AgentProviderPreferencePayload = strictSchema(
  Schema.Struct({
    preference: AgentProviderPreferencePatch,
  }),
);
export const ThemeConfigOutput = Schema.Struct({
  density: InterfaceDensity,
  preference: ThemePreference,
});
export const LocalApiConfigOutput = Schema.Struct({
  enabled: Schema.Boolean,
  host: ApiHost,
  port: Schema.Union([ApiPort, Schema.Literal("auto")]),
  staticToken: Schema.String,
});
export const RepositoryPreferencesOutput = Schema.Struct({
  autoSync: Schema.Boolean,
  commitStyle: RepositoryCommitStyle,
  sidebarExpanded: Schema.Boolean,
});
export const RepositoryPreferencesPatch = Schema.Struct({
  autoSync: Schema.optional(Schema.Boolean),
  commitStyle: Schema.optional(RepositoryCommitStyle),
  sidebarExpanded: Schema.optional(Schema.Boolean),
});
export const RepositoryPreferencesPayload = strictSchema(
  Schema.Struct({
    preferences: RepositoryPreferencesPatch,
  }),
);
export const RepositoryRecordOutput = Schema.Struct({
  addedAt: Schema.String,
  displayName: Schema.String,
  gitDbRootCommitId: Schema.optional(Schema.String),
  id: Schema.String,
  lastOpenedAt: Schema.optional(Schema.String),
  path: Schema.String,
  preferences: RepositoryPreferencesOutput,
});
export const RepositoryRecordNullableOutput = Schema.NullOr(RepositoryRecordOutput);
export const LocalWorkspaceConfigOutput = Schema.Struct({
  repositories: Schema.Array(RepositoryRecordOutput),
});
export const AppConfigOutput = AppConfigEncoded;
export const AppConfigResourceEnvelope = ResourceEnvelopeOf(AppConfigOutput);
export const RepositoryRecordNullableResourceEnvelope = ResourceEnvelopeOf(
  RepositoryRecordNullableOutput,
);
