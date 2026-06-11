import { Schema } from "effect";
import { ObjectId, TreeEntryType } from "@cycle/git/schemas";

export const Entry = Schema.Struct({
  mode: Schema.String,
  name: Schema.String,
  objectId: ObjectId,
  path: Schema.String,
  type: TreeEntryType,
});
export type Entry = typeof Entry.Type;
