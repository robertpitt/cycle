import { Schema } from "effect";

export class AgentRuntimeFailure extends Schema.TaggedErrorClass<AgentRuntimeFailure>(
  "@cycle/agents/AgentRuntimeFailure",
)("AgentRuntimeFailure", {
  cause: Schema.optional(Schema.Unknown),
  code: Schema.String,
  message: Schema.String,
  retryable: Schema.optional(Schema.Boolean),
}) {}

export type AgentRuntimeError = AgentRuntimeFailure;
