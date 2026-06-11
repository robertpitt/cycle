import { Cause, Effect, Layer, Queue } from "effect";
import { DesktopRuntime } from "./DesktopRuntime.ts";

type DesktopRuntimeTask = {
  readonly effect: Effect.Effect<void, unknown>;
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
      Effect.flatMap((task) =>
        task.effect.pipe(Effect.catchCause((cause) => logTaskFailure(task.label, cause))),
      ),
      Effect.forever,
      Effect.forkScoped,
    );

    return {
      run: (label, effect) => {
        Queue.offerUnsafe(queue, { effect, label });
      },
      // Used only for framework callbacks that must return a Promise to the caller.
      runPromise: (_label, effect) => Effect.runPromise(effect),
    };
  }),
);
