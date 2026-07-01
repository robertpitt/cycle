import { Schema } from "effect";
import { JsonObject } from "./Agents.ts";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const strictSchema = <S extends Schema.Top>(schema: S): S =>
  schema.annotate({ parseOptions: StrictDecodeOptions }) as S;

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const ConcurrencyLimit = Schema.NullOr(PositiveInteger);

export const AgentWorkAuthorityMode = Schema.Literals([
  "ticket-context",
  "disposable-worktree",
  "implementation-worktree",
]);
export type AgentWorkAuthorityMode = typeof AgentWorkAuthorityMode.Type;

export const AgentWorkJobStatus = Schema.Literals([
  "queued",
  "starting",
  "running",
  "waiting-for-input",
  "suspending",
  "suspended",
  "resuming",
  "retry-wait",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
]);
export type AgentWorkJobStatus = typeof AgentWorkJobStatus.Type;

export const AgentWorkTrigger = Schema.Literals([
  "assignment-pickup",
  "agent-delegate",
  "agent-mention",
  "follow-up-implementation",
  "manual-command",
  "retry",
  "resume",
]);
export type AgentWorkTrigger = typeof AgentWorkTrigger.Type;

export const AgentWorkSettings = Schema.Struct({
  allowDisposableWorktreeForMentions: Schema.Boolean,
  allowFullAccessJobs: Schema.Boolean,
  defaultMentionAuthorityMode: AgentWorkAuthorityMode,
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  defaultProviderId: Schema.String,
  enabledProviders: Schema.Array(Schema.String),
  maxConcurrentJobs: ConcurrencyLimit,
  paused: Schema.Boolean,
  perAgentOverrides: JsonObject,
});
export type AgentWorkSettings = typeof AgentWorkSettings.Type;

export const AgentWorkSettingsPatch = strictSchema(
  Schema.Struct({
    allowDisposableWorktreeForMentions: Schema.optional(Schema.Boolean),
    allowFullAccessJobs: Schema.optional(Schema.Boolean),
    defaultMentionAuthorityMode: Schema.optional(AgentWorkAuthorityMode),
    defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
    defaultProviderId: Schema.optional(Schema.String),
    enabledProviders: Schema.optional(Schema.Array(Schema.String)),
    maxConcurrentJobs: Schema.optional(ConcurrencyLimit),
    paused: Schema.optional(Schema.Boolean),
    perAgentOverrides: Schema.optional(JsonObject),
  }),
);
export type AgentWorkSettingsPatch = typeof AgentWorkSettingsPatch.Type;

export const RepositoryAgentWorkSettings = Schema.Struct({
  agentWorkDisabled: Schema.Boolean,
  maxConcurrentJobs: ConcurrencyLimit,
  model: Schema.optional(Schema.NullOr(Schema.String)),
  paused: Schema.Boolean,
  perAgentOverrides: JsonObject,
  providerId: Schema.optional(Schema.NullOr(Schema.String)),
  repositoryId: Schema.String,
  updatedAt: Schema.String,
});
export type RepositoryAgentWorkSettings = typeof RepositoryAgentWorkSettings.Type;

export const RepositoryAgentWorkSettingsPatch = strictSchema(
  Schema.Struct({
    agentWorkDisabled: Schema.optional(Schema.Boolean),
    maxConcurrentJobs: Schema.optional(ConcurrencyLimit),
    model: Schema.optional(Schema.NullOr(Schema.String)),
    paused: Schema.optional(Schema.Boolean),
    perAgentOverrides: Schema.optional(JsonObject),
    providerId: Schema.optional(Schema.NullOr(Schema.String)),
  }),
);
export type RepositoryAgentWorkSettingsPatch = typeof RepositoryAgentWorkSettingsPatch.Type;

export const AgentWorkDelegate = Schema.Struct({
  agentId: Schema.String,
  assignedBy: Schema.String,
  assignmentVersion: PositiveInteger,
  createdAt: Schema.String,
  enabled: Schema.Boolean,
  model: Schema.optional(Schema.NullOr(Schema.String)),
  notes: Schema.optional(Schema.NullOr(Schema.String)),
  providerId: Schema.String,
  repositoryId: Schema.String,
  ticketId: Schema.String,
  updatedAt: Schema.String,
});
export type AgentWorkDelegate = typeof AgentWorkDelegate.Type;

export const AgentWorkDelegateInput = strictSchema(
  Schema.Struct({
    agentId: Schema.String,
    assignedBy: Schema.optional(Schema.String),
    enabled: Schema.optional(Schema.Boolean),
    model: Schema.optional(Schema.NullOr(Schema.String)),
    notes: Schema.optional(Schema.NullOr(Schema.String)),
    providerId: Schema.optional(Schema.String),
  }),
);
export type AgentWorkDelegateInput = typeof AgentWorkDelegateInput.Type;

export const AgentWorkDelegateJobInput = strictSchema(
  Schema.Struct({
    agentId: Schema.String,
    assignedBy: Schema.optional(Schema.String),
    enabled: Schema.optional(Schema.Boolean),
    instructions: Schema.optional(Schema.NullOr(Schema.String)),
    model: Schema.optional(Schema.NullOr(Schema.String)),
    notes: Schema.optional(Schema.NullOr(Schema.String)),
    providerId: Schema.optional(Schema.String),
  }),
);
export type AgentWorkDelegateJobInput = typeof AgentWorkDelegateJobInput.Type;

export const AgentWorkJob = Schema.Struct({
  agentId: Schema.String,
  attempt: NonNegativeInteger,
  authorityMode: AgentWorkAuthorityMode,
  branchAssociationId: Schema.optional(Schema.NullOr(Schema.String)),
  completedAt: Schema.optional(Schema.NullOr(Schema.String)),
  createdAt: Schema.String,
  currentGate: Schema.optional(Schema.NullOr(Schema.String)),
  dedupeKey: Schema.String,
  executionId: Schema.String,
  jobId: Schema.String,
  lastError: Schema.optional(Schema.NullOr(Schema.String)),
  lastHeartbeatAt: Schema.optional(Schema.NullOr(Schema.String)),
  lastProviderEventAt: Schema.optional(Schema.NullOr(Schema.String)),
  logicalJobKey: Schema.String,
  maxAttempts: PositiveInteger,
  metadata: JsonObject,
  model: Schema.optional(Schema.NullOr(Schema.String)),
  providerId: Schema.String,
  providerSessionId: Schema.optional(Schema.NullOr(Schema.String)),
  repositoryId: Schema.String,
  requestedBy: Schema.String,
  schemaVersion: Schema.Literal(1),
  startedAt: Schema.optional(Schema.NullOr(Schema.String)),
  status: AgentWorkJobStatus,
  ticketId: Schema.String,
  trigger: AgentWorkTrigger,
  updatedAt: Schema.String,
  workflowId: Schema.optional(Schema.NullOr(Schema.String)),
  worktreeId: Schema.optional(Schema.NullOr(Schema.String)),
});
export type AgentWorkJob = typeof AgentWorkJob.Type;

export const AgentWorkDelegateJob = Schema.Struct({
  delegate: AgentWorkDelegate,
  job: AgentWorkJob,
});
export type AgentWorkDelegateJob = typeof AgentWorkDelegateJob.Type;

export const AgentWorkActivity = Schema.Struct({
  actor: Schema.optional(Schema.Unknown),
  dedupeKey: Schema.optional(Schema.NullOr(Schema.String)),
  eventId: Schema.String,
  eventType: Schema.String,
  eventVersion: PositiveInteger,
  jobId: Schema.optional(Schema.NullOr(Schema.String)),
  occurredAt: Schema.String,
  payload: JsonObject,
  repositoryId: Schema.optional(Schema.NullOr(Schema.String)),
  sequence: PositiveInteger,
  source: Schema.String,
  ticketId: Schema.optional(Schema.NullOr(Schema.String)),
});
export type AgentWorkActivity = typeof AgentWorkActivity.Type;

export const AgentWorkJobLogEntry = Schema.Struct({
  actor: Schema.optional(Schema.NullOr(Schema.String)),
  entryId: Schema.String,
  kind: Schema.Literals(["activity", "checkpoint", "event", "status"]),
  message: Schema.String,
  occurredAt: Schema.String,
  payload: JsonObject,
  source: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.NullOr(Schema.String)),
  title: Schema.String,
});
export type AgentWorkJobLogEntry = typeof AgentWorkJobLogEntry.Type;

export const AgentWorkJobLog = Schema.Struct({
  entries: Schema.Array(AgentWorkJobLogEntry),
  job: AgentWorkJob,
});
export type AgentWorkJobLog = typeof AgentWorkJobLog.Type;

export const AgentWorktreeInput = Schema.Struct({
  baseRef: Schema.optional(Schema.String),
  baseSha: Schema.optional(Schema.String),
  branchName: Schema.optional(Schema.String),
  branchRef: Schema.optional(Schema.String),
  cleanedAt: Schema.optional(Schema.String),
  createdAt: Schema.String,
  jobId: Schema.String,
  mode: Schema.Literals(["disposable", "implementation"]),
  path: Schema.String,
  repositoryId: Schema.String,
  retentionReason: Schema.optional(Schema.String),
  status: Schema.Literals(["creating", "ready", "cleaning", "cleaned", "failed", "retained"]),
  updatedAt: Schema.String,
  worktreeId: Schema.String,
});
export type AgentWorktreeInput = typeof AgentWorktreeInput.Type;

export const AgentWorkBranchAssociationInput = Schema.Struct({
  baseSha: Schema.optional(Schema.String),
  branchAssociationId: Schema.String,
  branchName: Schema.String,
  branchRef: Schema.String,
  createdAt: Schema.String,
  handoverCommentId: Schema.optional(Schema.String),
  headSha: Schema.optional(Schema.String),
  jobId: Schema.String,
  repositoryId: Schema.String,
  status: Schema.Literals(["active", "superseded", "failed", "abandoned"]),
  ticketId: Schema.String,
  updatedAt: Schema.String,
});
export type AgentWorkBranchAssociationInput = typeof AgentWorkBranchAssociationInput.Type;

export type AgentWorkEventInput = Omit<
  AgentWorkActivity,
  "eventId" | "eventVersion" | "occurredAt" | "sequence"
> & {
  readonly eventId?: string;
  readonly eventVersion?: number;
  readonly occurredAt?: string;
};

export const AgentWorkJobActivityInput = Schema.Struct({
  jobId: Schema.String,
  kind: Schema.String,
  message: Schema.String,
  payload: Schema.optional(JsonObject),
});
export type AgentWorkJobActivityInput = typeof AgentWorkJobActivityInput.Type;

export const AgentWorkJobFailureInput = Schema.Struct({
  actor: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
  message: Schema.String,
  remediation: Schema.optional(Schema.String),
  retrySafe: Schema.optional(Schema.Boolean),
});
export type AgentWorkJobFailureInput = typeof AgentWorkJobFailureInput.Type;

export const AgentWorkJobWaitingInput = Schema.Struct({
  actor: Schema.optional(Schema.String),
  message: Schema.String,
  payload: Schema.optional(JsonObject),
});
export type AgentWorkJobWaitingInput = typeof AgentWorkJobWaitingInput.Type;

export const AgentWorkJobCreateInput = Schema.Struct({
  agentId: Schema.String,
  authorityMode: AgentWorkAuthorityMode,
  dedupeKey: Schema.optional(Schema.String),
  logicalJobKey: Schema.String,
  metadata: Schema.optional(JsonObject),
  model: Schema.optional(Schema.NullOr(Schema.String)),
  providerId: Schema.optional(Schema.String),
  repositoryId: Schema.String,
  requestedBy: Schema.String,
  ticketId: Schema.String,
  trigger: AgentWorkTrigger,
});
export type AgentWorkJobCreateInput = typeof AgentWorkJobCreateInput.Type;

export type AgentWorkJobListQuery = {
  readonly repositoryId?: string;
  readonly ticketId?: string;
  readonly status?: string;
};

export type AgentWorkActivityQuery = {
  readonly after?: number;
  readonly limit?: number;
  readonly repositoryId?: string;
};

export const AgentWorkJobCancelPayload = strictSchema(
  Schema.Struct({
    reason: Schema.optional(Schema.String),
    requestedBy: Schema.optional(Schema.String),
  }),
);
export type AgentWorkJobCancelPayload = typeof AgentWorkJobCancelPayload.Type;

export const AgentWorkJobResumePayload = strictSchema(
  Schema.Struct({
    requestedBy: Schema.optional(Schema.String),
  }),
);
export type AgentWorkJobResumePayload = typeof AgentWorkJobResumePayload.Type;
