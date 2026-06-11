import { Schema } from "effect";
import { ObjectId } from "@cycle/git/schemas";

export const Change = Schema.Struct({
  newObjectId: Schema.optional(ObjectId),
  oldObjectId: Schema.optional(ObjectId),
  path: Schema.String,
});
export type Change = typeof Change.Type;
