import { Context, Effect, Layer, Scope } from "effect";
import type { GitStoreError } from "./GitStoreErrors.ts";
import type { GitStoreOpenOptions } from "./GitStoreSchemas.ts";
import { GitStore, type GitStoreShape } from "./GitStore.ts";
import {
  encodeGitStoreInstanceKey,
  GitStoreInstances,
  GitStoreInstancesLive,
} from "./GitStoreInstances.ts";
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

    const contextFor = (options: GitStoreOpenOptions) =>
      Effect.gen(function* () {
        const resolved = yield* paths.resolve(options);

        return yield* instances.contextEffect(encodeGitStoreInstanceKey(resolved));
      });

    const scoped = (
      options: GitStoreOpenOptions,
    ): Effect.Effect<GitStoreShape, GitStoreError, Scope.Scope> =>
      Effect.gen(function* () {
        const context = yield* contextFor(options);

        return Context.get(context, GitStore);
      });

    const withStore = <A, E, R>(
      options: GitStoreOpenOptions,
      use: (store: GitStoreShape) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, GitStoreError | E, R> =>
      Effect.scoped(
        Effect.gen(function* () {
          const context = yield* contextFor(options);
          const store = Context.get(context, GitStore);

          return yield* Effect.provide(use(store), context);
        }),
      );

    const invalidate = (options: GitStoreOpenOptions): Effect.Effect<void, GitStoreError> =>
      Effect.gen(function* () {
        const resolved = yield* paths.resolve(options);

        yield* instances.invalidate(encodeGitStoreInstanceKey(resolved));
      });

    return GitStores.of({
      invalidate,
      scoped,
      withStore,
    });
  }),
).pipe(Layer.provide(GitStoreInstancesLive));
