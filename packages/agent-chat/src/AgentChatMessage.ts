import { Schema } from "effect";

export class AgentChatMessage extends Schema.Class<AgentChatMessage>(
  "@cycle/agent-chat/AgentChatMessage",
)({
  content: Schema.String,
  createdAt: Schema.String,
  messageId: Schema.String,
  role: Schema.Literals(["system", "user", "assistant", "tool"]),
  status: Schema.Literals(["streaming", "completed", "failed"]),
  taskId: Schema.optional(Schema.String),
  updatedAt: Schema.String,
}) {}
