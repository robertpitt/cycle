import { Schema } from "effect";

export class InvalidPointerNameError extends Schema.TaggedErrorClass<InvalidPointerNameError>(
  "@cycle/git-db/InvalidPointerNameError",
)("InvalidPointerNameError", {
  message: Schema.String,
  pointer: Schema.String,
}) {}
