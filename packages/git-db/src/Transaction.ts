import type { Effect } from "effect";
import type { CommitOptions, Snapshot } from "./GitDbSchemas.ts";
import type { GitDbError } from "./GitDbErrors.ts";
import type { StoreServiceShape, Transaction } from "./Store.ts";

export type { CommitOptions, Transaction };

export const begin = (
  store: StoreServiceShape,
  pointer?: string,
): Effect.Effect<Transaction, GitDbError> => store.begin(pointer);

export const commit = (
  transaction: Transaction,
  options?: CommitOptions,
): Effect.Effect<Snapshot, GitDbError> => transaction.commit(options);

export const abort = (transaction: Transaction): Effect.Effect<void, GitDbError> =>
  transaction.abort();
