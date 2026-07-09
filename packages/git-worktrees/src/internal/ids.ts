import type {
  BranchAssociationId,
  WorktreeHandoverId,
  WorktreeId,
  WorktreeLeaseId,
  WorktreeSetupRunId,
} from "../WorktreeSchemas.ts";

const randomSegment = (): string =>
  Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

export const newLocalId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${randomSegment()}`;

export const newWorktreeId = (): WorktreeId => newLocalId("worktree") as WorktreeId;

export const newWorktreeLeaseId = (): WorktreeLeaseId =>
  newLocalId("worktree_lease") as WorktreeLeaseId;

export const newWorktreeSetupRunId = (): WorktreeSetupRunId =>
  newLocalId("worktree_setup") as WorktreeSetupRunId;

export const newWorktreeHandoverId = (): WorktreeHandoverId =>
  newLocalId("worktree_handover") as WorktreeHandoverId;

export const newBranchAssociationId = (): BranchAssociationId =>
  newLocalId("branch_assoc") as BranchAssociationId;

export const newLifecycleEventId = (): string => newLocalId("worktree_event");
