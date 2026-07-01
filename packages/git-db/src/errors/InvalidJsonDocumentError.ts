import { Schema } from "effect";

export class InvalidJsonDocumentError extends Schema.TaggedErrorClass<InvalidJsonDocumentError>(
  "@cycle/git-db/InvalidJsonDocumentError",
)("InvalidJsonDocumentError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  path: Schema.optional(Schema.String),
}) {}
