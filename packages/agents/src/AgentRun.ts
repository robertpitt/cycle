import { Schema } from "effect";
import {
  AgentAuthority,
  AgentHarnessIdSchema,
  AgentJsonObject,
  AgentProviderIdSchema,
  AgentTerminalResult,
  AgentTimestamp,
} from "./AgentCommon.ts";
import { AgentAttemptId, AgentRunId, AgentTaskId, AgentThreadId } from "./AgentIds.ts";

export const AgentRunStatus = Schema.Literals([
  "queued",
  "running",
  "suspended",
  "completed",
  "failed",
  "cancelled",
]);
export type AgentRunStatus = typeof AgentRunStatus.Type;

export class AgentRun extends Schema.Class<AgentRun>("@cycle/agents/AgentRun")({
  agentId: Schema.String,
  authority: AgentAuthority,
  childBudget: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  createdAt: AgentTimestamp,
  currentAttemptId: Schema.optional(AgentAttemptId),
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  harnessId: AgentHarnessIdSchema,
  metadata: AgentJsonObject,
  model: Schema.optional(Schema.String),
  parentRunId: Schema.optional(AgentRunId),
  providerId: AgentProviderIdSchema,
  rootRunId: AgentRunId,
  runId: AgentRunId,
  status: AgentRunStatus,
  taskId: AgentTaskId,
  terminal: Schema.optional(AgentTerminalResult),
  threadId: AgentThreadId,
  tokenBudget: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  updatedAt: AgentTimestamp,
}) {}
