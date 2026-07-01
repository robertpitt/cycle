import { Context, Effect, Layer } from "effect";
import type { Actor } from "../domain/index.ts";
import type { DatabaseFailure } from "../errors/index.ts";

export type DatabaseIdentityShape = {
  readonly currentActor: Effect.Effect<Actor, DatabaseFailure>;
};

export class DatabaseIdentity extends Context.Service<DatabaseIdentity, DatabaseIdentityShape>()(
  "@cycle/database/DatabaseIdentity",
) {}

export const DatabaseIdentityTest = (
  actor: Actor = {
    email: "test@example.invalid",
    name: "Test User",
    type: "human",
  },
) =>
  Layer.succeed(
    DatabaseIdentity,
    DatabaseIdentity.of({
      currentActor: Effect.succeed(actor),
    }),
  );
