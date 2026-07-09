import { Schema } from "effect";
import { AgentJsonObject, AgentTimestamp } from "./AgentCommon.ts";
import { AgentRunId, AgentTaskId, AgentThreadId, AgentTurnId } from "./AgentIds.ts";

export const AgentTurnStatus = Schema.Literals([
  "queued",
  "running",
  "suspended",
  "completed",
  "failed",
  "cancelled",
]);
export type AgentTurnStatus = typeof AgentTurnStatus.Type;

export class AgentTurn extends Schema.Class<AgentTurn>("@cycle/agents/AgentTurn")({
  completedAt: Schema.optional(AgentTimestamp),
  createdAt: AgentTimestamp,
  input: AgentJsonObject,
  rootRunId: AgentRunId,
  runId: AgentRunId,
  status: AgentTurnStatus,
  taskId: AgentTaskId,
  threadId: AgentThreadId,
  turnId: AgentTurnId,
  updatedAt: AgentTimestamp,
}) {}
