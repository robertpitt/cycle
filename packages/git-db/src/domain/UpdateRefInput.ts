import { Schema } from "effect";
import { ObjectId } from "./ObjectId.ts";

export const UpdateRefInput = Schema.Struct({
  expected: Schema.optional(Schema.NullOr(ObjectId)),
  ref: Schema.String,
  target: ObjectId,
});
export type UpdateRefInput = typeof UpdateRefInput.Type;
