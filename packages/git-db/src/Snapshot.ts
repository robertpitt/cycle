import type { Effect } from "effect";
import type { ChangeSet, HistoryOptions, Snapshot } from "./GitDbSchemas.ts";
import type { GitDbError } from "./GitDbErrors.ts";
import type { StoreServiceShape } from "./Store.ts";

export const get = (store: StoreServiceShape, id: string): Effect.Effect<Snapshot, GitDbError> =>
  store.snapshot(id);

export const history = (
  store: StoreServiceShape,
  from?: string,
  options?: HistoryOptions,
): Effect.Effect<ReadonlyArray<Snapshot>, GitDbError> => store.history(from, options);

export const diff = (
  store: StoreServiceShape,
  a: string,
  b: string,
): Effect.Effect<ChangeSet, GitDbError> => store.diff(a, b);

export const resolveId = (
  store: StoreServiceShape,
  from?: string,
): Effect.Effect<string | null, GitDbError> => store.resolveSnapshotId(from);
