import { Schema } from "effect";
import { ObjectId } from "./ObjectId.ts";

export const TreeEntryType = Schema.Literals(["blob", "tree"]);
export type TreeEntryType = typeof TreeEntryType.Type;

export const TreeEntry = Schema.Struct({
  mode: Schema.String,
  name: Schema.String,
  objectId: ObjectId,
  type: TreeEntryType,
});
export type TreeEntry = typeof TreeEntry.Type;
