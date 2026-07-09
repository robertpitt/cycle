import { Schema } from "effect";

export class AgentChatEvent extends Schema.Class<AgentChatEvent>(
  "@cycle/agent-chat/AgentChatEvent",
)({
  createdAt: Schema.String,
  eventId: Schema.String,
  payload: Schema.Record(Schema.String, Schema.Json),
  sequence: Schema.Int,
  taskId: Schema.optional(Schema.String),
  threadId: Schema.String,
  type: Schema.String,
}) {}
