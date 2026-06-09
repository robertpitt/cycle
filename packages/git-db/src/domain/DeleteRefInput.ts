import { Schema } from "effect";
import { ObjectId } from "./ObjectId.ts";

export const DeleteRefInput = Schema.Struct({
  expected: Schema.optional(Schema.NullOr(ObjectId)),
  ref: Schema.String,
});
export type DeleteRefInput = typeof DeleteRefInput.Type;
