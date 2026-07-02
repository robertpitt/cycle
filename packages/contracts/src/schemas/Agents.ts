import { Schema } from "effect";

export const JsonValue = Schema.Json;
export type JsonValue = typeof JsonValue.Type;

export const JsonObject = Schema.Record(Schema.String, JsonValue);
export type JsonObject = typeof JsonObject.Type;

export const AgentProviderId = Schema.Literals(["codex", "claude-code"]);
export type AgentProviderId = typeof AgentProviderId.Type;

export const AgentProvider = AgentProviderId;
export type AgentProvider = AgentProviderId;

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

export const AgentWorkJobType = Schema.Literals([
  "chat",
  "quick_action",
  "comment_response",
  "review_issue",
  "draft_issue",
  "expand_issue",
  "split_issue",
  "plan_epic",
  "implement_issue",
  "review_implementation",
]);
export type AgentWorkJobType = typeof AgentWorkJobType.Type;

export const AgentCapabilities = Schema.Struct({
  provider: AgentProviderId,
  sessionPersistence: Schema.Literals(["application", "provider-local", "provider-server"]),
  streaming: Schema.Boolean,
  structuredOutput: Schema.Boolean,
  supportedJobTypes: Schema.Array(AgentWorkJobType),
  supports: Schema.Struct({
    abort: Schema.Boolean,
    artifacts: Schema.Boolean,
    fileChanges: Schema.Boolean,
    mcp: Schema.Boolean,
    toolEvents: Schema.Boolean,
    usage: Schema.Boolean,
  }),
  workspace: Schema.Literals(["none", "read", "write", "provider-defined"]),
});
export type AgentCapabilities = typeof AgentCapabilities.Type;

export const AgentReasoningEffort = Schema.Struct({
  description: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  id: Schema.String,
  label: Schema.String,
});
export type AgentReasoningEffort = typeof AgentReasoningEffort.Type;

export const AgentHarnessStatus = Schema.Literals([
  "available",
  "missing",
  "degraded",
  "disabled",
  "unsupported",
]);
export type AgentHarnessStatus = typeof AgentHarnessStatus.Type;

export const DetectedAgentProvider = Schema.Struct({
  activeRunCount: Schema.optional(NonNegativeInteger),
  capabilities: Schema.optional(AgentCapabilities),
  configuration: Schema.optional(JsonObject),
  configurationSchema: Schema.optional(JsonObject),
  configuredExecutablePath: Schema.optional(Schema.String),
  detectedAt: Schema.String,
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  defaultReasoningEffortId: Schema.optional(Schema.NullOr(Schema.String)),
  executable: Schema.String,
  executablePath: Schema.optional(Schema.String),
  id: AgentProviderId,
  maxConcurrentRuns: Schema.optional(Schema.NullOr(PositiveInteger)),
  message: Schema.optional(Schema.String),
  models: Schema.optional(Schema.Array(Schema.String)),
  name: Schema.String,
  packageName: Schema.optional(Schema.String),
  reasoningEfforts: Schema.optional(Schema.Array(AgentReasoningEffort)),
  status: Schema.Literals(["available", "missing", "degraded", "disabled", "unsupported"]),
});
export type DetectedAgentProvider = typeof DetectedAgentProvider.Type;

export const AgentProviderProfile = Schema.Struct({
  activeRunCount: Schema.optional(NonNegativeInteger),
  capabilities: AgentCapabilities,
  checkedAt: Schema.String,
  configurationSchema: Schema.optional(JsonObject),
  configuration: JsonObject,
  configuredExecutablePath: Schema.optional(Schema.String),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  defaultReasoningEffortId: Schema.optional(Schema.NullOr(Schema.String)),
  displayName: Schema.String,
  executableName: Schema.String,
  executablePath: Schema.optional(Schema.String),
  maxConcurrentRuns: Schema.optional(Schema.NullOr(PositiveInteger)),
  message: Schema.optional(Schema.String),
  models: Schema.Array(Schema.String),
  packageName: Schema.optional(Schema.String),
  provider: AgentProviderId,
  reasoningEfforts: Schema.optional(Schema.Array(AgentReasoningEffort)),
  status: AgentHarnessStatus,
});
export type AgentProviderProfile = typeof AgentProviderProfile.Type;
