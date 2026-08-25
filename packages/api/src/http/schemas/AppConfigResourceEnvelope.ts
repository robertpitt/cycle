import { AppConfigEncoded } from "@cycle/config";
import { Schema } from "effect";
import { AgentProviderId } from "./AgentProvidersResourceEnvelope.ts";
import {
  ApiPort,
  JsonObject,
  PositiveInteger,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const ThemePreference = Schema.Literals(["light", "dark", "system"]);
export type ThemePreference = typeof ThemePreference.Type;
export const InterfaceDensity = Schema.Literals(["compact", "spacious"]);
export type InterfaceDensity = typeof InterfaceDensity.Type;

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
export const AgentWorkSettingsPatch = Schema.Struct({
  allowDisposableWorktreeForMentions: Schema.optional(Schema.Boolean),
  allowFullAccessJobs: Schema.optional(Schema.Boolean),
  defaultMentionAuthorityMode: Schema.optional(
    Schema.Literals(["ticket-context", "disposable-worktree", "implementation-worktree"]),
  ),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  defaultProviderId: Schema.optional(Schema.NullOr(Schema.String)),
  maxConcurrentJobs: Schema.optional(Schema.NullOr(PositiveInteger)),
  paused: Schema.optional(Schema.Boolean),
  perAgentOverrides: Schema.optional(JsonObject),
});
export const AgentWorkSettingsPayload = strictSchema(
  Schema.Struct({
    settings: AgentWorkSettingsPatch,
  }),
);
export const ThemeConfigOutput = Schema.Struct({
  density: InterfaceDensity,
  preference: ThemePreference,
});
export const LocalApiConfigOutput = Schema.Struct({
  enabled: Schema.Boolean,
  host: Schema.Literals(["127.0.0.1", "localhost"]),
  port: Schema.Union([ApiPort, Schema.Literal("auto")]),
  staticToken: Schema.String,
});
export const RepositoryCommitStyle = Schema.Literals(["descriptive", "compact"]);
export const RepositoryPreferencesOutput = Schema.Struct({
  agentWork: Schema.Struct({
    agentWorkDisabled: Schema.Boolean,
    maxConcurrentJobs: Schema.NullOr(PositiveInteger),
    model: Schema.NullOr(Schema.String),
    paused: Schema.Boolean,
    perAgentOverrides: JsonObject,
    providerId: Schema.NullOr(Schema.String),
  }),
  archived: Schema.Boolean,
  autoSync: Schema.Boolean,
  commitStyle: RepositoryCommitStyle,
  group: Schema.NullOr(Schema.String),
  sidebarExpanded: Schema.Boolean,
});
export const RepositoryPreferencesPatch = Schema.Struct({
  agentWork: Schema.optional(
    Schema.Struct({
      agentWorkDisabled: Schema.optional(Schema.Boolean),
      maxConcurrentJobs: Schema.optional(Schema.NullOr(PositiveInteger)),
      model: Schema.optional(Schema.NullOr(Schema.String)),
      paused: Schema.optional(Schema.Boolean),
      perAgentOverrides: Schema.optional(JsonObject),
      providerId: Schema.optional(Schema.NullOr(Schema.String)),
    }),
  ),
  archived: Schema.optional(Schema.Boolean),
  autoSync: Schema.optional(Schema.Boolean),
  commitStyle: Schema.optional(RepositoryCommitStyle),
  group: Schema.optional(Schema.NullOr(Schema.String)),
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
export const RepositoryRecordResourceEnvelope = ResourceEnvelopeOf(RepositoryRecordOutput);
