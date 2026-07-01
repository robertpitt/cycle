import { Schema } from "effect";

export const AgentRuntimeJsonObject = Schema.Record(Schema.String, Schema.Unknown);
export type AgentRuntimeJsonObject = typeof AgentRuntimeJsonObject.Type;

const BaseFields = {
  attemptId: Schema.String,
  authorityMode: Schema.String,
  commentId: Schema.optional(Schema.String),
  eventId: Schema.String,
  jobId: Schema.optional(Schema.String),
  occurredAt: Schema.String,
  repositoryId: Schema.optional(Schema.String),
  runId: Schema.String,
  schemaVersion: Schema.Literal(1),
  sequence: Schema.Number,
  sessionId: Schema.String,
  source: Schema.String,
  ticketId: Schema.optional(Schema.String),
} as const;

export class AgentRuntimeRunStarted extends Schema.TaggedClass<AgentRuntimeRunStarted>()(
  "AgentRuntimeRunStarted",
  {
    ...BaseFields,
    agentId: Schema.String,
    harnessId: Schema.String,
    model: Schema.optional(Schema.String),
    promptTemplateId: Schema.String,
    providerId: Schema.String,
  },
) {}

export class AgentRuntimeRunResumed extends Schema.TaggedClass<AgentRuntimeRunResumed>()(
  "AgentRuntimeRunResumed",
  {
    ...BaseFields,
    reason: Schema.String,
  },
) {}

export class AgentRuntimeRunCompleted extends Schema.TaggedClass<AgentRuntimeRunCompleted>()(
  "AgentRuntimeRunCompleted",
  {
    ...BaseFields,
    result: Schema.optional(AgentRuntimeJsonObject),
    summary: Schema.String,
  },
) {}

export class AgentRuntimeRunFailed extends Schema.TaggedClass<AgentRuntimeRunFailed>()(
  "AgentRuntimeRunFailed",
  {
    ...BaseFields,
    code: Schema.String,
    message: Schema.String,
    retryable: Schema.optional(Schema.Boolean),
  },
) {}

export class AgentRuntimeRunCancelled extends Schema.TaggedClass<AgentRuntimeRunCancelled>()(
  "AgentRuntimeRunCancelled",
  {
    ...BaseFields,
    reason: Schema.String,
  },
) {}

export class AgentRuntimeRunInterrupted extends Schema.TaggedClass<AgentRuntimeRunInterrupted>()(
  "AgentRuntimeRunInterrupted",
  {
    ...BaseFields,
    reason: Schema.String,
  },
) {}

export class AgentRuntimeMessageDelta extends Schema.TaggedClass<AgentRuntimeMessageDelta>()(
  "AgentRuntimeMessageDelta",
  {
    ...BaseFields,
    delta: Schema.String,
    snapshot: Schema.optional(Schema.String),
  },
) {}

export class AgentRuntimeMessageFinal extends Schema.TaggedClass<AgentRuntimeMessageFinal>()(
  "AgentRuntimeMessageFinal",
  {
    ...BaseFields,
    text: Schema.String,
  },
) {}

export class AgentRuntimeReasoningStarted extends Schema.TaggedClass<AgentRuntimeReasoningStarted>()(
  "AgentRuntimeReasoningStarted",
  {
    ...BaseFields,
    itemId: Schema.optional(Schema.String),
  },
) {}

export class AgentRuntimeReasoningDelta extends Schema.TaggedClass<AgentRuntimeReasoningDelta>()(
  "AgentRuntimeReasoningDelta",
  {
    ...BaseFields,
    delta: Schema.String,
    itemId: Schema.optional(Schema.String),
  },
) {}

export class AgentRuntimeReasoningEnded extends Schema.TaggedClass<AgentRuntimeReasoningEnded>()(
  "AgentRuntimeReasoningEnded",
  {
    ...BaseFields,
    itemId: Schema.optional(Schema.String),
  },
) {}

export class AgentRuntimeScriptStarted extends Schema.TaggedClass<AgentRuntimeScriptStarted>()(
  "AgentRuntimeScriptStarted",
  {
    ...BaseFields,
    scriptId: Schema.String,
    title: Schema.optional(Schema.String),
  },
) {}

export class AgentRuntimeScriptDelta extends Schema.TaggedClass<AgentRuntimeScriptDelta>()(
  "AgentRuntimeScriptDelta",
  {
    ...BaseFields,
    delta: Schema.String,
    scriptId: Schema.String,
  },
) {}

export class AgentRuntimeScriptOutput extends Schema.TaggedClass<AgentRuntimeScriptOutput>()(
  "AgentRuntimeScriptOutput",
  {
    ...BaseFields,
    output: Schema.String,
    scriptId: Schema.optional(Schema.String),
  },
) {}

export class AgentRuntimeScriptEnded extends Schema.TaggedClass<AgentRuntimeScriptEnded>()(
  "AgentRuntimeScriptEnded",
  {
    ...BaseFields,
    scriptId: Schema.String,
  },
) {}

export class AgentRuntimeToolStarted extends Schema.TaggedClass<AgentRuntimeToolStarted>()(
  "AgentRuntimeToolStarted",
  {
    ...BaseFields,
    input: Schema.optional(Schema.Unknown),
    toolCallId: Schema.String,
    toolName: Schema.String,
  },
) {}

export class AgentRuntimeToolCompleted extends Schema.TaggedClass<AgentRuntimeToolCompleted>()(
  "AgentRuntimeToolCompleted",
  {
    ...BaseFields,
    output: Schema.optional(Schema.Unknown),
    toolCallId: Schema.String,
    toolName: Schema.String,
  },
) {}

export class AgentRuntimeToolFailed extends Schema.TaggedClass<AgentRuntimeToolFailed>()(
  "AgentRuntimeToolFailed",
  {
    ...BaseFields,
    code: Schema.optional(Schema.String),
    message: Schema.String,
    toolCallId: Schema.String,
    toolName: Schema.String,
  },
) {}

export class AgentRuntimeMcpWarning extends Schema.TaggedClass<AgentRuntimeMcpWarning>()(
  "AgentRuntimeMcpWarning",
  {
    ...BaseFields,
    message: Schema.String,
    raw: Schema.optional(Schema.Unknown),
  },
) {}

export class AgentRuntimeApprovalRequested extends Schema.TaggedClass<AgentRuntimeApprovalRequested>()(
  "AgentRuntimeApprovalRequested",
  {
    ...BaseFields,
    interactionId: Schema.String,
    payload: AgentRuntimeJsonObject,
  },
) {}

export class AgentRuntimeApprovalResolved extends Schema.TaggedClass<AgentRuntimeApprovalResolved>()(
  "AgentRuntimeApprovalResolved",
  {
    ...BaseFields,
    decision: Schema.String,
    interactionId: Schema.String,
  },
) {}

export class AgentRuntimeUserInputRequested extends Schema.TaggedClass<AgentRuntimeUserInputRequested>()(
  "AgentRuntimeUserInputRequested",
  {
    ...BaseFields,
    interactionId: Schema.String,
    payload: AgentRuntimeJsonObject,
  },
) {}

export class AgentRuntimeUserInputResolved extends Schema.TaggedClass<AgentRuntimeUserInputResolved>()(
  "AgentRuntimeUserInputResolved",
  {
    ...BaseFields,
    interactionId: Schema.String,
    payload: AgentRuntimeJsonObject,
  },
) {}

export class AgentRuntimeSteeringAccepted extends Schema.TaggedClass<AgentRuntimeSteeringAccepted>()(
  "AgentRuntimeSteeringAccepted",
  {
    ...BaseFields,
    interactionId: Schema.String,
    message: Schema.String,
  },
) {}

export class AgentRuntimeSteeringRejected extends Schema.TaggedClass<AgentRuntimeSteeringRejected>()(
  "AgentRuntimeSteeringRejected",
  {
    ...BaseFields,
    interactionId: Schema.String,
    message: Schema.String,
    reason: Schema.String,
  },
) {}

export class AgentRuntimeUsageReported extends Schema.TaggedClass<AgentRuntimeUsageReported>()(
  "AgentRuntimeUsageReported",
  {
    ...BaseFields,
    inputTokens: Schema.optional(Schema.Number),
    outputTokens: Schema.optional(Schema.Number),
    reasoningTokens: Schema.optional(Schema.Number),
    totalTokens: Schema.optional(Schema.Number),
  },
) {}

export class AgentRuntimeWarningReported extends Schema.TaggedClass<AgentRuntimeWarningReported>()(
  "AgentRuntimeWarningReported",
  {
    ...BaseFields,
    message: Schema.String,
    raw: Schema.optional(Schema.Unknown),
  },
) {}

export const AgentRuntimeEvent = Schema.Union([
  AgentRuntimeRunStarted,
  AgentRuntimeRunResumed,
  AgentRuntimeRunCompleted,
  AgentRuntimeRunFailed,
  AgentRuntimeRunCancelled,
  AgentRuntimeRunInterrupted,
  AgentRuntimeMessageDelta,
  AgentRuntimeMessageFinal,
  AgentRuntimeReasoningStarted,
  AgentRuntimeReasoningDelta,
  AgentRuntimeReasoningEnded,
  AgentRuntimeScriptStarted,
  AgentRuntimeScriptDelta,
  AgentRuntimeScriptOutput,
  AgentRuntimeScriptEnded,
  AgentRuntimeToolStarted,
  AgentRuntimeToolCompleted,
  AgentRuntimeToolFailed,
  AgentRuntimeMcpWarning,
  AgentRuntimeApprovalRequested,
  AgentRuntimeApprovalResolved,
  AgentRuntimeUserInputRequested,
  AgentRuntimeUserInputResolved,
  AgentRuntimeSteeringAccepted,
  AgentRuntimeSteeringRejected,
  AgentRuntimeUsageReported,
  AgentRuntimeWarningReported,
]);

export type AgentRuntimeEvent = typeof AgentRuntimeEvent.Type;
export type AgentRuntimeEventTag = AgentRuntimeEvent["_tag"];

export const agentRuntimeEventName = (event: AgentRuntimeEvent): string =>
  event._tag
    .replace(/^AgentRuntime/u, "")
    .replace(/([a-z0-9])([A-Z])/gu, "$1.$2")
    .replace(/([A-Z])([A-Z][a-z])/gu, "$1.$2")
    .toLowerCase();

