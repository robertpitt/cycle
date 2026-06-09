import type { Effect } from "effect";
import type {
  CollectionEntry,
  CollectionInfo,
  CollectionListOptions,
  CollectionOptions,
  CollectionPage,
  CollectionPageOptions,
  CommitOptions,
  ReadOptions,
  Snapshot,
} from "../domain/index.ts";
import type { GitDbError } from "../errors/index.ts";
import type { StoreCollection, StoreServiceShape } from "./Store.ts";

export const get = <T = unknown>(
  store: StoreServiceShape,
  name: string,
  options?: CollectionOptions<T>,
): Effect.Effect<StoreCollection<T>, GitDbError> => store.collection<T>(name, options);

export const list = <TMeta = unknown>(
  store: StoreServiceShape,
  options?: ReadOptions,
): Effect.Effect<ReadonlyArray<CollectionInfo<TMeta>>, GitDbError> => store.collections(options);

export const entries = <T = unknown>(
  collection: StoreCollection<T>,
  options?: CollectionListOptions,
): Effect.Effect<ReadonlyArray<CollectionEntry<T>>, GitDbError> => collection.list(options);

export const page = <T = unknown>(
  collection: StoreCollection<T>,
  options?: CollectionPageOptions,
): Effect.Effect<CollectionPage<T>, GitDbError> => collection.page(options);

export const put = <T>(
  collection: StoreCollection<T>,
  id: string,
  value: T,
  options?: CommitOptions,
): Effect.Effect<Snapshot, GitDbError> => collection.put(id, value, options);
