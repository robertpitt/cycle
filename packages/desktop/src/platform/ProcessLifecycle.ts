import { Context, Effect, Queue, Scope } from "effect";

export type ProcessLifecycleEvent =
  | { readonly error: unknown; readonly type: "uncaughtException" }
  | { readonly error: unknown; readonly type: "unhandledRejection" };

export type ProcessLifecycleService = {
  readonly events: () => Effect.Effect<Queue.Dequeue<ProcessLifecycleEvent>, never, Scope.Scope>;
};

export class ProcessLifecycle extends Context.Service<ProcessLifecycle, ProcessLifecycleService>()(
  "@cycle/desktop/ProcessLifecycle",
) {}
