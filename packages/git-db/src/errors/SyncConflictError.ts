import { Schema } from "effect";

export class SyncConflictError extends Schema.TaggedErrorClass<SyncConflictError>(
  "@cycle/git-db/SyncConflictError",
)("SyncConflictError", {
  localSnapshot: Schema.String,
  mergeBase: Schema.optional(Schema.String),
  message: Schema.String,
  pointer: Schema.String,
  remoteSnapshot: Schema.String,
}) {}
