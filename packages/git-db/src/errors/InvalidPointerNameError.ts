import { Schema } from "effect";

export class InvalidPointerNameError extends Schema.TaggedErrorClass<InvalidPointerNameError>(
  "@cycle/git-db/InvalidPointerNameError",
)("InvalidPointerNameError", {
  message: Schema.String,
  pointer: Schema.String,
}) {}

export const invalidPointerName = (pointer: string): InvalidPointerNameError =>
  new InvalidPointerNameError({ message: `Invalid pointer name: ${pointer}`, pointer });
