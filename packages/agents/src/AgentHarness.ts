import { Effect, Schema, Scope, Stream } from "effect";
import type { AgentAttempt } from "./AgentAttempt.ts";
import { AgentHarnessError } from "./AgentErrors.ts";
import { AgentJson, AgentJsonObject, AgentTimestamp } from "./AgentCommon.ts";
import type { AgentInteractionResponseInput } from "./AgentInteraction.ts";
import type { AgentRun } from "./AgentRun.ts";
import type { AgentTask } from "./AgentTask.ts";

export const AgentHarnessCapabilities = Schema.Struct({
  approvalRequests: Schema.Boolean,
  artifactEvents: Schema.Boolean,
  commandEvents: Schema.Boolean,
  fileChangeEvents: Schema.Boolean,
  historyReplay: Schema.Boolean,
  httpMcp: Schema.Boolean,
  interruption: Schema.Boolean,
  liveReattachment: Schema.Boolean,
  maxConcurrency: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  modelListing: Schema.Boolean,
  nativeSessions: Schema.Boolean,
  providerCodeTools: Schema.Boolean,
  readOnlySandbox: Schema.Boolean,
  reasoningSummaryEvents: Schema.Boolean,
  stdioMcp: Schema.Boolean,
  steering: Schema.Boolean,
  streaming: Schema.Boolean,
  structuredOutput: Schema.Boolean,
  usageReporting: Schema.Boolean,
  userInputRequests: Schema.Boolean,
  workspaceWriteSandbox: Schema.Boolean,
});
export type AgentHarnessCapabilities = typeof AgentHarnessCapabilities.Type;

export const AgentHarnessEventType = Schema.Literals([
  "turn-started",
  "text-delta",
  "reasoning-delta",
  "plan-updated",
  "diff-updated",
  "tool-started",
  "tool-progress",
  "tool-completed",
  "approval-requested",
  "approval-resolved",
  "user-input-requested",
  "user-input-resolved",
  "artifact",
  "usage",
  "warning",
  "failed",
  "cancelled",
  "completed",
]);
export type AgentHarnessEventType = typeof AgentHarnessEventType.Type;

export class AgentHarnessEvent extends Schema.Class<AgentHarnessEvent>(
  "@cycle/agents/AgentHarnessEvent",
)({
  eventType: AgentHarnessEventType,
  occurredAt: AgentTimestamp,
  payload: AgentJsonObject,
  providerCursor: Schema.optional(Schema.String),
  providerItemId: Schema.optional(Schema.String),
  providerTurnId: Schema.optional(Schema.String),
}) {}

export class AgentHarnessBinding extends Schema.Class<AgentHarnessBinding>(
  "@cycle/agents/AgentHarnessBinding",
)({
  adapterVersion: Schema.String,
  capabilities: AgentHarnessCapabilities,
  providerSessionId: Schema.optional(Schema.String),
  providerThreadId: Schema.optional(Schema.String),
  replayCursor: Schema.optional(Schema.String),
}) {}

export type AgentHarnessOpenInput = {
  readonly attempt: AgentAttempt;
  readonly run: AgentRun;
  readonly task: AgentTask;
};

export type AgentHarnessSession = {
  readonly binding: AgentHarnessBinding;
  readonly events: Stream.Stream<AgentHarnessEvent, AgentHarnessError>;
  readonly interrupt: (reason?: string) => Effect.Effect<void, AgentHarnessError>;
  readonly respond: (
    input: AgentInteractionResponseInput,
  ) => Effect.Effect<void, AgentHarnessError>;
  readonly steer: (message: string) => Effect.Effect<void, AgentHarnessError>;
};

export type AgentHarnessAvailability = {
  readonly available: boolean;
  readonly detail?: string;
};

export interface AgentHarness {
  readonly capabilities: AgentHarnessCapabilities;
  readonly detect: Effect.Effect<AgentHarnessAvailability, AgentHarnessError>;
  readonly id: string;
  readonly open: (
    input: AgentHarnessOpenInput,
  ) => Effect.Effect<AgentHarnessSession, AgentHarnessError, Scope.Scope>;
  readonly providerId: string;
  readonly reattach: (
    input: AgentHarnessOpenInput & { readonly binding: AgentHarnessBinding },
  ) => Effect.Effect<AgentHarnessSession, AgentHarnessError, Scope.Scope>;
}

export const AgentHarnessInteractionPayload = Schema.Struct({
  fields: AgentJsonObject,
  prompt: Schema.String,
  providerRequestId: Schema.String,
  safeDefault: Schema.optional(AgentJson),
});
