import { Context, Effect, Layer, Queue, Scope } from "effect";

export type ProcessLifecycleEvent =
  | { readonly error: unknown; readonly type: "uncaughtException" }
  | { readonly error: unknown; readonly type: "unhandledRejection" };

export type ProcessLifecycleService = {
  readonly events: () => Effect.Effect<Queue.Dequeue<ProcessLifecycleEvent>, never, Scope.Scope>;
};

export class ProcessLifecycle extends Context.Service<ProcessLifecycle, ProcessLifecycleService>()(
  "@cycle/desktop/ProcessLifecycle",
) {}

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
