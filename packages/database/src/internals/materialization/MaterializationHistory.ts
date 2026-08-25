import { Effect } from "effect";
import type { DatabaseFailure } from "../../DatabaseErrors.ts";
import { storage } from "../DatabaseBoundary.ts";
import type { FoldedEvents, MaterializationTrace, RepositoryRuntime } from "../DatabaseRuntime.ts";
import type { RepositorySnapshot } from "../../RepositoryStore.ts";
import { emptyFoldedEvents } from "./EventFold.ts";
import type { MaterializationProjectionReader } from "./MaterializationTypes.ts";
export const readMaterializationHistory = (
  projection: MaterializationProjectionReader,
  repository: RepositoryRuntime,
  previousSnapshotId: string | null,
  currentSnapshotId: string,
  trace?: MaterializationTrace,
): Effect.Effect<
  {
    readonly fullRebuild: boolean;
    readonly sequenceStart: number;
    readonly snapshots: ReadonlyArray<RepositorySnapshot>;
  },
  DatabaseFailure
> =>
  Effect.gen(function* () {
    if (previousSnapshotId === null) {
      const history = yield* storage(
        "read full event history",
        repository.store.history(currentSnapshotId),
      );
      if (trace !== undefined)
        yield* trace("sync materialization selected full rebuild", {
          commits: history.length,
          reason: "no-previous-snapshot",
          snapshotId: currentSnapshotId,
        });

      return {
        fullRebuild: true,
        sequenceStart: 0,
        snapshots: history,
      };
    }

    const incremental = yield* readHistorySince(repository, currentSnapshotId, previousSnapshotId);

    if (!incremental.reachedPrevious) {
      if (trace !== undefined)
        yield* trace("sync materialization selected full rebuild", {
          commits: incremental.snapshots.length,
          previousSnapshotId,
          reason: "previous-snapshot-not-in-history",
          snapshotId: currentSnapshotId,
        });

      return {
        fullRebuild: true,
        sequenceStart: 0,
        snapshots: incremental.snapshots,
      };
    }

    const sequenceStart = yield* projection.repositories.maxCommitSequence(repository.repositoryId);
    if (trace !== undefined)
      yield* trace("sync materialization selected incremental replay", {
        commits: incremental.snapshots.length,
        previousSequence: sequenceStart,
        previousSnapshotId,
        snapshotId: currentSnapshotId,
      });

    return {
      fullRebuild: false,
      sequenceStart,
      snapshots: incremental.snapshots,
    };
  });

export const readHistorySince = (
  repository: RepositoryRuntime,
  currentSnapshotId: string,
  previousSnapshotId: string,
): Effect.Effect<
  {
    readonly reachedPrevious: boolean;
    readonly snapshots: ReadonlyArray<RepositorySnapshot>;
  },
  DatabaseFailure
> =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    const stack = [currentSnapshotId];
    const snapshots: Array<RepositorySnapshot> = [];
    let reachedPrevious = false;

    while (stack.length > 0) {
      const id = stack.shift();

      if (id === undefined) continue;
      if (id === previousSnapshotId) {
        reachedPrevious = true;
        continue;
      }
      if (seen.has(id)) continue;

      seen.add(id);

      const snapshot = yield* storage("read repository snapshot", repository.store.snapshot(id));
      snapshots.push(snapshot);

      for (const parent of snapshot.parents) {
        if (parent === previousSnapshotId) {
          reachedPrevious = true;
          continue;
        }
        if (!seen.has(parent)) {
          stack.push(parent);
        }
      }
    }

    return {
      reachedPrevious,
      snapshots,
    };
  });

export const seedIncrementalFoldedEvents = (
  projection: MaterializationProjectionReader,
  repositoryId: string,
): Effect.Effect<FoldedEvents, DatabaseFailure> =>
  Effect.gen(function* () {
    const folded = emptyFoldedEvents();
    const status = yield* projection.repositories.status(repositoryId);

    folded.cycleMetadata = status.cycleMetadata;

    return folded;
  });

export const valuesForIds = <A>(
  values: ReadonlyMap<string, A>,
  ids: ReadonlySet<string>,
): ReadonlyArray<A> =>
  [...ids].flatMap((id) => {
    const value = values.get(id);

    return value === undefined ? [] : [value];
  });
