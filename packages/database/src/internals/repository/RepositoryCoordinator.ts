import { Clock, Context, Effect, Layer } from "effect";
import { buildMaterialization } from "../../DatabaseMaterialization.ts";
import { DatabaseMaterializationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import type { RepositorySyncResult } from "../../RepositoryStore.ts";
import type { RepositoryInput, RepositoryStatus } from "../../domain/index.ts";
import {
  DEFAULT_POINTER,
  elapsedMs,
  errorMessage,
  isRemotePushRejection,
  nowIso,
  storage,
} from "../DatabaseBoundary.ts";
import type { RepositoryRuntime } from "../DatabaseRuntime.ts";
import { RepositoryRegistry } from "../RepositoryRegistry.ts";
import { makeDatabaseProjection } from "../projection/DatabaseProjection.ts";
import { ProjectionCatalogStore } from "../projection/ProjectionCatalogStore.ts";
import { ProjectionInboxStore } from "../projection/ProjectionInboxStore.ts";
import { ProjectionPageStore } from "../projection/ProjectionPageStore.ts";
import { ProjectionRepositoryStore } from "../projection/ProjectionRepositoryStore.ts";
import { ProjectionTicketStore } from "../projection/ProjectionTicketStore.ts";
import { ProjectionWriter } from "../projection/ProjectionWriter.ts";
import { RepositoryPermit } from "./RepositoryPermit.ts";

export type RepositoryCoordinatorShape = {
  readonly materializeSnapshot: (
    repository: RepositoryRuntime,
    previousSnapshotId: string | null,
    currentSnapshotId: string,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly push: (repositoryId: string) => Effect.Effect<RepositorySyncResult, DatabaseFailure>;
  readonly open: (input: RepositoryInput) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly rebuild: (repositoryId: string) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly sync: (repositoryId: string) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
};

export class RepositoryCoordinator extends Context.Service<
  RepositoryCoordinator,
  RepositoryCoordinatorShape
>()("@cycle/database/internals/repository/RepositoryCoordinator") {}

const log = (
  repositoryId: string,
  message: string,
  data?: Readonly<Record<string, unknown>>,
): Effect.Effect<void> =>
  Effect.logInfo(message).pipe(
    Effect.annotateLogs({
      ...(data === undefined ? {} : data),
      repositoryId,
      service: "@cycle/database",
    }),
  );

export const RepositoryCoordinatorLive = Layer.effect(
  RepositoryCoordinator,
  Effect.gen(function* () {
    const catalog = yield* ProjectionCatalogStore;
    const inbox = yield* ProjectionInboxStore;
    const pages = yield* ProjectionPageStore;
    const permit = yield* RepositoryPermit;
    const repositories = yield* ProjectionRepositoryStore;
    const registry = yield* RepositoryRegistry;
    const tickets = yield* ProjectionTicketStore;
    const writer = yield* ProjectionWriter;
    const projection = makeDatabaseProjection({
      catalog,
      inbox,
      pages,
      repositories,
      tickets,
      writer,
    });

    const pushStore = Effect.fn("RepositoryCoordinator.pushStore")(function* (
      repository: RepositoryRuntime,
    ) {
      return yield* repository.store
        .sync({ mode: "push", onDiverged: "error", pointers: [DEFAULT_POINTER] })
        .pipe(
          Effect.catch((error) =>
            isRemotePushRejection(error)
              ? log(repository.repositoryId, "repository push rejected: rebasing before retry", {
                  error: errorMessage(error),
                }).pipe(
                  Effect.andThen(
                    repository.store.sync({
                      mode: "full",
                      onDiverged: "rebase",
                      pointers: [DEFAULT_POINTER],
                    }),
                  ),
                )
              : Effect.fail(error),
          ),
        );
    });

    const materializeSnapshot = Effect.fn("RepositoryCoordinator.materializeSnapshot")(function* (
      repository: RepositoryRuntime,
      previousSnapshotId: string | null,
      currentSnapshotId: string,
    ) {
      const repositoryId = repository.repositoryId;
      const startedAt = yield* Clock.currentTimeMillis;
      const materialization = yield* buildMaterialization(
        projection,
        repository,
        previousSnapshotId,
        currentSnapshotId,
        (message, data) => log(repositoryId, message, data),
      ).pipe(
        Effect.mapError(
          (error) =>
            new DatabaseMaterializationError({
              cause: error,
              message: "failed to build materialization plan",
              repositoryId,
            }),
        ),
      );

      yield* log(repositoryId, "sync materialization plan built", {
        buildMs: elapsedMs(startedAt, yield* Clock.currentTimeMillis),
        commitChanges: materialization.commitChanges.length,
        commits: materialization.commits.length,
        comments: materialization.comments.length,
        deletedRecords: materialization.deletedRecords.length,
        deletedTickets: materialization.deletedTickets.length,
        fullRebuild: materialization.fullRebuild,
        inboxItems: materialization.inboxItems.length,
        pages: materialization.pages.length,
        previousSnapshotId,
        records: materialization.records.length,
        snapshotId: currentSnapshotId,
        tickets: materialization.tickets.length,
        warnings: materialization.warnings.length,
      });

      const applyStartedAt = yield* Clock.currentTimeMillis;
      const status = yield* writer.apply(
        repositoryId,
        currentSnapshotId,
        yield* nowIso(),
        materialization,
      );
      yield* registry.setCycleMetadata(repositoryId, materialization.cycleMetadata);
      yield* log(repositoryId, "sync completed", {
        activeGeneration: status.activeGeneration,
        applyMs: elapsedMs(applyStartedAt, yield* Clock.currentTimeMillis),
        repositoryState: status.activeSnapshotId === null ? "no_snapshot" : status.status,
        snapshotId: status.activeSnapshotId,
        warningCount: status.warningCount,
      });
      return status;
    });

    const syncWithoutPermit = Effect.fn("RepositoryCoordinator.syncWithoutPermit")(function* (
      repositoryId: string,
    ) {
      const repository = yield* registry.get(repositoryId);
      yield* repositories.markSyncStarted(repositoryId, yield* nowIso());
      yield* log(repositoryId, "sync started", {
        displayName: repository.displayName,
        gitDir: repository.gitDir,
        worktreePath: repository.worktreePath,
      });

      return yield* Effect.gen(function* () {
        const current = yield* storage(
          "read current snapshot",
          repository.store.currentSnapshotForPointer(DEFAULT_POINTER),
        );
        const previous = (yield* repositories.status(repositoryId)).activeSnapshotId;

        if (current === null) {
          const status = yield* writer.reset(repositoryId, yield* nowIso());
          yield* registry.setCycleMetadata(repositoryId, undefined);
          return status;
        }
        if (previous === current.id) {
          const status = yield* repositories.activateSnapshot({
            completedAt: yield* nowIso(),
            repositoryId,
            snapshotId: current.id,
          });
          yield* registry.setCycleMetadata(repositoryId, status.cycleMetadata);
          return status;
        }
        return yield* materializeSnapshot(repository, previous, current.id);
      }).pipe(
        Effect.catch((error) =>
          repositories
            .markSyncFailed(repositoryId, error.message)
            .pipe(
              Effect.andThen(log(repositoryId, "sync failed", { error: error.message })),
              Effect.andThen(Effect.fail(error)),
            ),
        ),
      );
    });

    const sync = Effect.fn("RepositoryCoordinator.sync")(function* (repositoryId: string) {
      return yield* permit.withPermit(repositoryId, syncWithoutPermit(repositoryId));
    });

    const open = Effect.fn("RepositoryCoordinator.open")(function* (input: RepositoryInput) {
      yield* projection.registerRepository(input);
      yield* registry.set({
        cycleMetadata: undefined,
        displayName: input.displayName ?? input.repositoryId,
        gitDir: input.gitDir,
        repositoryId: input.repositoryId,
        store: input.store,
        worktreePath: input.worktreePath,
      });
      yield* projection.setCycleRepositoryMetadata(input.repositoryId, undefined);

      if (input.syncOnOpen === false) {
        return yield* projection.repositoryStatus(input.repositoryId);
      }
      return yield* sync(input.repositoryId);
    });

    const push = Effect.fn("RepositoryCoordinator.push")(function* (repositoryId: string) {
      return yield* permit.withPermit(
        repositoryId,
        Effect.gen(function* () {
          const repository = yield* registry.get(repositoryId);
          const result = yield* storage("push repository", pushStore(repository));
          yield* syncWithoutPermit(repositoryId);
          return result;
        }),
      );
    });

    const rebuild = Effect.fn("RepositoryCoordinator.rebuild")(function* (repositoryId: string) {
      return yield* permit.withPermit(
        repositoryId,
        Effect.gen(function* () {
          yield* registry.get(repositoryId);
          yield* writer.reset(repositoryId, yield* nowIso());
          return yield* syncWithoutPermit(repositoryId);
        }),
      );
    });

    return RepositoryCoordinator.of({ materializeSnapshot, open, push, rebuild, sync });
  }),
);
