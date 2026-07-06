import type { Effect } from "effect";
import type { MovePointerOptions, Snapshot } from "./GitDbSchemas.ts";
import type { GitDbError } from "./GitDbErrors.ts";
import type { StorePointer, StoreServiceShape, Transaction } from "./Store.ts";

export const get = (
  store: StoreServiceShape,
  name: string,
): Effect.Effect<StorePointer, GitDbError> => store.pointer(name);

export const localNames = (
  store: StoreServiceShape,
): Effect.Effect<ReadonlyArray<string>, GitDbError> => store.localPointers();

export const current = (pointer: StorePointer): Effect.Effect<Snapshot | null, GitDbError> =>
  pointer.current();

export const begin = (pointer: StorePointer): Effect.Effect<Transaction, GitDbError> =>
  pointer.begin();

export const move = (
  pointer: StorePointer,
  target: string,
  options?: MovePointerOptions,
): Effect.Effect<void, GitDbError> => pointer.move(target, options);
