import { Context, Effect, FileSystem, Layer } from "effect";
import {
  WorktreeReconciliationError,
  WorktreeStoreError,
  type WorktreeError,
} from "./WorktreeErrors.ts";
import type { RepositoryId, WorktreeRecord } from "./WorktreeSchemas.ts";
import { WorktreeFinalizer } from "./WorktreeFinalizer.ts";
import { WorktreeLifecycle } from "./WorktreeLifecycle.ts";
import { WorktreeStore } from "./WorktreeStore.ts";

export type WorktreeReconciliationResult = {
  readonly checked: number;
  readonly failed: number;
  readonly removed: number;
};

export type WorktreeReconcilerShape = {
  readonly reconcileRecord: (
    record: WorktreeRecord,
  ) => Effect.Effect<"failed" | "removed" | "retained", WorktreeError>;
  readonly reconcileRepository: (
    repositoryId: RepositoryId,
  ) => Effect.Effect<WorktreeReconciliationResult, WorktreeError>;
};

export class WorktreeReconciler extends Context.Service<
  WorktreeReconciler,
  WorktreeReconcilerShape
>()("@cycle/git-worktrees/WorktreeReconciler") {}

export const WorktreeReconcilerLive = Layer.effect(
  WorktreeReconciler,
  Effect.gen(function* () {
    const finalizer = yield* WorktreeFinalizer;
    const fs = yield* FileSystem.FileSystem;
    const lifecycle = yield* WorktreeLifecycle;
    const store = yield* WorktreeStore;

    const reconcileRecord = Effect.fn("WorktreeReconciler.reconcileRecord")(function* (
      record: WorktreeRecord,
    ) {
      const exists = yield* fs.exists(record.path).pipe(
        Effect.mapError(
          (cause) =>
            new WorktreeReconciliationError({
              cause,
              message: "Unable to inspect managed worktree path.",
              operation: "exists",
              path: record.path,
              repositoryId: record.repositoryId,
              worktreeId: record.worktreeId,
            }),
        ),
      );

      if (!exists) {
        if (record.status === "removing") {
          yield* store.transitionWithEvent({
            actor: "worktree-reconciler",
            eventType: "worktree.missing_removed",
            expectedStatus: "removing",
            nextStatus: "removed",
            worktreeId: record.worktreeId,
          });
          return "removed" as const;
        }
        if (record.status !== "removed" && record.status !== "failed") {
          yield* store.transitionWithEvent({
            actor: "worktree-reconciler",
            eventType: "worktree.missing_failed",
            expectedStatus: record.status,
            nextStatus: "failed",
            payload: { reason: "missing_directory" },
            worktreeId: record.worktreeId,
          });
        }
        return "failed" as const;
      }

      if (record.status === "removing") {
        yield* lifecycle.cleanup({
          actor: "worktree-reconciler",
          record,
        });
        return "removed" as const;
      }

      if (record.status === "ready" && record.cleanupPolicy === "delete_after_handover") {
        const inspection = yield* finalizer.inspect(record);
        if (inspection.dirty || inspection.unpublishedCommits.length > 0) {
          yield* finalizer.createBackupBranch({
            reason: "orphaned_ready_worktree",
            record,
          });
        }
        yield* lifecycle.cleanup({
          actor: "worktree-reconciler",
          record,
        });
        return "removed" as const;
      }

      return "retained" as const;
    });

    const reconcileRepository = Effect.fn("WorktreeReconciler.reconcileRepository")(function* (
      repositoryId: RepositoryId,
    ) {
      const records = yield* store.listActive(repositoryId).pipe(
        Effect.mapError(
          (cause) =>
            new WorktreeStoreError({
              cause,
              message: "Unable to list active worktrees for reconciliation.",
              operation: "listActive",
              repositoryId,
            }),
        ),
      );
      let removed = 0;
      let failed = 0;
      for (const record of records) {
        const result = yield* reconcileRecord(record).pipe(
          Effect.catch((cause) =>
            Effect.gen(function* () {
              yield* Effect.logWarning("worktree reconciliation failed").pipe(
                Effect.annotateLogs({
                  cause,
                  repositoryId: record.repositoryId,
                  service: "@cycle/git-worktrees",
                  worktreeId: record.worktreeId,
                }),
              );
              return "failed" as const;
            }),
          ),
        );
        if (result === "removed") removed++;
        if (result === "failed") failed++;
      }
      return {
        checked: records.length,
        failed,
        removed,
      };
    });

    return WorktreeReconciler.of({
      reconcileRecord,
      reconcileRepository,
    });
  }),
);
