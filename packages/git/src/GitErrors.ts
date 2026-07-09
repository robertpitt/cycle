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
  args: Schema.optional(Schema.Array(Schema.String)),
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
  path: Schema.String,
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

const GitCommandErrorFields = {
  args: Schema.optional(Schema.Array(Schema.String)),
  branchName: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect()),
  cwd: Schema.optional(Schema.String),
  gitDir: Schema.optional(Schema.String),
  message: Schema.String,
  operation: Schema.String,
  path: Schema.optional(Schema.String),
  ref: Schema.optional(Schema.String),
  remote: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
  stdout: Schema.optional(Schema.String),
} as const;

export class GitCommandError extends Schema.TaggedErrorClass<GitCommandError>(
  "@cycle/git/GitCommandError",
)("GitCommandError", GitCommandErrorFields) {}

export class GitRevisionError extends Schema.TaggedErrorClass<GitRevisionError>(
  "@cycle/git/GitRevisionError",
)("GitRevisionError", GitCommandErrorFields) {}

export class GitStatusError extends Schema.TaggedErrorClass<GitStatusError>(
  "@cycle/git/GitStatusError",
)("GitStatusError", GitCommandErrorFields) {}

export class GitBranchError extends Schema.TaggedErrorClass<GitBranchError>(
  "@cycle/git/GitBranchError",
)("GitBranchError", GitCommandErrorFields) {}

export class GitBranchNameError extends Schema.TaggedErrorClass<GitBranchNameError>(
  "@cycle/git/GitBranchNameError",
)("GitBranchNameError", GitCommandErrorFields) {}

export class GitRefError extends Schema.TaggedErrorClass<GitRefError>(
  "@cycle/git/GitRefError",
)("GitRefError", GitCommandErrorFields) {}

export class GitIndexError extends Schema.TaggedErrorClass<GitIndexError>(
  "@cycle/git/GitIndexError",
)("GitIndexError", GitCommandErrorFields) {}

export class GitCommitError extends Schema.TaggedErrorClass<GitCommitError>(
  "@cycle/git/GitCommitError",
)("GitCommitError", GitCommandErrorFields) {}

export class GitWorktreeError extends Schema.TaggedErrorClass<GitWorktreeError>(
  "@cycle/git/GitWorktreeError",
)("GitWorktreeError", GitCommandErrorFields) {}

export class GitRemoteLookupError extends Schema.TaggedErrorClass<GitRemoteLookupError>(
  "@cycle/git/GitRemoteLookupError",
)("GitRemoteLookupError", GitCommandErrorFields) {}

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

export type GitError =
  | GitAdapterError
  | GitBranchError
  | GitBranchNameError
  | GitCommandError
  | GitCommitError
  | GitIndexError
  | GitRefError
  | GitRemoteLookupError
  | GitRepositoryError
  | GitRevisionError
  | GitStatusError
  | GitWorktreeError
  | RemoteFetchError
  | RemotePushError;
export type GitTransportError = RemoteFetchError | RemotePushError;
