import { Schema } from "effect";

export const JsonValue = Schema.Json;
export type JsonValue = typeof JsonValue.Type;

export const JsonObject = Schema.Record(Schema.String, JsonValue);
export type JsonObject = typeof JsonObject.Type;

export const AgentProviderId = Schema.Literal("codex");
export type AgentProviderId = typeof AgentProviderId.Type;

export const AgentProvider = AgentProviderId;
export type AgentProvider = AgentProviderId;

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

export const AgentHarnessStatus = Schema.Literals([
  "available",
  "missing",
  "degraded",
  "disabled",
  "unsupported",
]);
export type AgentHarnessStatus = typeof AgentHarnessStatus.Type;

export const DetectedAgentProvider = Schema.Struct({
  capabilities: Schema.optional(AgentCapabilities),
  detectedAt: Schema.String,
  executable: Schema.String,
  executablePath: Schema.optional(Schema.String),
  id: AgentProviderId,
  name: Schema.String,
  status: Schema.Literals(["available", "missing"]),
});
export type DetectedAgentProvider = typeof DetectedAgentProvider.Type;

export const AgentProviderProfile = Schema.Struct({
  capabilities: AgentCapabilities,
  checkedAt: Schema.String,
  configuration: JsonObject,
  displayName: Schema.String,
  executableName: Schema.String,
  executablePath: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  models: Schema.Array(Schema.String),
  provider: AgentProviderId,
  status: AgentHarnessStatus,
});
export type AgentProviderProfile = typeof AgentProviderProfile.Type;
