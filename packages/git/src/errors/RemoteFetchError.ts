import { Schema } from "effect";

export class RemoteFetchError extends Schema.TaggedErrorClass<RemoteFetchError>(
  "@cycle/git/RemoteFetchError",
)("RemoteFetchError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  remote: Schema.String,
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}
