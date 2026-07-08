import { Schema } from "effect";

export const AgentTaskJsonValue = Schema.Json;
export type AgentTaskJsonValue = typeof AgentTaskJsonValue.Type;

export const AgentTaskJsonObject = Schema.Record(Schema.String, AgentTaskJsonValue);
export type AgentTaskJsonObject = typeof AgentTaskJsonObject.Type;

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

export const AgentTaskStatus = Schema.Literals([
  "queued",
  "starting",
  "running",
  "waiting_for_input",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
]);
export type AgentTaskStatus = typeof AgentTaskStatus.Type;

export const AgentTaskAuthorityMode = Schema.Literals([
  "read-only",
  "workspace-write",
  "full-access",
]);
export type AgentTaskAuthorityMode = typeof AgentTaskAuthorityMode.Type;

export const AgentTaskAuthority = Schema.Struct({
  allowedTools: Schema.optional(Schema.Array(Schema.String)),
  mode: AgentTaskAuthorityMode,
});
export type AgentTaskAuthority = typeof AgentTaskAuthority.Type;

export const AgentTaskWorkspace = Schema.Struct({
  branchName: Schema.optional(Schema.String),
  metadata: Schema.optional(AgentTaskJsonObject),
  path: Schema.String,
  workspaceId: Schema.optional(Schema.String),
});
export type AgentTaskWorkspace = typeof AgentTaskWorkspace.Type;

export const AgentTaskToolRequest = Schema.Struct({
  config: Schema.optional(AgentTaskJsonObject),
  kind: Schema.String,
  required: Schema.optional(Schema.Boolean),
});
export type AgentTaskToolRequest = typeof AgentTaskToolRequest.Type;

export const AgentTaskResponseFormat = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("text"),
  }),
  Schema.Struct({
    name: Schema.optional(Schema.String),
    schema: AgentTaskJsonObject,
    type: Schema.Literal("json_schema"),
  }),
]);
export type AgentTaskResponseFormat = typeof AgentTaskResponseFormat.Type;

export const AgentTaskError = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  remediation: Schema.optional(Schema.String),
  retryable: Schema.optional(Schema.Boolean),
});
export type AgentTaskError = typeof AgentTaskError.Type;

export const AgentTaskRequest = Schema.Struct({
  agentId: Schema.String,
  authority: AgentTaskAuthority,
  context: AgentTaskJsonObject,
  idempotencyKey: Schema.optional(Schema.String),
  input: Schema.Union([Schema.String, AgentTaskJsonObject]),
  instructions: Schema.String,
  maxAttempts: Schema.optional(PositiveInteger),
  metadata: Schema.optional(AgentTaskJsonObject),
  model: Schema.optional(Schema.String),
  origin: Schema.optional(AgentTaskJsonObject),
  providerId: Schema.String,
  requestedBy: Schema.String,
  responseFormat: Schema.optional(AgentTaskResponseFormat),
  tools: Schema.optional(Schema.Array(AgentTaskToolRequest)),
  workspace: Schema.optional(AgentTaskWorkspace),
});
export type AgentTaskRequest = typeof AgentTaskRequest.Type;

export const AgentTaskRequestSummary = Schema.Struct({
  authority: AgentTaskAuthority,
  context: AgentTaskJsonObject,
  input: Schema.Union([Schema.String, AgentTaskJsonObject]),
  instructions: Schema.String,
  metadata: AgentTaskJsonObject,
  origin: Schema.optional(AgentTaskJsonObject),
  requestedBy: Schema.String,
  responseFormat: Schema.optional(AgentTaskResponseFormat),
  tools: Schema.optional(Schema.Array(AgentTaskToolRequest)),
});
export type AgentTaskRequestSummary = typeof AgentTaskRequestSummary.Type;

export const AgentTask = Schema.Struct({
  agentId: Schema.String,
  attempt: NonNegativeInteger,
  authority: AgentTaskAuthority,
  completedAt: Schema.optional(Schema.String),
  createdAt: Schema.String,
  idempotencyKey: Schema.optional(Schema.String),
  lastError: Schema.optional(AgentTaskError),
  lastHeartbeatAt: Schema.optional(Schema.String),
  maxAttempts: PositiveInteger,
  metadata: AgentTaskJsonObject,
  model: Schema.optional(Schema.String),
  origin: Schema.optional(AgentTaskJsonObject),
  providerId: Schema.String,
  request: AgentTaskRequestSummary,
  rootRunId: Schema.NullOr(Schema.String),
  schemaVersion: Schema.Literal(1),
  startedAt: Schema.optional(Schema.String),
  status: AgentTaskStatus,
  taskId: Schema.String,
  updatedAt: Schema.String,
  workspace: Schema.optional(AgentTaskWorkspace),
});
export type AgentTask = typeof AgentTask.Type;

export const AgentTaskEvent = Schema.Struct({
  eventId: Schema.String,
  occurredAt: Schema.String,
  payload: AgentTaskJsonObject,
  runId: Schema.optional(Schema.String),
  sequence: PositiveInteger,
  taskId: Schema.String,
  type: Schema.String,
  visible: Schema.Boolean,
});
export type AgentTaskEvent = typeof AgentTaskEvent.Type;

export const AgentTaskListQuery = Schema.Struct({
  after: Schema.optional(Schema.Number),
  limit: Schema.optional(PositiveInteger),
  originKind: Schema.optional(Schema.String),
  repositoryId: Schema.optional(Schema.String),
  status: Schema.optional(AgentTaskStatus),
  ticketId: Schema.optional(Schema.String),
});
export type AgentTaskListQuery = typeof AgentTaskListQuery.Type;

export const AgentTaskPage = Schema.Struct({
  entries: Schema.Array(AgentTask),
  nextCursor: Schema.optional(Schema.String),
});
export type AgentTaskPage = typeof AgentTaskPage.Type;

export const AgentTaskEventQuery = Schema.Struct({
  afterSequence: Schema.optional(Schema.Number),
  limit: Schema.optional(PositiveInteger),
  taskId: Schema.String,
});
export type AgentTaskEventQuery = typeof AgentTaskEventQuery.Type;

export const AgentTaskSubscriptionQuery = Schema.Struct({
  afterSequence: Schema.optional(Schema.Number),
  taskId: Schema.String,
});
export type AgentTaskSubscriptionQuery = typeof AgentTaskSubscriptionQuery.Type;

export const CancelAgentTaskInput = Schema.Struct({
  reason: Schema.optional(Schema.String),
  requestedBy: Schema.optional(Schema.String),
});
export type CancelAgentTaskInput = typeof CancelAgentTaskInput.Type;

export const RetryAgentTaskInput = Schema.Struct({
  requestedBy: Schema.optional(Schema.String),
});
export type RetryAgentTaskInput = typeof RetryAgentTaskInput.Type;

export const AgentTaskInput = Schema.Struct({
  input: Schema.Union([Schema.String, AgentTaskJsonObject]),
  requestedBy: Schema.optional(Schema.String),
});
export type AgentTaskInput = typeof AgentTaskInput.Type;
