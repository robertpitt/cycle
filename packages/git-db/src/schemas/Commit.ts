import { Schema } from "effect";
import { Identity, IdentityInput } from "../domain/Identity.ts";
import { ObjectId } from "./ObjectId.ts";

export const CommitObject = Schema.Struct({
  author: Schema.optional(Identity),
  committer: Schema.optional(Identity),
  id: ObjectId,
  message: Schema.String,
  parents: Schema.Array(ObjectId),
  tree: ObjectId,
});
export type CommitObject = typeof CommitObject.Type;

export const WriteCommitInput = Schema.Struct({
  author: Schema.optional(IdentityInput),
  committer: Schema.optional(IdentityInput),
  message: Schema.optional(Schema.String),
  parents: Schema.optional(Schema.Array(ObjectId)),
  tree: ObjectId,
});
export type WriteCommitInput = typeof WriteCommitInput.Type;
