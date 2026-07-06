import * as Context from "effect/Context";
import type { SqliteVectorCapability } from "./internals/vector.ts";

export type SqliteCapabilitiesShape = {
  readonly vector: SqliteVectorCapability;
};

export class SqliteCapabilities extends Context.Service<
  SqliteCapabilities,
  SqliteCapabilitiesShape
>()("@cycle/sqlite/SqliteCapabilities") {}
