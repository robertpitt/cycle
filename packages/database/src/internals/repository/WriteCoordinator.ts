import { Clock, Context, Effect, Layer } from "effect";
import { DatabaseConsistencyError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import { elapsedMs, gitIdentity, storage } from "../DatabaseBoundary.ts";
import type { PreparedWrite, RepositoryRuntime } from "../DatabaseRuntime.ts";
import { RepositoryRegistry } from "../RepositoryRegistry.ts";
import { ProjectionRepositoryStore } from "../projection/ProjectionRepositoryStore.ts";
import { RepositoryCoordinator } from "./RepositoryCoordinator.ts";
import { RepositoryPermit } from "./RepositoryPermit.ts";

export type WriteCoordinatorShape = {
  readonly writeAndSync: <A>(
    repositoryId: string,
    command: string,
    objectId: string | undefined,
    buildPlan: (repository: RepositoryRuntime) => Effect.Effect<PreparedWrite<A>, DatabaseFailure>,
    visible: () => Effect.Effect<boolean, DatabaseFailure>,
  ) => Effect.Effect<A, DatabaseFailure>;
};

export class WriteCoordinator extends Context.Service<WriteCoordinator, WriteCoordinatorShape>()(
  "@cycle/database/internals/repository/WriteCoordinator",
) {}

export const WriteCoordinatorLive = Layer.effect(
  WriteCoordinator,
  Effect.gen(function* () {
    const coordinator = yield* RepositoryCoordinator;
    const permit = yield* RepositoryPermit;
    const registry = yield* RepositoryRegistry;
    const repositories = yield* ProjectionRepositoryStore;

    const writeAndSync: WriteCoordinatorShape["writeAndSync"] = Effect.fn(
      "WriteCoordinator.writeAndSync",
    )(function* (repositoryId, command, objectId, buildPlan, visible) {
      return yield* permit.withPermit(
        repositoryId,
        Effect.gen(function* () {
          const repository = yield* registry.get(repositoryId);
          const previous = (yield* repositories.status(repositoryId)).activeSnapshotId;
          const startedAt = yield* Clock.currentTimeMillis;
          const prepared = yield* buildPlan(repository);
          const committed = yield* storage(
            `commit ${prepared.plan.label}`,
            repository.store.transaction(
              {
                ...prepared.commit,
                author: prepared.commit.author ?? gitIdentity(prepared.plan.actor),
                committer: prepared.commit.committer ?? gitIdentity(prepared.plan.actor),
              },
              (transaction) =>
                Effect.forEach(
                  prepared.plan.events,
                  (event) => repository.store.appendEvent(transaction, event),
                  { discard: true },
                ),
            ),
          );
          const written = {
            result: prepared.resolve(committed.snapshot),
            snapshotId: committed.snapshot.id,
          };
          yield* Effect.logInfo("write committed").pipe(
            Effect.annotateLogs({
              command,
              commitMs: elapsedMs(startedAt, yield* Clock.currentTimeMillis),
              objectId,
              repositoryId,
              service: "@cycle/database",
              snapshotId: written.snapshotId,
            }),
          );

          yield* coordinator.materializeSnapshot(repository, previous, written.snapshotId).pipe(
            Effect.catch((error) =>
              repositories
                .markSyncFailed(repositoryId, error.message)
                .pipe(Effect.andThen(Effect.fail(error))),
            ),
            Effect.mapError(
              (error) =>
                new DatabaseConsistencyError({
                  cause: error,
                  command,
                  committedSnapshotId: written.snapshotId,
                  message: `write committed but SQLite delta materialization failed for ${command}`,
                  objectId,
                  previousSnapshotId: previous,
                  repositoryId,
                }),
            ),
          );

          if (!(yield* visible())) {
            return yield* new DatabaseConsistencyError({
              command,
              committedSnapshotId: written.snapshotId,
              message: `write committed but ${objectId ?? "object"} is not visible in SQLite`,
              objectId,
              previousSnapshotId: previous,
              repositoryId,
            });
          }
          return written.result;
        }),
      );
    });

    return WriteCoordinator.of({ writeAndSync });
  }),
);
