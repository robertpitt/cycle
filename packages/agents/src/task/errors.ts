import { Schema } from "effect";

export class AgentTaskFailure extends Schema.TaggedErrorClass<AgentTaskFailure>(
  "@cycle/agents/AgentTaskFailure",
)("AgentTaskFailure", {
  cause: Schema.optional(Schema.Unknown),
  code: Schema.Literals([
    "invalid_request",
    "not_found",
    "conflict",
    "storage_failed",
    "unsupported_operation",
    "unknown",
  ]),
  message: Schema.String,
  retryable: Schema.optional(Schema.Boolean),
}) {}

export type AgentTaskServiceError = AgentTaskFailure;

export const agentTaskStorageFailure = (cause: unknown): AgentTaskFailure =>
  new AgentTaskFailure({
    cause,
    code: "storage_failed",
    message: cause instanceof Error ? cause.message : "Agent task storage operation failed.",
    retryable: false,
  });
