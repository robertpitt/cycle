import { Schema } from "effect";

export class InvalidNamespaceError extends Schema.TaggedErrorClass<InvalidNamespaceError>(
  "@cycle/git-db/InvalidNamespaceError",
)("InvalidNamespaceError", {
  message: Schema.String,
  namespace: Schema.String,
}) {}

export const invalidNamespace = (namespace: string, reason: string): InvalidNamespaceError =>
  new InvalidNamespaceError({ message: `Invalid namespace ${namespace}: ${reason}`, namespace });
