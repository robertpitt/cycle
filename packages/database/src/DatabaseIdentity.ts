import { Context, Effect } from "effect";
import type { Actor } from "./domain/index.ts";
import type { DatabaseFailure } from "./DatabaseErrors.ts";

export type DatabaseIdentityShape = {
  readonly currentActor: Effect.Effect<Actor, DatabaseFailure>;
};

export class DatabaseIdentity extends Context.Service<DatabaseIdentity, DatabaseIdentityShape>()(
  "@cycle/database/DatabaseIdentity",
) {}
