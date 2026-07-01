import { Schema } from "effect";

export class RemotePushError extends Schema.TaggedErrorClass<RemotePushError>(
  "@cycle/git/RemotePushError",
)("RemotePushError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  remote: Schema.String,
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}
