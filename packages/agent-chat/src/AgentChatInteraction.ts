import { Schema } from "effect";

export class AgentChatInteraction extends Schema.Class<AgentChatInteraction>(
  "@cycle/agent-chat/AgentChatInteraction",
)({
  fields: Schema.Record(Schema.String, Schema.Json),
  interactionId: Schema.String,
  prompt: Schema.String,
  status: Schema.Literals(["open", "answered", "cancelled", "expired", "rejected"]),
  taskId: Schema.String,
  type: Schema.Literals(["approval", "user-input"]),
}) {}
