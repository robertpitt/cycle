import { Schema } from "effect";
import { AgentJson, AgentTimestamp } from "./AgentCommon.ts";
import {
  AgentArtifactId,
  AgentAttemptId,
  AgentMessageId,
  AgentRunId,
  AgentTaskId,
  AgentThreadId,
  AgentTurnId,
} from "./AgentIds.ts";

export const AgentMessageRole = Schema.Literals(["system", "user", "assistant", "tool"]);
export type AgentMessageRole = typeof AgentMessageRole.Type;

export const AgentMessageStatus = Schema.Literals(["streaming", "completed", "failed"]);
export type AgentMessageStatus = typeof AgentMessageStatus.Type;

export const AgentVisibility = Schema.Literals(["public", "internal", "diagnostic"]);
export type AgentVisibility = typeof AgentVisibility.Type;

export const AgentMessagePart = Schema.Union([
  Schema.TaggedStruct("text", { text: Schema.String }),
  Schema.TaggedStruct("reasoning-summary", { text: Schema.String }),
  Schema.TaggedStruct("tool-call", {
    arguments: AgentJson,
    callId: Schema.String,
    name: Schema.String,
  }),
  Schema.TaggedStruct("tool-result", {
    callId: Schema.String,
    isError: Schema.Boolean,
    output: AgentJson,
  }),
  Schema.TaggedStruct("file", { mediaType: Schema.optional(Schema.String), path: Schema.String }),
  Schema.TaggedStruct("image", { mediaType: Schema.String, uri: Schema.String }),
  Schema.TaggedStruct("artifact", { artifactId: AgentArtifactId }),
  Schema.TaggedStruct("approval-request", { interactionId: Schema.String, prompt: Schema.String }),
  Schema.TaggedStruct("approval-result", {
    approved: Schema.Boolean,
    interactionId: Schema.String,
  }),
  Schema.TaggedStruct("user-input-request", {
    interactionId: Schema.String,
    prompt: Schema.String,
  }),
  Schema.TaggedStruct("user-input-result", { interactionId: Schema.String, value: AgentJson }),
]);
export type AgentMessagePart = typeof AgentMessagePart.Type;

export class AgentMessage extends Schema.Class<AgentMessage>("@cycle/agents/AgentMessage")({
  attemptId: Schema.optional(AgentAttemptId),
  completedAt: Schema.optional(AgentTimestamp),
  createdAt: AgentTimestamp,
  messageId: AgentMessageId,
  parts: Schema.Array(AgentMessagePart),
  providerMessageId: Schema.optional(Schema.String),
  role: AgentMessageRole,
  runId: Schema.optional(AgentRunId),
  status: AgentMessageStatus,
  taskId: Schema.optional(AgentTaskId),
  threadId: AgentThreadId,
  turnId: Schema.optional(AgentTurnId),
  updatedAt: AgentTimestamp,
  visibility: AgentVisibility,
}) {}
