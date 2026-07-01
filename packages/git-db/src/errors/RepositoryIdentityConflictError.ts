import { Schema } from "effect";

export class RepositoryIdentityConflictError extends Schema.TaggedErrorClass<RepositoryIdentityConflictError>(
  "@cycle/git-db/RepositoryIdentityConflictError",
)("RepositoryIdentityConflictError", {
  localRoot: Schema.optional(Schema.String),
  message: Schema.String,
  pointer: Schema.String,
  reason: Schema.String,
  remoteRoot: Schema.optional(Schema.String),
  repositoryId: Schema.optional(Schema.String),
  roots: Schema.optional(Schema.Array(Schema.String)),
}) {}
