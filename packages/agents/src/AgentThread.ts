import { Schema } from "effect";
import {
  AgentAuthority,
  AgentHarnessIdSchema,
  AgentJsonObject,
  AgentProviderIdSchema,
  AgentTimestamp,
} from "./AgentCommon.ts";
import { AgentTaskId, AgentThreadId } from "./AgentIds.ts";

export const AgentThreadKind = Schema.Literals([
  "interactive",
  "ticket-implementation",
  "research",
  "scheduled",
]);
export type AgentThreadKind = typeof AgentThreadKind.Type;

export const AgentThreadStatus = Schema.Literals(["open", "archived"]);
export type AgentThreadStatus = typeof AgentThreadStatus.Type;

export class AgentThread extends Schema.Class<AgentThread>("@cycle/agents/AgentThread")({
  activeTaskId: Schema.optional(AgentTaskId),
  agentId: Schema.String,
  archivedAt: Schema.optional(AgentTimestamp),
  authority: AgentAuthority,
  createdAt: AgentTimestamp,
  harnessId: AgentHarnessIdSchema,
  kind: AgentThreadKind,
  lastSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  lastTaskId: Schema.optional(AgentTaskId),
  metadata: AgentJsonObject,
  model: Schema.optional(Schema.String),
  providerId: AgentProviderIdSchema,
  repositoryId: Schema.optional(Schema.String),
  schemaVersion: Schema.Literal(1),
  status: AgentThreadStatus,
  summary: Schema.optional(Schema.String),
  threadId: AgentThreadId,
  ticketId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  updatedAt: AgentTimestamp,
  workflowId: Schema.optional(Schema.String),
}) {}

export class AgentThreadCreateInput extends Schema.Class<AgentThreadCreateInput>(
  "@cycle/agents/AgentThreadCreateInput",
)({
  agentId: Schema.String,
  authority: AgentAuthority,
  harnessId: AgentHarnessIdSchema,
  idempotencyKey: Schema.optional(Schema.String),
  kind: AgentThreadKind,
  metadata: Schema.optional(AgentJsonObject),
  model: Schema.optional(Schema.String),
  providerId: AgentProviderIdSchema,
  repositoryId: Schema.optional(Schema.String),
  ticketId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  workflowId: Schema.optional(Schema.String),
}) {}
