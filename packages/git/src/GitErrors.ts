import { Schema } from "effect";

export class GitAdapterError extends Schema.TaggedErrorClass<GitAdapterError>(
  "@cycle/git/GitAdapterError",
)("GitAdapterError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

export class GitRepositoryError extends Schema.TaggedErrorClass<GitRepositoryError>(
  "@cycle/git/GitRepositoryError",
)("GitRepositoryError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  path: Schema.String,
}) {}

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

export type GitError = GitAdapterError | GitRepositoryError | RemoteFetchError | RemotePushError;
export type GitTransportError = RemoteFetchError | RemotePushError;
