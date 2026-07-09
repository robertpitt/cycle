import { Context, Effect, Layer, PubSub, Scope, Stream } from "effect";
import type { AgentEventNotice } from "./persistence.ts";

export type AgentEventHubShape = {
  readonly publish: (notice: AgentEventNotice) => Effect.Effect<void>;
  readonly subscribe: Effect.Effect<Stream.Stream<AgentEventNotice>, never, Scope.Scope>;
};

export class AgentEventHub extends Context.Service<AgentEventHub, AgentEventHubShape>()(
  "@cycle/agents/internal/AgentEventHub",
) {}

export const AgentEventHubLive = Layer.effect(
  AgentEventHub,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.sliding<AgentEventNotice>(1_024);
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));
    return AgentEventHub.of({
      publish: (notice) => PubSub.publish(pubsub, notice).pipe(Effect.asVoid),
      subscribe: PubSub.subscribe(pubsub).pipe(Effect.map(Stream.fromSubscription)),
    });
  }),
);
