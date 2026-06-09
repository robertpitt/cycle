import { Schema } from "effect";
import { Change } from "./Change.ts";

export const ChangeSet = Schema.Struct({
  added: Schema.Array(Change),
  deleted: Schema.Array(Change),
  modified: Schema.Array(Change),
});
export type ChangeSet = typeof ChangeSet.Type;
