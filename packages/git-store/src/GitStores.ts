import { Context, Effect, Layer, Scope } from "effect";
import type { GitStoreError } from "./GitStoreErrors.ts";
import type { GitStoreOpenOptions } from "./GitStoreSchemas.ts";
import { GitStore, type GitStoreShape } from "./GitStore.ts";
import { GitStoreInstances, encodeGitStoreInstanceKey } from "./GitStoreInstances.ts";
import { RepositoryPaths } from "./RepositoryPaths.ts";

export type GitStoresShape = {
  readonly invalidate: (options: GitStoreOpenOptions) => Effect.Effect<void, GitStoreError>;
  readonly scoped: (
    options: GitStoreOpenOptions,
  ) => Effect.Effect<GitStoreShape, GitStoreError, Scope.Scope>;
  readonly withStore: <A, E, R>(
    options: GitStoreOpenOptions,
    use: (store: GitStoreShape) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, GitStoreError | E, R>;
};

export class GitStores extends Context.Service<GitStores, GitStoresShape>()(
  "@cycle/git-store/GitStores",
) {}

export const GitStoresLive = Layer.effect(
  GitStores,
  Effect.gen(function* () {
    const paths = yield* RepositoryPaths;
    const instances = yield* GitStoreInstances;

    const instanceKey = (options: GitStoreOpenOptions) =>
      paths.resolve(options).pipe(Effect.map(encodeGitStoreInstanceKey));

    const scoped = Effect.fn("GitStores.scoped")(function* (options: GitStoreOpenOptions) {
      const key = yield* instanceKey(options);
      const context = yield* instances.contextEffect(key);

      return Context.get(context, GitStore);
    });

    const withStore = Effect.fn("GitStores.withStore")(function* <A, E, R>(
      options: GitStoreOpenOptions,
      use: (store: GitStoreShape) => Effect.Effect<A, E, R>,
    ) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const key = yield* instanceKey(options);
          const context = yield* instances.contextEffect(key);
          const store = Context.get(context, GitStore);

          return yield* Effect.provide(use(store), context);
        }),
      );
    });

    const invalidate = Effect.fn("GitStores.invalidate")(function* (options: GitStoreOpenOptions) {
      const key = yield* instanceKey(options);

      yield* instances.invalidate(key);
    });

    return GitStores.of({
      invalidate,
      scoped,
      withStore,
    });
  }),
);
