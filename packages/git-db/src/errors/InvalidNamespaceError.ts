import { Schema } from "effect";

export class InvalidNamespaceError extends Schema.TaggedErrorClass<InvalidNamespaceError>(
  "@cycle/git-db/InvalidNamespaceError",
)("InvalidNamespaceError", {
  message: Schema.String,
  namespace: Schema.String,
}) {}
