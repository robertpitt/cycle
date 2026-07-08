import { Clock, Context, Effect, Layer, PubSub, Ref, Stream } from "effect";
import type { GitStoreError } from "./GitStoreErrors.ts";
import type { ObjectId, RefName } from "./GitStoreSchemas.ts";
import { RefReader } from "./RefReader.ts";
import { GitStoreRuntime } from "./internal/runtime.ts";
import { pointerRef, validatePointerName, validateRefName } from "./internal/refs.ts";

export type GitStoreChangeSource = "external" | "fetch" | "local" | "pull" | "push" | "sync";

export type GitStoreRefChange = {
  readonly after: ObjectId | null;
  readonly before: ObjectId | null;
  readonly observedAt: string;
  readonly ref: RefName;
  readonly source: GitStoreChangeSource;
};

export type GitStoreRefChangeOptions = {
  readonly pointer?: string;
  readonly ref?: string;
  readonly source?: GitStoreChangeSource;
};

export type GitStoreChangesShape = {
  readonly changes: Stream.Stream<GitStoreRefChange>;
  readonly current: (
    options?: Omit<GitStoreRefChangeOptions, "source">,
  ) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly poll: (
    options?: GitStoreRefChangeOptions,
  ) => Effect.Effect<ObjectId | null, GitStoreError>;
  readonly wake: (options?: GitStoreRefChangeOptions) => Effect.Effect<void, GitStoreError>;
};

export class GitStoreChanges extends Context.Service<GitStoreChanges, GitStoreChangesShape>()(
  "@cycle/git-store/GitStoreChanges",
) {}

const defaultPollInterval = "5 seconds";

export const GitStoreChangesLive = Layer.effect(
  GitStoreChanges,
  Effect.gen(function* () {
    const refs = yield* RefReader;
    const runtime = yield* GitStoreRuntime;
    const pubsub = yield* PubSub.sliding<GitStoreRefChange>({ capacity: 64, replay: 32 });
    const observed = yield* Ref.make(new Map<string, ObjectId | null>());

    const refFor = Effect.fn("GitStoreChanges.refFor")(function* (
      options: Omit<GitStoreRefChangeOptions, "source"> = {},
    ) {
      if (options.ref !== undefined) return yield* validateRefName(options.ref);

      const pointer = yield* validatePointerName(options.pointer ?? runtime.config.defaultPointer);

      return pointerRef(runtime.config.namespace, runtime.config.database, pointer);
    });

    const current = Effect.fn("GitStoreChanges.current")(function* (
      options: Omit<GitStoreRefChangeOptions, "source"> = {},
    ) {
      return yield* refs.read(yield* refFor(options));
    });

    const poll = Effect.fn("GitStoreChanges.poll")(function* (
      options: GitStoreRefChangeOptions = {},
    ) {
      const ref = yield* refFor(options);
      const after = yield* refs.read(ref);
      const beforeState = yield* Ref.get(observed);
      const hasBaseline = beforeState.has(ref);
      const before = beforeState.get(ref) ?? null;

      if (!hasBaseline || before === after) {
        yield* Ref.update(observed, (state) => new Map(state).set(ref, after));
        return after;
      }

      yield* Ref.update(observed, (state) => new Map(state).set(ref, after));
      const observedAt = new Date(yield* Clock.currentTimeMillis).toISOString();
      yield* PubSub.publish(pubsub, {
        after,
        before,
        observedAt,
        ref,
        source: options.source ?? "external",
      });

      return after;
    });

    const wake = Effect.fn("GitStoreChanges.wake")(function* (
      options: GitStoreRefChangeOptions = {},
    ) {
      yield* poll(options);
    });

    yield* poll({ source: "external" });
    yield* pollLoop(poll).pipe(Effect.forkScoped);
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));

    return GitStoreChanges.of({
      changes: Stream.fromPubSub(pubsub),
      current,
      poll,
      wake,
    });
  }),
);

const pollLoop = (poll: GitStoreChangesShape["poll"]): Effect.Effect<never, never> =>
  Effect.gen(function* () {
    yield* Effect.sleep(defaultPollInterval);
    yield* poll({ source: "external" });
  }).pipe(
    Effect.catch(() => Effect.void),
    Effect.forever,
  );
