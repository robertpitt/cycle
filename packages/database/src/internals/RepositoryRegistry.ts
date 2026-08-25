import { Context, Effect, Layer, Ref } from "effect";
import { DatabaseRepositoryNotFoundError } from "../DatabaseErrors.ts";
import type { CycleRepositoryMetadata } from "../domain/index.ts";
import type { RepositoryRuntime } from "./DatabaseRuntime.ts";

export type RepositoryRegistryShape = {
  readonly get: (
    repositoryId: string,
  ) => Effect.Effect<RepositoryRuntime, DatabaseRepositoryNotFoundError>;
  readonly set: (repository: RepositoryRuntime) => Effect.Effect<void>;
  readonly setCycleMetadata: (
    repositoryId: string,
    cycleMetadata: CycleRepositoryMetadata | undefined,
  ) => Effect.Effect<void>;
};

export class RepositoryRegistry extends Context.Service<
  RepositoryRegistry,
  RepositoryRegistryShape
>()("@cycle/database/internals/RepositoryRegistry") {}

export const RepositoryRegistryLive = Layer.effect(
  RepositoryRegistry,
  Effect.gen(function* () {
    const state = yield* Ref.make<ReadonlyMap<string, RepositoryRuntime>>(new Map());

    const get = Effect.fn("RepositoryRegistry.get")(function* (repositoryId: string) {
      const repository = (yield* Ref.get(state)).get(repositoryId);
      if (repository !== undefined) return repository;
      return yield* new DatabaseRepositoryNotFoundError({
        message: `Repository is not open: ${repositoryId}`,
        repositoryId,
      });
    });

    const set = Effect.fn("RepositoryRegistry.set")(function* (repository: RepositoryRuntime) {
      yield* Ref.update(state, (repositories) => {
        const next = new Map(repositories);
        next.set(repository.repositoryId, repository);
        return next;
      });
    });

    const setCycleMetadata = Effect.fn("RepositoryRegistry.setCycleMetadata")(function* (
      repositoryId: string,
      cycleMetadata: CycleRepositoryMetadata | undefined,
    ) {
      yield* Ref.update(state, (repositories) => {
        const repository = repositories.get(repositoryId);
        if (repository === undefined) return repositories;
        const next = new Map(repositories);
        next.set(repositoryId, { ...repository, cycleMetadata });
        return next;
      });
    });

    return RepositoryRegistry.of({ get, set, setCycleMetadata });
  }),
);
