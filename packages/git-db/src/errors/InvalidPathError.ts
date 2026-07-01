import { Schema } from "effect";

export class InvalidPathError extends Schema.TaggedErrorClass<InvalidPathError>(
  "@cycle/git-db/InvalidPathError",
)("InvalidPathError", {
  message: Schema.String,
  path: Schema.String,
}) {}
