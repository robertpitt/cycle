import { Schema } from "effect";

export const AgentRuntimeJsonObject = Schema.Record(Schema.String, Schema.Unknown);
export type AgentRuntimeJsonObject = typeof AgentRuntimeJsonObject.Type;

const BaseFields = {
  eventId: Schema.String,
  occurredAt: Schema.String,
  runId: Schema.String,
  rootRunId: Schema.String,
  parentRunId: Schema.optional(Schema.String),
  jobId: Schema.optional(Schema.String),
  sequence: Schema.optional(Schema.Number),
} as const;

export class AgentRunStarted extends Schema.TaggedClass<AgentRunStarted>()("AgentRunStarted", {
  ...BaseFields,
  agentId: Schema.String,
  providerId: Schema.String,
  model: Schema.optional(Schema.String),
  prompt: Schema.String,
}) {}

export class AgentRunCompleted extends Schema.TaggedClass<AgentRunCompleted>()(
  "AgentRunCompleted",
  {
    ...BaseFields,
    summary: Schema.String,
    result: Schema.optional(AgentRuntimeJsonObject),
  },
) {}

export class AgentRunFailed extends Schema.TaggedClass<AgentRunFailed>()("AgentRunFailed", {
  ...BaseFields,
  code: Schema.String,
  message: Schema.String,
  retryable: Schema.optional(Schema.Boolean),
}) {}

export class AgentRunCancelled extends Schema.TaggedClass<AgentRunCancelled>()(
  "AgentRunCancelled",
  {
    ...BaseFields,
    reason: Schema.String,
  },
) {}

export class AgentMessageDelta extends Schema.TaggedClass<AgentMessageDelta>()(
  "AgentMessageDelta",
  {
    ...BaseFields,
    delta: Schema.String,
    snapshot: Schema.optional(Schema.String),
  },
) {}

export class ReasoningStarted extends Schema.TaggedClass<ReasoningStarted>()("ReasoningStarted", {
  ...BaseFields,
  itemId: Schema.optional(Schema.String),
}) {}

export class ReasoningDelta extends Schema.TaggedClass<ReasoningDelta>()("ReasoningDelta", {
  ...BaseFields,
  delta: Schema.String,
  itemId: Schema.optional(Schema.String),
}) {}

export class ReasoningEnded extends Schema.TaggedClass<ReasoningEnded>()("ReasoningEnded", {
  ...BaseFields,
  itemId: Schema.optional(Schema.String),
}) {}

export class ScriptStarted extends Schema.TaggedClass<ScriptStarted>()("ScriptStarted", {
  ...BaseFields,
  scriptId: Schema.String,
  title: Schema.optional(Schema.String),
}) {}

export class ScriptDelta extends Schema.TaggedClass<ScriptDelta>()("ScriptDelta", {
  ...BaseFields,
  scriptId: Schema.String,
  delta: Schema.String,
}) {}

export class ScriptEnded extends Schema.TaggedClass<ScriptEnded>()("ScriptEnded", {
  ...BaseFields,
  scriptId: Schema.String,
}) {}

export class ScriptOutput extends Schema.TaggedClass<ScriptOutput>()("ScriptOutput", {
  ...BaseFields,
  scriptId: Schema.optional(Schema.String),
  output: Schema.String,
}) {}

export class ToolStarted extends Schema.TaggedClass<ToolStarted>()("ToolStarted", {
  ...BaseFields,
  toolCallId: Schema.String,
  toolName: Schema.String,
  input: Schema.optional(Schema.Unknown),
}) {}

export class ToolCompleted extends Schema.TaggedClass<ToolCompleted>()("ToolCompleted", {
  ...BaseFields,
  toolCallId: Schema.String,
  toolName: Schema.String,
  output: Schema.optional(Schema.Unknown),
}) {}

export class ToolFailed extends Schema.TaggedClass<ToolFailed>()("ToolFailed", {
  ...BaseFields,
  toolCallId: Schema.String,
  toolName: Schema.String,
  message: Schema.String,
  code: Schema.optional(Schema.String),
}) {}

export class SubagentStarted extends Schema.TaggedClass<SubagentStarted>()("SubagentStarted", {
  ...BaseFields,
  childRunId: Schema.String,
  prompt: Schema.String,
  agentId: Schema.String,
  providerId: Schema.String,
  model: Schema.optional(Schema.String),
}) {}

export class SubagentEvent extends Schema.TaggedClass<SubagentEvent>()("SubagentEvent", {
  ...BaseFields,
  childRunId: Schema.String,
  event: Schema.Unknown,
}) {}

export class SubagentCompleted extends Schema.TaggedClass<SubagentCompleted>()(
  "SubagentCompleted",
  {
    ...BaseFields,
    childRunId: Schema.String,
    summary: Schema.String,
  },
) {}

export class UsageReported extends Schema.TaggedClass<UsageReported>()("UsageReported", {
  ...BaseFields,
  inputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.optional(Schema.Number),
  totalTokens: Schema.optional(Schema.Number),
  reasoningTokens: Schema.optional(Schema.Number),
}) {}

export class RetryScheduled extends Schema.TaggedClass<RetryScheduled>()("RetryScheduled", {
  ...BaseFields,
  reason: Schema.String,
  retryAt: Schema.optional(Schema.String),
  attempt: Schema.optional(Schema.Number),
}) {}

export class WarningReported extends Schema.TaggedClass<WarningReported>()("WarningReported", {
  ...BaseFields,
  message: Schema.String,
  raw: Schema.optional(Schema.Unknown),
}) {}

export const AgentRuntimeEvent = Schema.Union([
  AgentRunStarted,
  AgentRunCompleted,
  AgentRunFailed,
  AgentRunCancelled,
  AgentMessageDelta,
  ReasoningStarted,
  ReasoningDelta,
  ReasoningEnded,
  ScriptStarted,
  ScriptDelta,
  ScriptEnded,
  ScriptOutput,
  ToolStarted,
  ToolCompleted,
  ToolFailed,
  SubagentStarted,
  SubagentEvent,
  SubagentCompleted,
  UsageReported,
  RetryScheduled,
  WarningReported,
]);
export type AgentRuntimeEvent = typeof AgentRuntimeEvent.Type;

export type AgentRuntimeEventTag = AgentRuntimeEvent["_tag"];

export const agentRuntimeEventName = (event: AgentRuntimeEvent): string =>
  event._tag
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1.$2")
    .toLowerCase();
