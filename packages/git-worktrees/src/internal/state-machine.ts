import { Effect } from "effect";
import { WorktreeStateConflictError } from "../WorktreeErrors.ts";
import type { WorktreeStatus } from "../WorktreeSchemas.ts";

const allowedTransitions: ReadonlyMap<WorktreeStatus, ReadonlySet<WorktreeStatus>> = new Map([
  ["creating", new Set(["initialising", "failed", "removing"])],
  ["initialising", new Set(["ready", "failed", "removing"])],
  ["ready", new Set(["removing", "retained", "failed"])],
  ["removing", new Set(["removed", "failed"])],
  ["failed", new Set(["ready", "removing"])],
  ["retained", new Set(["removing"])],
  ["removed", new Set()],
]);

export const canTransition = (from: WorktreeStatus, to: WorktreeStatus): boolean =>
  allowedTransitions.get(from)?.has(to) ?? false;

export const validateTransition = Effect.fn("validateTransition")(function* (input: {
  readonly from: WorktreeStatus;
  readonly repositoryId?: string | undefined;
  readonly to: WorktreeStatus;
  readonly worktreeId?: string | undefined;
}) {
  if (canTransition(input.from, input.to)) return;

  return yield* new WorktreeStateConflictError({
    currentStatus: input.from,
    message: `Invalid worktree status transition from ${input.from} to ${input.to}.`,
    nextStatus: input.to,
    repositoryId: input.repositoryId,
    worktreeId: input.worktreeId,
  });
});
