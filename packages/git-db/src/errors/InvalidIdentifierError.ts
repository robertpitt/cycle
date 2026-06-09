import { Schema } from "effect";

export class InvalidIdentifierError extends Schema.TaggedErrorClass<InvalidIdentifierError>(
  "@cycle/git-db/InvalidIdentifierError",
)("InvalidIdentifierError", {
  kind: Schema.String,
  message: Schema.String,
  value: Schema.String,
}) {}

export const invalidIdentifier = (kind: string, value: string): InvalidIdentifierError =>
  new InvalidIdentifierError({ kind, message: `Invalid ${kind}: ${value}`, value });
