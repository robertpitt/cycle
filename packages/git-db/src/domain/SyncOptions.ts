import { Schema } from "effect";
import { DivergenceMode } from "./DivergenceMode.ts";
import { SyncMode } from "./SyncMode.ts";

export const SyncOptions = Schema.Struct({
  mode: Schema.optional(SyncMode),
  onDiverged: Schema.optional(DivergenceMode),
  pointers: Schema.optional(Schema.Array(Schema.String)),
  remote: Schema.optional(Schema.String),
});
export type SyncOptions = typeof SyncOptions.Type;
