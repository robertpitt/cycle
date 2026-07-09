import { Schema } from "effect";
import {
  AgentAuthority,
  AgentHarnessIdSchema,
  AgentJsonObject,
  AgentProviderIdSchema,
  AgentTerminalResult,
  AgentTimestamp,
} from "./AgentCommon.ts";
import { AgentInteractionId, AgentRunId, AgentTaskId, AgentThreadId } from "./AgentIds.ts";

export const AgentTaskKind = Schema.Literals([
  "interactive-turn",
  "ticket-implementation",
  "research",
  "scheduled",
  "child",
]);
export type AgentTaskKind = typeof AgentTaskKind.Type;

export const AgentTaskPriorityLane = Schema.Literals([
  "control",
  "interactive",
  "assigned",
  "background",
]);
export type AgentTaskPriorityLane = typeof AgentTaskPriorityLane.Type;

export const AgentTaskStatus = Schema.Literals([
  "queued",
  "claimed",
  "preparing",
  "running",
  "suspending",
  "suspended",
  "resuming",
  "retry-wait",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
]);
export type AgentTaskStatus = typeof AgentTaskStatus.Type;

export class AgentTask extends Schema.Class<AgentTask>("@cycle/agents/AgentTask")({
  activeInteractionId: Schema.optional(AgentInteractionId),
  agentId: Schema.String,
  authority: AgentAuthority,
  completedAt: Schema.optional(AgentTimestamp),
  createdAt: AgentTimestamp,
  currentAttempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  currentRunId: Schema.optional(AgentRunId),
  enqueueSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  harnessId: AgentHarnessIdSchema,
  idempotencyKey: Schema.String,
  input: AgentJsonObject,
  kind: AgentTaskKind,
  maxAttempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  metadata: AgentJsonObject,
  model: Schema.optional(Schema.String),
  notBefore: Schema.optional(AgentTimestamp),
  parentRunId: Schema.optional(AgentRunId),
  priorityLane: AgentTaskPriorityLane,
  providerId: AgentProviderIdSchema,
  queuedAt: AgentTimestamp,
  repositoryId: Schema.optional(Schema.String),
  requestHash: Schema.String,
  schemaVersion: Schema.Literal(1),
  startedAt: Schema.optional(AgentTimestamp),
  status: AgentTaskStatus,
  taskId: AgentTaskId,
  terminal: Schema.optional(AgentTerminalResult),
  threadId: AgentThreadId,
  updatedAt: AgentTimestamp,
  workflowId: Schema.String,
}) {}

export class AgentTaskSubmitInput extends Schema.Class<AgentTaskSubmitInput>(
  "@cycle/agents/AgentTaskSubmitInput",
)({
  agentId: Schema.String,
  authority: AgentAuthority,
  harnessId: AgentHarnessIdSchema,
  idempotencyKey: Schema.String,
  input: AgentJsonObject,
  kind: AgentTaskKind,
  maxAttempts: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  metadata: Schema.optional(AgentJsonObject),
  model: Schema.optional(Schema.String),
  notBefore: Schema.optional(AgentTimestamp),
  parentRunId: Schema.optional(AgentRunId),
  priorityLane: AgentTaskPriorityLane,
  providerId: AgentProviderIdSchema,
  repositoryId: Schema.optional(Schema.String),
  rootRunId: Schema.optional(AgentRunId),
  threadId: AgentThreadId,
  workflowId: Schema.String,
}) {}
