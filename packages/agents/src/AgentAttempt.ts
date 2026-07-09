import { Schema } from "effect";
import { AgentJsonObject, AgentTerminalError, AgentTimestamp } from "./AgentCommon.ts";
import { AgentAttemptId, AgentRunId } from "./AgentIds.ts";

export const AgentAttemptStatus = Schema.Literals([
  "claimed",
  "preparing",
  "running",
  "suspending",
  "suspended",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type AgentAttemptStatus = typeof AgentAttemptStatus.Type;

export class AgentAttempt extends Schema.Class<AgentAttempt>("@cycle/agents/AgentAttempt")({
  attemptId: AgentAttemptId,
  authorityHash: Schema.String,
  completedAt: Schema.optional(AgentTimestamp),
  fencingToken: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  heartbeatAt: Schema.optional(AgentTimestamp),
  lastError: Schema.optional(AgentTerminalError),
  leaseExpiresAt: AgentTimestamp,
  ordinal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  ownerId: Schema.String,
  promptHash: Schema.String,
  providerState: AgentJsonObject,
  replayCursor: Schema.optional(Schema.String),
  runId: AgentRunId,
  startedAt: AgentTimestamp,
  status: AgentAttemptStatus,
  workspaceBindingHash: Schema.optional(Schema.String),
}) {}
