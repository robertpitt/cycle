import { Context, Effect, Layer, Ref, Semaphore } from "effect";

export type RepositoryPermitShape = {
  readonly withPermit: <A, E, R>(
    repositoryId: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
};

export class RepositoryPermit extends Context.Service<RepositoryPermit, RepositoryPermitShape>()(
  "@cycle/database/internals/repository/RepositoryPermit",
) {}

export const RepositoryPermitLive = Layer.effect(
  RepositoryPermit,
  Effect.gen(function* () {
    const semaphores = yield* Ref.make(new Map<string, Semaphore.Semaphore>());

    const semaphoreFor = Effect.fn("RepositoryPermit.semaphoreFor")(function* (
      repositoryId: string,
    ) {
      const created = yield* Semaphore.make(1);
      return yield* Ref.modify(semaphores, (state) => {
        const existing = state.get(repositoryId);
        return existing === undefined
          ? [created, new Map(state).set(repositoryId, created)]
          : [existing, state];
      });
    });

    const withPermit: RepositoryPermitShape["withPermit"] = Effect.fn(
      "RepositoryPermit.withPermit",
    )(function* (repositoryId, effect) {
      const semaphore = yield* semaphoreFor(repositoryId);
      return yield* semaphore.withPermit(effect);
    });

    return RepositoryPermit.of({ withPermit });
  }),
);
