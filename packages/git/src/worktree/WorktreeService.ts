import { Context, Effect } from "effect";
import type { GitAdapterError } from "../errors/index.ts";

export type WorktreeMode = "disposable" | "implementation";
export type WorktreeStatus = "active" | "cleaned" | "retained" | "failed";
export type BranchAssociationStatus = "active" | "superseded" | "failed" | "abandoned";

export type WorktreeRecord = {
  readonly worktreeId: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly mode: WorktreeMode;
  readonly path: string;
  readonly baseRef: string;
  readonly baseSha: string;
  readonly branchName?: string;
  readonly branchRef?: string;
  readonly status: WorktreeStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cleanedAt?: string;
  readonly retentionReason?: string;
  readonly lastError?: string;
};

export type BranchAssociation = {
  readonly branchAssociationId: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly jobId: string;
  readonly branchName: string;
  readonly branchRef: string;
  readonly baseSha: string;
  readonly headSha: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: BranchAssociationStatus;
  readonly handoverCommentId?: string;
};

export type WorktreePathPolicy = {
  readonly worktreeStoragePath: string;
  readonly gitDbStoragePath?: string;
  readonly forbiddenPaths?: readonly string[];
};

export type CreateDisposableWorktreeInput = WorktreePathPolicy & {
  readonly repositoryPath: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly baseRef?: string;
};

export type CreateImplementationWorktreeInput = WorktreePathPolicy & {
  readonly repositoryPath: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly ticketId: string;
  readonly ticketSlugSource?: string;
  readonly ticketType?: string | null;
  readonly baseRef?: string;
};

export type InspectWorktreeInput = {
  readonly path: string;
};

export type WorktreeInspection = {
  readonly path: string;
  readonly headSha: string;
  readonly branchName?: string;
  readonly dirty: boolean;
  readonly statusPorcelain: string;
};

export type WorktreeDiff = {
  readonly path: string;
  readonly dirty: boolean;
  readonly statusPorcelain: string;
  readonly patch: string;
};

export type CommitWorktreeInput = {
  readonly repositoryPath: string;
  readonly worktree: WorktreeRecord;
  readonly message: string;
  readonly allowEmpty?: boolean;
};

export type WorktreeCommit = {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly message: string;
};

export type BranchCollisionAssociation = Pick<BranchAssociation, "branchName" | "ticketId">;

export type CreateOrUpdateBranchInput = {
  readonly repositoryPath: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly ticketId: string;
  readonly desiredBranchName: string;
  readonly targetSha: string;
  readonly baseSha: string;
  readonly existingAssociations?: readonly BranchCollisionAssociation[];
};

export type BranchPublication = {
  readonly association: BranchAssociation;
  readonly collision: BranchCollisionResolution;
};

export type CleanupWorktreeInput = {
  readonly repositoryPath: string;
  readonly worktree: WorktreeRecord;
  readonly pathPolicy?: WorktreePathPolicy;
};

export type RetainWorktreeInput = {
  readonly worktree: WorktreeRecord;
  readonly reason: string;
};

export type BranchCollisionResolution =
  | {
      readonly type: "none";
      readonly branchName: string;
      readonly branchRef: string;
    }
  | {
      readonly type: "same-ticket";
      readonly branchName: string;
      readonly branchRef: string;
    }
  | {
      readonly type: "renamed";
      readonly desiredBranchName: string;
      readonly branchName: string;
      readonly branchRef: string;
    };

export type ResolveBranchCollisionInput = {
  readonly desiredBranchName: string;
  readonly ticketId: string;
  readonly existingBranches: readonly string[];
  readonly existingAssociations?: readonly BranchCollisionAssociation[];
  readonly maxAttempts?: number;
};

export type WorktreeServiceShape = {
  readonly createDisposableWorktree: (
    input: CreateDisposableWorktreeInput,
  ) => Effect.Effect<WorktreeRecord, GitAdapterError>;
  readonly createImplementationWorktree: (
    input: CreateImplementationWorktreeInput,
  ) => Effect.Effect<WorktreeRecord, GitAdapterError>;
  readonly inspectWorktree: (
    input: InspectWorktreeInput,
  ) => Effect.Effect<WorktreeInspection, GitAdapterError>;
  readonly diffWorktree: (
    input: InspectWorktreeInput,
  ) => Effect.Effect<WorktreeDiff, GitAdapterError>;
  readonly commitWorktree: (
    input: CommitWorktreeInput,
  ) => Effect.Effect<WorktreeCommit, GitAdapterError>;
  readonly createOrUpdateBranch: (
    input: CreateOrUpdateBranchInput,
  ) => Effect.Effect<BranchPublication, GitAdapterError>;
  readonly cleanupWorktree: (
    input: CleanupWorktreeInput,
  ) => Effect.Effect<WorktreeRecord, GitAdapterError>;
  readonly retainWorktree: (input: RetainWorktreeInput) => Effect.Effect<WorktreeRecord, never>;
};

export class WorktreeService extends Context.Service<WorktreeService, WorktreeServiceShape>()(
  "@cycle/git/WorktreeService",
) {}
