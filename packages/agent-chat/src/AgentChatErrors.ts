import { Schema } from "effect";

export class AgentChatError extends Schema.TaggedErrorClass<AgentChatError>()("AgentChatError", {
  code: Schema.String,
  message: Schema.String,
  retryable: Schema.Boolean,
}) {}
