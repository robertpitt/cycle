import { Schema } from "effect";
import { ObjectId } from "./ObjectId.ts";
import { TreeEntryType } from "./TreeEntry.ts";

export const Entry = Schema.Struct({
  mode: Schema.String,
  name: Schema.String,
  objectId: ObjectId,
  path: Schema.String,
  type: TreeEntryType,
});
export type Entry = typeof Entry.Type;
