import { Effect, Layer, Queue } from "effect";
import { ProcessLifecycle, type ProcessLifecycleEvent } from "./ProcessLifecycle.ts";

export const ProcessLifecycleLive = Layer.succeed(ProcessLifecycle)({
  events: () =>
    Effect.gen(function* () {
      const events = yield* Queue.unbounded<ProcessLifecycleEvent>();

      const onUncaughtException = (error: unknown): void => {
        Queue.offerUnsafe(events, { error, type: "uncaughtException" });
      };
      const onUnhandledRejection = (error: unknown): void => {
        Queue.offerUnsafe(events, { error, type: "unhandledRejection" });
      };

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          process.on("uncaughtException", onUncaughtException);
          process.on("unhandledRejection", onUnhandledRejection);
        }),
        () =>
          Effect.gen(function* () {
            process.off("uncaughtException", onUncaughtException);
            process.off("unhandledRejection", onUnhandledRejection);
            yield* Queue.shutdown(events);
          }),
      );

      return events;
    }),
});
