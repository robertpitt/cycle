import { describe, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Ref } from "effect";
import { strict as assert } from "node:assert";
import {
  RepositoryPermit,
  RepositoryPermitLive,
} from "../src/internals/repository/RepositoryPermit.ts";

describe("RepositoryPermit", () => {
  it.effect("serializes operations for the same repository", () =>
    Effect.gen(function* () {
      const permit = yield* RepositoryPermit;
      const active = yield* Ref.make(0);
      const overlapped = yield* Ref.make(false);
      const firstEntered = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const secondAttempted = yield* Deferred.make<void>();

      const enter = (entered?: Deferred.Deferred<void>) =>
        Effect.gen(function* () {
          const count = yield* Ref.updateAndGet(active, (value) => value + 1);
          if (count > 1) yield* Ref.set(overlapped, true);
          if (entered !== undefined) yield* Deferred.succeed(entered, undefined);
        });
      const exit = Ref.update(active, (value) => value - 1);

      const first = yield* Effect.forkChild(
        permit.withPermit(
          "repository-a",
          enter(firstEntered).pipe(
            Effect.andThen(Deferred.await(releaseFirst)),
            Effect.ensuring(exit),
          ),
        ),
      );
      yield* Deferred.await(firstEntered);

      const second = yield* Effect.forkChild(
        Deferred.succeed(secondAttempted, undefined).pipe(
          Effect.andThen(permit.withPermit("repository-a", enter().pipe(Effect.ensuring(exit)))),
        ),
      );
      yield* Deferred.await(secondAttempted);
      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(second);

      assert.equal(yield* Ref.get(overlapped), false);
      assert.equal(yield* Ref.get(active), 0);
    }).pipe(Effect.provide(RepositoryPermitLive)),
  );

  it.effect("releases a repository permit after interruption", () =>
    Effect.gen(function* () {
      const permit = yield* RepositoryPermit;
      const entered = yield* Deferred.make<void>();
      const never = yield* Deferred.make<void>();
      const fiber = yield* Effect.forkChild(
        permit.withPermit(
          "repository-a",
          Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(never))),
        ),
      );

      yield* Deferred.await(entered);
      yield* Fiber.interrupt(fiber);
      const acquired = yield* permit.withPermit("repository-a", Effect.succeed(true));

      assert.equal(acquired, true);
    }).pipe(Effect.provide(RepositoryPermitLive)),
  );

  it.effect("allows different repositories to proceed concurrently", () =>
    Effect.gen(function* () {
      const permit = yield* RepositoryPermit;
      const firstEntered = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const secondEntered = yield* Deferred.make<void>();

      const first = yield* Effect.forkChild(
        permit.withPermit(
          "repository-a",
          Deferred.succeed(firstEntered, undefined).pipe(
            Effect.andThen(Deferred.await(releaseFirst)),
          ),
        ),
      );
      yield* Deferred.await(firstEntered);

      yield* permit.withPermit("repository-b", Deferred.succeed(secondEntered, undefined));
      assert.equal(yield* Deferred.isDone(secondEntered), true);

      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Fiber.join(first);
    }).pipe(Effect.provide(RepositoryPermitLive)),
  );
});
