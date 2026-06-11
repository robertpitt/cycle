import { Cause, Effect, Layer, Queue } from "effect";
import { DesktopRuntime } from "./DesktopRuntime.ts";

type DesktopRuntimeTask = {
  readonly effect: Effect.Effect<void>;
  readonly label: string;
};

const logTaskFailure = (label: string, cause: Cause.Cause<unknown>): Effect.Effect<void> =>
  Effect.logError("desktop runtime task failed").pipe(
    Effect.annotateLogs({
      cause: Cause.pretty(cause),
      label,
      scope: "desktop-runtime",
    }),
  );

export const DesktopRuntimeLive = Layer.effect(
  DesktopRuntime,
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<DesktopRuntimeTask>();

    yield* Queue.take(queue).pipe(
      Effect.flatMap((task) => task.effect.pipe(Effect.forkScoped)),
      Effect.forever,
      Effect.forkScoped,
    );

    return {
      run: (label: string, effect: Effect.Effect<void, unknown>): void => {
        Queue.offerUnsafe(queue, {
          effect: effect.pipe(Effect.catchCause((cause) => logTaskFailure(label, cause))),
          label,
        });
      },
      runPromise: <A>(label: string, effect: Effect.Effect<A, unknown>): Promise<A> =>
        new Promise<A>((resolve, reject) => {
          Queue.offerUnsafe(queue, {
            effect: effect.pipe(
              Effect.matchCauseEffect({
                onFailure: (cause) =>
                  logTaskFailure(label, cause).pipe(
                    Effect.andThen(Effect.sync(() => reject(Cause.squash(cause)))),
                  ),
                onSuccess: (value) => Effect.sync(() => resolve(value)),
              }),
            ),
            label,
          });
        }),
    };
  }),
);
