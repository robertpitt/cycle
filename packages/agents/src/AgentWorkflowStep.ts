import { Schema } from "effect";
import { AgentJson, AgentTerminalError, AgentTimestamp } from "./AgentCommon.ts";
import { AgentOperationId, AgentTaskId, AgentWorkflowStepId } from "./AgentIds.ts";

export const AgentWorkflowStepStatus = Schema.Literals([
  "pending",
  "running",
  "succeeded",
  "failed",
  "compensated",
]);
export type AgentWorkflowStepStatus = typeof AgentWorkflowStepStatus.Type;

export class AgentWorkflowStep extends Schema.Class<AgentWorkflowStep>(
  "@cycle/agents/AgentWorkflowStep",
)({
  attemptCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  completedAt: Schema.optional(AgentTimestamp),
  createdAt: AgentTimestamp,
  error: Schema.optional(AgentTerminalError),
  input: AgentJson,
  inputHash: Schema.String,
  name: Schema.String,
  operationId: AgentOperationId,
  output: Schema.optional(AgentJson),
  status: AgentWorkflowStepStatus,
  stepId: AgentWorkflowStepId,
  taskId: AgentTaskId,
  updatedAt: AgentTimestamp,
}) {}

export class AgentOperationReceipt extends Schema.Class<AgentOperationReceipt>(
  "@cycle/agents/AgentOperationReceipt",
)({
  completedAt: AgentTimestamp,
  inputHash: Schema.String,
  operationId: AgentOperationId,
  output: AgentJson,
  stepId: AgentWorkflowStepId,
  taskId: AgentTaskId,
}) {}
