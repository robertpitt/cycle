import { Schema } from "effect";
import { Identity } from "../domain/Identity.ts";
import { ObjectId } from "./ObjectId.ts";

export const Snapshot = Schema.Struct({
  author: Schema.optional(Identity),
  committer: Schema.optional(Identity),
  createdAt: Schema.optional(Schema.String),
  id: ObjectId,
  message: Schema.optional(Schema.String),
  parents: Schema.Array(ObjectId),
  root: ObjectId,
});
export type Snapshot = typeof Snapshot.Type;
