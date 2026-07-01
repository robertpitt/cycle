import { Schema } from "effect";

export class InvalidIdentifierError extends Schema.TaggedErrorClass<InvalidIdentifierError>(
  "@cycle/git-db/InvalidIdentifierError",
)("InvalidIdentifierError", {
  kind: Schema.String,
  message: Schema.String,
  value: Schema.String,
}) {}
