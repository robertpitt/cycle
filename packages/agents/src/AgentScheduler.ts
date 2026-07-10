import { Context, Effect, Layer, Option, Queue } from "effect";
import { AgentConfig } from "./AgentConfig.ts";
import { AgentQueueStore } from "./AgentQueueStore.ts";
import { AgentSupervisor } from "./AgentSupervisor.ts";

export type AgentSchedulerShape = {
  readonly wake: Effect.Effect<void>;
};

export class AgentScheduler extends Context.Service<AgentScheduler, AgentSchedulerShape>()(
  "@cycle/agents/AgentScheduler",
) {}

export const AgentSchedulerLive = Layer.effect(
  AgentScheduler,
  Effect.gen(function* () {
    const config = yield* AgentConfig;
    const queue = yield* AgentQueueStore;
    const supervisor = yield* AgentSupervisor;
    const wakeups = yield* Queue.sliding<void>(1);
    const wake = Queue.offer(wakeups, undefined).pipe(Effect.asVoid);

    const drain = Effect.gen(function* () {
      while (true) {
        const claim = yield* queue.claimNext;
        if (Option.isNone(claim)) return;
        yield* supervisor.run(claim.value).pipe(
          Effect.catchTags({
            AgentHarnessError: (error) => Effect.logError(error.message),
            ImplementationContextIncomplete: (error) => Effect.logError(error.message),
            AgentStateConflictError: () => Effect.void,
            AgentStorageError: (error) => Effect.logError(error.message),
          }),
          Effect.forkScoped,
        );
      }
    });

    const schedulerLoop = Effect.gen(function* () {
      yield* drain;
      yield* Queue.take(wakeups);
    }).pipe(Effect.forever);

    const maintenanceLoop = Effect.gen(function* () {
      yield* Effect.sleep(config.maintenanceIntervalMs);
      yield* wake;
    }).pipe(Effect.forever);

    yield* queue.reconcile;
    yield* schedulerLoop.pipe(Effect.forkScoped);
    yield* maintenanceLoop.pipe(Effect.forkScoped);
    yield* wake;
    return AgentScheduler.of({ wake });
  }),
);
