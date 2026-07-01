import type { AgentCapabilities, AgentProviderId } from "@cycle/agents/types";

export type AgentWorkJsonPrimitive = string | number | boolean | null;
export type AgentWorkJsonValue =
  | AgentWorkJsonPrimitive
  | readonly AgentWorkJsonValue[]
  | { readonly [key: string]: AgentWorkJsonValue };
export type AgentWorkJsonObject = { readonly [key: string]: AgentWorkJsonValue };

export type AgentWorkAuthorityMode =
  | "ticket-context"
  | "disposable-worktree"
  | "implementation-worktree";

export type AgentWorkTrigger =
  | "assignment-pickup"
  | "agent-delegate"
  | "agent-mention"
  | "follow-up-implementation"
  | "manual-command"
  | "retry"
  | "resume";

export type AgentWorkJobStatus =
  | "queued"
  | "starting"
  | "running"
  | "waiting-for-input"
  | "suspending"
  | "suspended"
  | "resuming"
  | "retry-wait"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentWorkGate =
  | "global-paused"
  | "repository-paused"
  | "repository-agent-work-disabled"
  | "provider-missing"
  | "provider-disabled"
  | "agent-disabled"
  | "unsupported-provider-capability"
  | "mcp-unavailable"
  | "global-concurrency"
  | "repository-concurrency"
  | "agent-concurrency"
  | "duplicate-active-job"
  | "worktree-unavailable"
  | "invalid-ticket-state"
  | "stale-lease"
  | null;

export type AgentWorkFailureCode =
  | "invalid-ticket-type"
  | "invalid-ticket-status-for-trigger"
  | "provider-missing"
  | "provider-disabled"
  | "unsupported-provider-capability"
  | "global-paused"
  | "repository-paused"
  | "concurrency-limited"
  | "duplicate-active-job"
  | "mcp-unavailable"
  | "mcp-unauthorized-by-job-authority"
  | "provider-authentication-failure"
  | "provider-rate-limit"
  | "provider-turn-failed"
  | "provider-timeout"
  | "user-input-required"
  | "cancellation-requested"
  | "worktree-creation-failed"
  | "worktree-dirty-or-unavailable"
  | "provider-wrote-outside-worktree"
  | "branch-collision"
  | "git-commit-failed"
  | "branch-update-failed"
  | "status-transition-failed"
  | "handover-comment-failed"
  | "cleanup-failed"
  | "stale-lease"
  | "restart-recovery-failed";

export type AgentWorkError = {
  readonly code: AgentWorkFailureCode;
  readonly message: string;
  readonly remediation?: string;
  readonly retrySafe?: boolean;
};

export type AgentWorkJob = {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly executionId: string;
  readonly logicalJobKey: string;
  readonly dedupeKey: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly trigger: AgentWorkTrigger;
  readonly agentId: string;
  readonly providerId: AgentProviderId;
  readonly model?: string;
  readonly authorityMode: AgentWorkAuthorityMode;
  readonly status: AgentWorkJobStatus;
  readonly currentGate: AgentWorkGate;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly requestedBy: string;
  readonly workflowId: string;
  readonly providerSessionId?: string;
  readonly worktreeId?: string;
  readonly branchAssociationId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly lastProviderEventAt?: string;
  readonly lastError?: AgentWorkError;
  readonly metadata: AgentWorkJsonObject;
};

export type AgentWorkStatusHistoryRecord = {
  readonly historyId: string;
  readonly jobId: string;
  readonly fromStatus?: AgentWorkJobStatus;
  readonly toStatus: AgentWorkJobStatus;
  readonly gate: AgentWorkGate;
  readonly occurredAt: string;
  readonly actor: string;
  readonly reason?: string;
  readonly error?: AgentWorkError;
};

export type AgentWorkDelegate = {
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly agentId: string;
  readonly providerId: AgentProviderId;
  readonly model?: string;
  readonly enabled: boolean;
  readonly assignedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assignmentVersion: number;
  readonly notes?: string;
};

export type AgentWorkPauseScopeName = "global" | `repository:${string}`;

export type AgentWorkPauseScope = {
  readonly scope: AgentWorkPauseScopeName;
  readonly paused: boolean;
  readonly reason?: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type AgentWorkLease = {
  readonly leaseId: string;
  readonly jobId: string;
  readonly ownerId: string;
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
  readonly expiresAt: string;
};

export type AgentWorkCheckpoint = {
  readonly checkpointId: string;
  readonly jobId: string;
  readonly workflowId: string;
  readonly step: string;
  readonly retrySafe: boolean;
  readonly payload: AgentWorkJsonObject;
  readonly createdAt: string;
};

export type AgentWorktreeRecord = {
  readonly worktreeId: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly mode: "disposable" | "implementation";
  readonly path: string;
  readonly baseRef?: string;
  readonly baseSha?: string;
  readonly branchName?: string;
  readonly branchRef?: string;
  readonly status: "creating" | "ready" | "cleaning" | "cleaned" | "failed" | "retained";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cleanedAt?: string;
  readonly retentionReason?: string;
  readonly lastError?: AgentWorkError;
};

export type AgentBranchAssociation = {
  readonly branchAssociationId: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly jobId: string;
  readonly branchName: string;
  readonly branchRef: string;
  readonly baseSha?: string;
  readonly headSha?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: "active" | "superseded" | "failed" | "abandoned";
  readonly handoverCommentId?: string;
};

export type AgentProviderSessionBinding = {
  readonly bindingId: string;
  readonly jobId: string;
  readonly providerId: AgentProviderId;
  readonly providerSessionId: string;
  readonly status: "starting" | "active" | "idle" | "failed" | "closed";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastActivityAt?: string;
  readonly lastError?: AgentWorkError;
  readonly metadata: AgentWorkJsonObject;
};

export type AgentWorkActivityRecord = {
  readonly activityId: string;
  readonly jobId?: string;
  readonly repositoryId?: string;
  readonly ticketId?: string;
  readonly kind: string;
  readonly message: string;
  readonly occurredAt: string;
  readonly payload: AgentWorkJsonObject;
};

export type AgentWorkProviderRecord = {
  readonly providerId: AgentProviderId;
  readonly enabled: boolean;
  readonly available: boolean;
  readonly capabilities: AgentCapabilities;
};

export type LocalAgentWorkEventType =
  | "ticket.created"
  | "ticket.updated"
  | "ticket.status_changed"
  | "ticket.comment_added"
  | "ticket.type_changed"
  | "local.agent_delegate_changed"
  | "local.agent_job_created"
  | "local.agent_job_status_changed"
  | "local.agent_pause_changed"
  | "local.agent_settings_changed"
  | "local.workflow_checkpointed"
  | "local.worktree_created"
  | "local.worktree_cleaned"
  | "git.branch_created"
  | "git.branch_updated";

export type LocalAgentWorkEvent = {
  readonly sequence: number;
  readonly eventId: string;
  readonly eventType: LocalAgentWorkEventType;
  readonly eventVersion: number;
  readonly occurredAt: string;
  readonly repositoryId?: string;
  readonly ticketId?: string;
  readonly jobId?: string;
  readonly actor: string;
  readonly source: "api" | "usecase" | "scheduler" | "workflow" | "store" | "test";
  readonly dedupeKey?: string;
  readonly payload: AgentWorkJsonObject;
};

export type LocalAgentWorkEventInput = Omit<
  LocalAgentWorkEvent,
  "sequence" | "eventId" | "occurredAt"
> &
  Partial<Pick<LocalAgentWorkEvent, "eventId" | "occurredAt">>;

export type LocalAgentWorkEventFilter = {
  readonly afterSequence?: number;
  readonly eventTypes?: readonly LocalAgentWorkEventType[];
  readonly repositoryId?: string;
  readonly jobId?: string;
};

export const terminalAgentWorkStatuses = new Set<AgentWorkJobStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export const concurrencyCountingAgentWorkStatuses = new Set<AgentWorkJobStatus>([
  "starting",
  "running",
  "waiting-for-input",
  "suspending",
  "resuming",
  "cancelling",
]);

export const isTerminalAgentWorkStatus = (status: AgentWorkJobStatus): boolean =>
  terminalAgentWorkStatuses.has(status);

export const isConcurrencyCountingAgentWorkStatus = (status: AgentWorkJobStatus): boolean =>
  concurrencyCountingAgentWorkStatuses.has(status);
