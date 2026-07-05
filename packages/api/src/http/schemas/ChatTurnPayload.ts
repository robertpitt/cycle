import { Schema } from "effect";
import { AgentProviderId } from "./AgentProvidersResourceEnvelope.ts";
import { PositiveInteger, strictSchema } from "./shared.ts";

export const ChatMessagePayload = strictSchema(
  Schema.Struct({
    content: Schema.String,
    createdAt: Schema.optional(Schema.String),
    id: Schema.optional(Schema.String),
    role: Schema.Literals(["agent", "assistant", "system", "user"]),
  }),
);

export const ChatRepositoryPayload = strictSchema(
  Schema.Struct({
    displayName: Schema.optional(Schema.String),
    id: Schema.String,
    path: Schema.optional(Schema.String),
  }),
);

export const ChatStreamOptionsPayload = strictSchema(
  Schema.Struct({
    heartbeatMs: Schema.optional(PositiveInteger),
    includeArtifacts: Schema.optional(Schema.Boolean),
    includeProgress: Schema.optional(Schema.Boolean),
  }),
);

export const ChatTurnPayload = strictSchema(
  Schema.Struct({
    instructions: Schema.optional(Schema.String),
    message: Schema.String,
    messages: Schema.optional(Schema.Array(ChatMessagePayload)),
    model: Schema.optional(Schema.String),
    provider: Schema.optional(AgentProviderId),
    repositories: Schema.optional(Schema.Array(ChatRepositoryPayload)),
    sessionId: Schema.optional(Schema.String),
    stream: Schema.optional(ChatStreamOptionsPayload),
    threadId: Schema.optional(Schema.String),
  }),
);

export const ChatThreadParams = { threadId: Schema.String };
export const ChatMessageParams = { messageId: Schema.String, threadId: Schema.String };
