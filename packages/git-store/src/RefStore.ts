import { Context, Effect, Layer } from "effect";
import type { GitStoreError } from "./GitStoreErrors.ts";
import type { ObjectId, RefName } from "./GitStoreSchemas.ts";
import { RefReader, type RefTarget } from "./RefReader.ts";
import { RefTransaction, type RefUpdateOptions } from "./RefTransaction.ts";

export type RefStoreShape = {
  readonly delete: (ref: string, options?: RefUpdateOptions) => Effect.Effect<void, GitStoreError>;
  readonly exists: (ref: string) => Effect.Effect<boolean, GitStoreError>;
  readonly list: (prefix?: string) => Effect.Effect<ReadonlyArray<RefTarget>, GitStoreError>;
  readonly read: (ref: string) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly resolve: (ref: string) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly symbolicTarget: (ref: string) => Effect.Effect<RefName | null, GitStoreError>;
  readonly update: (
    ref: string,
    target: string,
    options?: RefUpdateOptions,
  ) => Effect.Effect<void, GitStoreError>;
};

export class RefStore extends Context.Service<RefStore, RefStoreShape>()(
  "@cycle/git-store/RefStore",
) {}

export const RefStoreLive = Layer.effect(
  RefStore,
  Effect.gen(function* () {
    const reader = yield* RefReader;
    const transaction = yield* RefTransaction;

    return RefStore.of({
      delete: transaction.delete,
      exists: reader.exists,
      list: reader.list,
      read: reader.read,
      resolve: reader.resolve,
      symbolicTarget: reader.symbolicTarget,
      update: transaction.update,
    });
  }),
);
