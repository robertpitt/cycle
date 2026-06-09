import { Context, Effect, Layer } from "effect";
import type { TicketDbFailure } from "../errors/TicketDbFailure.ts";
import { Actor } from "../schemas/Actor.ts";

export type TicketIdentityShape = {
  readonly currentActor: Effect.Effect<Actor, TicketDbFailure>;
};

export class TicketIdentity extends Context.Service<TicketIdentity, TicketIdentityShape>()(
  "@cycle/ticket-db/TicketIdentity",
) {}

export const TicketIdentityTest = (
  actor: typeof Actor.Type = {
    email: "test@example.invalid",
    name: "Test User",
    type: "human",
  },
) =>
  Layer.succeed(
    TicketIdentity,
    TicketIdentity.of({
      currentActor: Effect.succeed(new Actor(actor)),
    }),
  );
