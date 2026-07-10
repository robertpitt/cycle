import { Schema } from "effect";

const nonEmpty = (expected: string) =>
  Schema.makeFilter<string>((value) => value.trim().length > 0 || expected, { expected });

const idPattern = (prefix: string) => new RegExp(`^${prefix}_[a-z0-9][a-z0-9_]*$`, "u");

const idSchema = <Brand extends string>(prefix: string, brand: Brand) =>
  Schema.String.check(
    Schema.isPattern(idPattern(prefix), { expected: `a ${prefix} identifier` }),
  ).pipe(Schema.brand(brand));

export const WorktreeId = idSchema("worktree", "WorktreeId");
export type WorktreeId = typeof WorktreeId.Type;

export const WorktreeLeaseId = idSchema("worktree_lease", "WorktreeLeaseId");
export type WorktreeLeaseId = typeof WorktreeLeaseId.Type;

export const WorktreeSetupRunId = idSchema("worktree_setup", "WorktreeSetupRunId");
export type WorktreeSetupRunId = typeof WorktreeSetupRunId.Type;

export const WorktreeHandoverId = idSchema("worktree_handover", "WorktreeHandoverId");
export type WorktreeHandoverId = typeof WorktreeHandoverId.Type;

export const BranchAssociationId = idSchema("branch_assoc", "BranchAssociationId");
export type BranchAssociationId = typeof BranchAssociationId.Type;

export const RepositoryId = Schema.String.check(nonEmpty("a non-empty repository id")).pipe(
  Schema.brand("RepositoryId"),
);
export type RepositoryId = typeof RepositoryId.Type;

export const JobId = Schema.String.check(nonEmpty("a non-empty job id")).pipe(
  Schema.brand("JobId"),
);
export type JobId = typeof JobId.Type;

export const TicketId = Schema.String.check(nonEmpty("a non-empty ticket id")).pipe(
  Schema.brand("TicketId"),
);
export type TicketId = typeof TicketId.Type;

export const AgentRunId = Schema.String.check(nonEmpty("a non-empty agent run id")).pipe(
  Schema.brand("AgentRunId"),
);
export type AgentRunId = typeof AgentRunId.Type;

export const ObjectId = Schema.String.check(
  Schema.isPattern(/^[0-9a-fA-F]{40}$/u, {
    expected: "a 40 character hexadecimal Git object id",
  }),
).pipe(Schema.brand("ObjectId"));
export type ObjectId = typeof ObjectId.Type;

export const WorktreeMode = Schema.Literals(["implementation", "disposable"]);
export type WorktreeMode = typeof WorktreeMode.Type;

export const WorktreeStatus = Schema.Literals([
  "creating",
  "initialising",
  "ready",
  "removing",
  "removed",
  "retained",
  "failed",
]);
export type WorktreeStatus = typeof WorktreeStatus.Type;

export const WorktreeLeasePurpose = Schema.Literals([
  "create",
  "agent",
  "handover",
  "cleanup",
  "reconcile",
]);
export type WorktreeLeasePurpose = typeof WorktreeLeasePurpose.Type;

export const WorktreeLeaseStatus = Schema.Literals(["active", "released", "expired", "stolen"]);
export type WorktreeLeaseStatus = typeof WorktreeLeaseStatus.Type;

export const BranchAssociationStatus = Schema.Literals([
  "active",
  "superseded",
  "failed",
  "abandoned",
]);
export type BranchAssociationStatus = typeof BranchAssociationStatus.Type;

export const WorktreeSetupStatus = Schema.Literals([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type WorktreeSetupStatus = typeof WorktreeSetupStatus.Type;

export const WorktreeHandoverStatus = Schema.Literals(["in_progress", "completed", "failed"]);
export type WorktreeHandoverStatus = typeof WorktreeHandoverStatus.Type;

export const WorktreeHandoverStep = Schema.Literals([
  "prepare_output",
  "publish_branch",
  "push_branch",
  "deliver_handover",
  "remove_worktree",
  "retain_worktree",
]);
export type WorktreeHandoverStep = typeof WorktreeHandoverStep.Type;

export const WorktreePushPolicy = Schema.Literals(["disabled", "best_effort", "required"]);
export type WorktreePushPolicy = typeof WorktreePushPolicy.Type;

export const WorktreeCleanupPolicy = Schema.Literals([
  "delete_after_handover",
  "retain_until",
  "retain_for_debug",
  "retain_on_failure",
  "operator_retained",
  "destructive_operator",
]);
export type WorktreeCleanupPolicy = typeof WorktreeCleanupPolicy.Type;

export const WorktreeSetupDirtyPolicy = Schema.Literals([
  "require_clean",
  "record_generated_changes",
]);
export type WorktreeSetupDirtyPolicy = typeof WorktreeSetupDirtyPolicy.Type;

export const WorktreeRetention = Schema.Struct({
  actor: Schema.optionalKey(Schema.String),
  expiresAt: Schema.optionalKey(Schema.String),
  policy: WorktreeCleanupPolicy,
  reason: Schema.optionalKey(Schema.String),
});
export type WorktreeRetention = typeof WorktreeRetention.Type;

export const WorktreeLastError = Schema.Struct({
  message: Schema.String,
  retryable: Schema.optionalKey(Schema.Boolean),
  tag: Schema.optionalKey(Schema.String),
});
export type WorktreeLastError = typeof WorktreeLastError.Type;

export const WorktreeRecord = Schema.Struct({
  agentRunId: Schema.optionalKey(AgentRunId),
  baseRef: Schema.String,
  baseSha: ObjectId,
  branchAssociationId: Schema.optionalKey(BranchAssociationId),
  cleanupPolicy: WorktreeCleanupPolicy,
  commonGitDir: Schema.String,
  createdAt: Schema.String,
  desiredBranchName: Schema.optionalKey(Schema.String),
  gitDir: Schema.String,
  jobId: JobId,
  lastError: Schema.optionalKey(WorktreeLastError),
  lastReconciledAt: Schema.optionalKey(Schema.String),
  mode: WorktreeMode,
  path: Schema.String,
  readySha: Schema.optionalKey(ObjectId),
  remoteBranchRef: Schema.optionalKey(Schema.String),
  remoteName: Schema.optionalKey(Schema.String),
  repositoryId: RepositoryId,
  repositoryPath: Schema.String,
  retention: Schema.optionalKey(WorktreeRetention),
  setupArtifactPaths: Schema.optionalKey(Schema.Array(Schema.String)),
  setupDirtyPolicy: WorktreeSetupDirtyPolicy,
  setupGeneratedChangesSummary: Schema.optionalKey(Schema.String),
  setupProfileId: Schema.optionalKey(Schema.String),
  setupRunId: Schema.optionalKey(WorktreeSetupRunId),
  status: WorktreeStatus,
  storageRoot: Schema.String,
  ticketId: Schema.optionalKey(TicketId),
  ticketSlugSource: Schema.optionalKey(Schema.String),
  ticketType: Schema.optionalKey(Schema.String),
  updatedAt: Schema.String,
  worktreeId: WorktreeId,
});
export type WorktreeRecord = typeof WorktreeRecord.Type;

export const WorktreeLease = Schema.Struct({
  acquiredAt: Schema.String,
  actor: Schema.String,
  fencingToken: Schema.Number,
  heartbeatAt: Schema.String,
  heartbeatDeadline: Schema.String,
  leaseId: WorktreeLeaseId,
  ownerId: Schema.String,
  purpose: WorktreeLeasePurpose,
  releasedAt: Schema.optionalKey(Schema.String),
  repositoryId: RepositoryId,
  status: WorktreeLeaseStatus,
  worktreeId: WorktreeId,
});
export type WorktreeLease = typeof WorktreeLease.Type;

export const BranchAssociation = Schema.Struct({
  baseSha: ObjectId,
  branchAssociationId: BranchAssociationId,
  branchName: Schema.String,
  branchRef: Schema.String,
  createdAt: Schema.String,
  handoverId: Schema.optionalKey(WorktreeHandoverId),
  headSha: ObjectId,
  jobId: JobId,
  pushedAt: Schema.optionalKey(Schema.String),
  remoteName: Schema.optionalKey(Schema.String),
  remoteRef: Schema.optionalKey(Schema.String),
  repositoryId: RepositoryId,
  status: BranchAssociationStatus,
  ticketId: TicketId,
  updatedAt: Schema.String,
  worktreeId: WorktreeId,
});
export type BranchAssociation = typeof BranchAssociation.Type;

export const WorktreeSetupCommand = Schema.Struct({
  args: Schema.optionalKey(Schema.Array(Schema.String)),
  command: Schema.String,
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  timeoutMs: Schema.optionalKey(Schema.Number),
});
export type WorktreeSetupCommand = typeof WorktreeSetupCommand.Type;

export const WorktreeSetupProfile = Schema.Struct({
  artifactPaths: Schema.optionalKey(Schema.Array(Schema.String)),
  commands: Schema.Array(WorktreeSetupCommand),
  dirtyPolicy: WorktreeSetupDirtyPolicy,
  displayName: Schema.optionalKey(Schema.String),
  environment: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  profileId: Schema.String,
  redactedEnvironmentKeys: Schema.optionalKey(Schema.Array(Schema.String)),
  timeoutMs: Schema.optionalKey(Schema.Number),
});
export type WorktreeSetupProfile = typeof WorktreeSetupProfile.Type;

export const WorktreeSetupRun = Schema.Struct({
  artifactPaths: Schema.optionalKey(Schema.Array(Schema.String)),
  commands: Schema.Array(WorktreeSetupCommand),
  completedAt: Schema.optionalKey(Schema.String),
  dirtyPolicy: WorktreeSetupDirtyPolicy,
  generatedChangesSummary: Schema.optionalKey(Schema.String),
  lastError: Schema.optionalKey(WorktreeLastError),
  outputSummary: Schema.optionalKey(Schema.String),
  profileId: Schema.String,
  readySha: Schema.optionalKey(ObjectId),
  redactedEnvironment: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  setupRunId: WorktreeSetupRunId,
  startedAt: Schema.String,
  status: WorktreeSetupStatus,
  worktreeId: WorktreeId,
});
export type WorktreeSetupRun = typeof WorktreeSetupRun.Type;

export const WorktreeHandoverRecord = Schema.Struct({
  backupBranchName: Schema.optionalKey(Schema.String),
  branchAssociationId: Schema.optionalKey(BranchAssociationId),
  branchName: Schema.optionalKey(Schema.String),
  commentId: Schema.optionalKey(Schema.String),
  commits: Schema.Array(ObjectId),
  completedAt: Schema.optionalKey(Schema.String),
  completedSteps: Schema.Array(WorktreeHandoverStep),
  createdAt: Schema.String,
  currentStep: Schema.optionalKey(WorktreeHandoverStep),
  handoverId: WorktreeHandoverId,
  jobId: JobId,
  lastError: Schema.optionalKey(WorktreeLastError),
  pullRequestUrl: Schema.optionalKey(Schema.String),
  remoteName: Schema.optionalKey(Schema.String),
  remoteRef: Schema.optionalKey(Schema.String),
  remoteUrl: Schema.optionalKey(Schema.String),
  repositoryId: RepositoryId,
  status: WorktreeHandoverStatus,
  summary: Schema.optionalKey(Schema.String),
  targetStatus: Schema.optionalKey(Schema.String),
  ticketId: Schema.optionalKey(TicketId),
  updatedAt: Schema.String,
  validation: Schema.optionalKey(Schema.String),
  worktreeId: WorktreeId,
});
export type WorktreeHandoverRecord = typeof WorktreeHandoverRecord.Type;

export const WorktreeLifecycleEvent = Schema.Struct({
  actor: Schema.String,
  dedupeKey: Schema.optionalKey(Schema.String),
  eventId: Schema.String,
  eventType: Schema.String,
  jobId: Schema.optionalKey(JobId),
  nextStatus: Schema.optionalKey(WorktreeStatus),
  occurredAt: Schema.String,
  payload: Schema.optionalKey(Schema.Unknown),
  previousStatus: Schema.optionalKey(WorktreeStatus),
  repositoryId: RepositoryId,
  sequence: Schema.Number,
  ticketId: Schema.optionalKey(TicketId),
  worktreeId: WorktreeId,
});
export type WorktreeLifecycleEvent = typeof WorktreeLifecycleEvent.Type;

export const WorktreeRuntimeConfig = Schema.Struct({
  backupAggregateBytes: Schema.Number,
  backupFileBytes: Schema.Number,
  cleanupPolicy: WorktreeCleanupPolicy,
  databasePath: Schema.String,
  defaultPushPolicy: WorktreePushPolicy,
  leaseDurationMs: Schema.Number,
  maxActiveWorktreesPerRepository: Schema.Number,
  maxReconciliationConcurrency: Schema.Number,
  maxSetupConcurrency: Schema.Number,
  pushTimeoutMs: Schema.Number,
  setupTimeoutMs: Schema.Number,
  storageRoot: Schema.String,
});
export type WorktreeRuntimeConfig = typeof WorktreeRuntimeConfig.Type;

export const WorktreeInspection = Schema.Struct({
  branchName: Schema.optionalKey(Schema.String),
  dirty: Schema.Boolean,
  headSha: ObjectId,
  path: Schema.String,
  statusPorcelain: Schema.String,
  unpublishedCommits: Schema.Array(ObjectId),
});
export type WorktreeInspection = typeof WorktreeInspection.Type;

export const WorktreeFinalization = Schema.Struct({
  backupBranchName: Schema.optionalKey(Schema.String),
  commits: Schema.Array(ObjectId),
  headSha: ObjectId,
  managedCommitSha: Schema.optionalKey(ObjectId),
  message: Schema.String,
  noChanges: Schema.Boolean,
  worktreeId: WorktreeId,
});
export type WorktreeFinalization = typeof WorktreeFinalization.Type;
