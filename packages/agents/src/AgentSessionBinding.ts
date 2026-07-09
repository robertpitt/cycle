import { Schema } from "effect";
import {
  AgentHarnessIdSchema,
  AgentJsonObject,
  AgentProviderIdSchema,
  AgentTimestamp,
} from "./AgentCommon.ts";
import { AgentRunId, AgentSessionId, AgentThreadId } from "./AgentIds.ts";

export const AgentSessionBindingStatus = Schema.Literals(["active", "suspended", "closed", "lost"]);
export type AgentSessionBindingStatus = typeof AgentSessionBindingStatus.Type;

export class AgentSessionBinding extends Schema.Class<AgentSessionBinding>(
  "@cycle/agents/AgentSessionBinding",
)({
  adapterVersion: Schema.String,
  capabilities: AgentJsonObject,
  createdAt: AgentTimestamp,
  harnessId: AgentHarnessIdSchema,
  providerId: AgentProviderIdSchema,
  providerSessionId: Schema.optional(Schema.String),
  providerThreadId: Schema.optional(Schema.String),
  replayCursor: Schema.optional(Schema.String),
  resumeCursor: Schema.optional(Schema.String),
  runId: AgentRunId,
  sessionId: AgentSessionId,
  status: AgentSessionBindingStatus,
  threadId: AgentThreadId,
  updatedAt: AgentTimestamp,
}) {}
