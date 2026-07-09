import { Schema } from "effect";

export const AgentChatThreadStatus = Schema.Literals(["open", "busy", "archived"]);
export type AgentChatThreadStatus = typeof AgentChatThreadStatus.Type;

export class AgentChatThread extends Schema.Class<AgentChatThread>(
  "@cycle/agent-chat/AgentChatThread",
)({
  activeTaskId: Schema.optional(Schema.String),
  agentId: Schema.String,
  createdAt: Schema.String,
  harnessId: Schema.String,
  model: Schema.optional(Schema.String),
  providerId: Schema.String,
  repositoryId: Schema.optional(Schema.String),
  status: AgentChatThreadStatus,
  threadId: Schema.String,
  title: Schema.optional(Schema.String),
  updatedAt: Schema.String,
}) {}
