import { Schema } from "effect";
import { AgentJsonObject, AgentTimestamp } from "./AgentCommon.ts";
import { AgentCommandId, AgentRunId, AgentTaskId, AgentThreadId } from "./AgentIds.ts";

export const AgentCommandType = Schema.Literals(["steer", "interrupt", "cancel", "respond"]);
export type AgentCommandType = typeof AgentCommandType.Type;

export const AgentCommandStatus = Schema.Literals(["queued", "delivered", "rejected"]);
export type AgentCommandStatus = typeof AgentCommandStatus.Type;

export class AgentCommand extends Schema.Class<AgentCommand>("@cycle/agents/AgentCommand")({
  commandId: AgentCommandId,
  commandType: AgentCommandType,
  createdAt: AgentTimestamp,
  deliveredAt: Schema.optional(AgentTimestamp),
  payload: AgentJsonObject,
  runId: Schema.optional(AgentRunId),
  status: AgentCommandStatus,
  taskId: Schema.optional(AgentTaskId),
  threadId: AgentThreadId,
}) {}

export class AgentCommandReceipt extends Schema.Class<AgentCommandReceipt>(
  "@cycle/agents/AgentCommandReceipt",
)({
  commandId: AgentCommandId,
  status: AgentCommandStatus,
  taskId: Schema.optional(AgentTaskId),
  threadId: AgentThreadId,
}) {}
