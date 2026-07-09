import { Schema } from "effect";
import { AgentAuthority, AgentJson, AgentJsonObject, AgentTimestamp } from "./AgentCommon.ts";
import {
  AgentAttemptId,
  AgentInteractionId,
  AgentRunId,
  AgentTaskId,
  AgentThreadId,
} from "./AgentIds.ts";

export const AgentInteractionType = Schema.Literals(["approval", "user-input"]);
export type AgentInteractionType = typeof AgentInteractionType.Type;

export const AgentInteractionStatus = Schema.Literals([
  "open",
  "answered",
  "cancelled",
  "expired",
  "rejected",
]);
export type AgentInteractionStatus = typeof AgentInteractionStatus.Type;

export class AgentInteraction extends Schema.Class<AgentInteraction>(
  "@cycle/agents/AgentInteraction",
)({
  answeredAt: Schema.optional(AgentTimestamp),
  attemptId: AgentAttemptId,
  authority: AgentAuthority,
  createdAt: AgentTimestamp,
  fields: AgentJsonObject,
  idempotencyKey: Schema.String,
  interactionId: AgentInteractionId,
  prompt: Schema.String,
  providerRequestId: Schema.String,
  responderId: Schema.optional(Schema.String),
  response: Schema.optional(AgentJson),
  runId: AgentRunId,
  safeDefault: Schema.optional(AgentJson),
  status: AgentInteractionStatus,
  taskId: AgentTaskId,
  threadId: AgentThreadId,
  type: AgentInteractionType,
}) {}

export class AgentInteractionResponseInput extends Schema.Class<AgentInteractionResponseInput>(
  "@cycle/agents/AgentInteractionResponseInput",
)({
  commandId: Schema.String,
  interactionId: AgentInteractionId,
  providerRequestId: Schema.optional(Schema.String),
  responderId: Schema.String,
  response: AgentJson,
}) {}
