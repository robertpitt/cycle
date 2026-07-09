import { Schema } from "effect";

const Cause = Schema.optional(Schema.Defect());
const ContextFields = {
  cause: Cause,
  jobId: Schema.optional(Schema.String),
  message: Schema.String,
  path: Schema.optional(Schema.String),
  repositoryId: Schema.optional(Schema.String),
  retryable: Schema.optional(Schema.Boolean),
  status: Schema.optional(Schema.String),
  worktreeId: Schema.optional(Schema.String),
};

export class WorktreePathPolicyError extends Schema.TaggedErrorClass<WorktreePathPolicyError>(
  "@cycle/git-worktrees/WorktreePathPolicyError",
)("WorktreePathPolicyError", {
  ...ContextFields,
  reason: Schema.String,
}) {}

export class WorktreeRepositoryError extends Schema.TaggedErrorClass<WorktreeRepositoryError>(
  "@cycle/git-worktrees/WorktreeRepositoryError",
)("WorktreeRepositoryError", {
  ...ContextFields,
  operation: Schema.String,
}) {}

export class WorktreeCreateError extends Schema.TaggedErrorClass<WorktreeCreateError>(
  "@cycle/git-worktrees/WorktreeCreateError",
)("WorktreeCreateError", {
  ...ContextFields,
  operation: Schema.String,
}) {}

export class WorktreeSetupError extends Schema.TaggedErrorClass<WorktreeSetupError>(
  "@cycle/git-worktrees/WorktreeSetupError",
)("WorktreeSetupError", {
  ...ContextFields,
  operation: Schema.String,
}) {}

export class WorktreeStateConflictError extends Schema.TaggedErrorClass<WorktreeStateConflictError>(
  "@cycle/git-worktrees/WorktreeStateConflictError",
)("WorktreeStateConflictError", {
  ...ContextFields,
  currentStatus: Schema.optional(Schema.String),
  expectedStatus: Schema.optional(Schema.String),
  nextStatus: Schema.optional(Schema.String),
}) {}

export class WorktreeLeaseConflictError extends Schema.TaggedErrorClass<WorktreeLeaseConflictError>(
  "@cycle/git-worktrees/WorktreeLeaseConflictError",
)("WorktreeLeaseConflictError", {
  ...ContextFields,
  fencingToken: Schema.optional(Schema.Number),
  purpose: Schema.optional(Schema.String),
}) {}

export class WorktreeNotFoundError extends Schema.TaggedErrorClass<WorktreeNotFoundError>(
  "@cycle/git-worktrees/WorktreeNotFoundError",
)("WorktreeNotFoundError", {
  ...ContextFields,
}) {}

export class WorktreeDirtyError extends Schema.TaggedErrorClass<WorktreeDirtyError>(
  "@cycle/git-worktrees/WorktreeDirtyError",
)("WorktreeDirtyError", {
  ...ContextFields,
  statusPorcelain: Schema.optional(Schema.String),
}) {}

export class NoWorktreeChangesError extends Schema.TaggedErrorClass<NoWorktreeChangesError>(
  "@cycle/git-worktrees/NoWorktreeChangesError",
)("NoWorktreeChangesError", {
  ...ContextFields,
}) {}

export class WorktreeFinalizeError extends Schema.TaggedErrorClass<WorktreeFinalizeError>(
  "@cycle/git-worktrees/WorktreeFinalizeError",
)("WorktreeFinalizeError", {
  ...ContextFields,
  operation: Schema.String,
}) {}

export class BranchNameError extends Schema.TaggedErrorClass<BranchNameError>(
  "@cycle/git-worktrees/BranchNameError",
)("BranchNameError", {
  ...ContextFields,
  branchName: Schema.String,
}) {}

export class BranchCollisionError extends Schema.TaggedErrorClass<BranchCollisionError>(
  "@cycle/git-worktrees/BranchCollisionError",
)("BranchCollisionError", {
  ...ContextFields,
  branchName: Schema.String,
  ticketId: Schema.optional(Schema.String),
}) {}

export class BranchPublishError extends Schema.TaggedErrorClass<BranchPublishError>(
  "@cycle/git-worktrees/BranchPublishError",
)("BranchPublishError", {
  ...ContextFields,
  branchName: Schema.optional(Schema.String),
  operation: Schema.String,
}) {}

export class RemotePushError extends Schema.TaggedErrorClass<RemotePushError>(
  "@cycle/git-worktrees/RemotePushError",
)("RemotePushError", {
  ...ContextFields,
  branchName: Schema.optional(Schema.String),
  category: Schema.String,
  remoteName: Schema.String,
}) {}

export class RemotePushConflictError extends Schema.TaggedErrorClass<RemotePushConflictError>(
  "@cycle/git-worktrees/RemotePushConflictError",
)("RemotePushConflictError", {
  ...ContextFields,
  branchName: Schema.String,
  remoteName: Schema.String,
}) {}

export class HandoverTargetError extends Schema.TaggedErrorClass<HandoverTargetError>(
  "@cycle/git-worktrees/HandoverTargetError",
)("HandoverTargetError", {
  ...ContextFields,
  handoverId: Schema.optional(Schema.String),
  operation: Schema.String,
}) {}

export class WorktreeCleanupError extends Schema.TaggedErrorClass<WorktreeCleanupError>(
  "@cycle/git-worktrees/WorktreeCleanupError",
)("WorktreeCleanupError", {
  ...ContextFields,
  operation: Schema.String,
}) {}

export class WorktreeBackupError extends Schema.TaggedErrorClass<WorktreeBackupError>(
  "@cycle/git-worktrees/WorktreeBackupError",
)("WorktreeBackupError", {
  ...ContextFields,
  branchName: Schema.optional(Schema.String),
  reason: Schema.String,
}) {}

export class WorktreeReconciliationError extends Schema.TaggedErrorClass<WorktreeReconciliationError>(
  "@cycle/git-worktrees/WorktreeReconciliationError",
)("WorktreeReconciliationError", {
  ...ContextFields,
  operation: Schema.String,
}) {}

export class WorktreeStoreError extends Schema.TaggedErrorClass<WorktreeStoreError>(
  "@cycle/git-worktrees/WorktreeStoreError",
)("WorktreeStoreError", {
  ...ContextFields,
  operation: Schema.String,
}) {}

export type WorktreeError =
  | WorktreePathPolicyError
  | WorktreeRepositoryError
  | WorktreeCreateError
  | WorktreeSetupError
  | WorktreeStateConflictError
  | WorktreeLeaseConflictError
  | WorktreeNotFoundError
  | WorktreeDirtyError
  | NoWorktreeChangesError
  | WorktreeFinalizeError
  | BranchNameError
  | BranchCollisionError
  | BranchPublishError
  | RemotePushError
  | RemotePushConflictError
  | HandoverTargetError
  | WorktreeCleanupError
  | WorktreeBackupError
  | WorktreeReconciliationError
  | WorktreeStoreError;
