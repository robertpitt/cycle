import { Schema } from "effect";

const Cause = Schema.optional(Schema.Defect());

export class RepositoryNotFoundError extends Schema.TaggedErrorClass<RepositoryNotFoundError>(
  "@cycle/git-store/RepositoryNotFoundError",
)("RepositoryNotFoundError", {
  cause: Cause,
  message: Schema.String,
  path: Schema.String,
}) {}

export class UnsupportedRepositoryError extends Schema.TaggedErrorClass<UnsupportedRepositoryError>(
  "@cycle/git-store/UnsupportedRepositoryError",
)("UnsupportedRepositoryError", {
  cause: Cause,
  message: Schema.String,
  path: Schema.String,
}) {}

export class UnsupportedObjectFormatError extends Schema.TaggedErrorClass<UnsupportedObjectFormatError>(
  "@cycle/git-store/UnsupportedObjectFormatError",
)("UnsupportedObjectFormatError", {
  format: Schema.String,
  message: Schema.String,
  path: Schema.String,
}) {}

export class InvalidConfigError extends Schema.TaggedErrorClass<InvalidConfigError>(
  "@cycle/git-store/InvalidConfigError",
)("InvalidConfigError", {
  cause: Cause,
  message: Schema.String,
}) {}

export class InvalidPathError extends Schema.TaggedErrorClass<InvalidPathError>(
  "@cycle/git-store/InvalidPathError",
)("InvalidPathError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class InvalidPointerNameError extends Schema.TaggedErrorClass<InvalidPointerNameError>(
  "@cycle/git-store/InvalidPointerNameError",
)("InvalidPointerNameError", {
  message: Schema.String,
  pointer: Schema.String,
}) {}

export class InvalidRefNameError extends Schema.TaggedErrorClass<InvalidRefNameError>(
  "@cycle/git-store/InvalidRefNameError",
)("InvalidRefNameError", {
  message: Schema.String,
  ref: Schema.String,
}) {}

export class InvalidObjectIdError extends Schema.TaggedErrorClass<InvalidObjectIdError>(
  "@cycle/git-store/InvalidObjectIdError",
)("InvalidObjectIdError", {
  message: Schema.String,
  objectId: Schema.String,
}) {}

export class InvalidEventIdentifierError extends Schema.TaggedErrorClass<InvalidEventIdentifierError>(
  "@cycle/git-store/InvalidEventIdentifierError",
)("InvalidEventIdentifierError", {
  kind: Schema.String,
  message: Schema.String,
  value: Schema.String,
}) {}

export class InvalidGitDirFileError extends Schema.TaggedErrorClass<InvalidGitDirFileError>(
  "@cycle/git-store/InvalidGitDirFileError",
)("InvalidGitDirFileError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class InvalidCommonDirFileError extends Schema.TaggedErrorClass<InvalidCommonDirFileError>(
  "@cycle/git-store/InvalidCommonDirFileError",
)("InvalidCommonDirFileError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class ObjectNotFoundError extends Schema.TaggedErrorClass<ObjectNotFoundError>(
  "@cycle/git-store/ObjectNotFoundError",
)("ObjectNotFoundError", {
  message: Schema.String,
  objectId: Schema.String,
}) {}

export class ObjectTypeMismatchError extends Schema.TaggedErrorClass<ObjectTypeMismatchError>(
  "@cycle/git-store/ObjectTypeMismatchError",
)("ObjectTypeMismatchError", {
  actual: Schema.String,
  expected: Schema.String,
  message: Schema.String,
  objectId: Schema.String,
}) {}

export class ObjectDecodeError extends Schema.TaggedErrorClass<ObjectDecodeError>(
  "@cycle/git-store/ObjectDecodeError",
)("ObjectDecodeError", {
  cause: Cause,
  message: Schema.String,
  objectId: Schema.optional(Schema.String),
}) {}

export class ObjectEncodingError extends Schema.TaggedErrorClass<ObjectEncodingError>(
  "@cycle/git-store/ObjectEncodingError",
)("ObjectEncodingError", {
  cause: Cause,
  message: Schema.String,
}) {}

export class PackIndexParseError extends Schema.TaggedErrorClass<PackIndexParseError>(
  "@cycle/git-store/PackIndexParseError",
)("PackIndexParseError", {
  cause: Cause,
  message: Schema.String,
  path: Schema.String,
}) {}

export class PackObjectParseError extends Schema.TaggedErrorClass<PackObjectParseError>(
  "@cycle/git-store/PackObjectParseError",
)("PackObjectParseError", {
  cause: Cause,
  message: Schema.String,
  path: Schema.String,
}) {}

export class UnsupportedPackFormatError extends Schema.TaggedErrorClass<UnsupportedPackFormatError>(
  "@cycle/git-store/UnsupportedPackFormatError",
)("UnsupportedPackFormatError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class RefNotFoundError extends Schema.TaggedErrorClass<RefNotFoundError>(
  "@cycle/git-store/RefNotFoundError",
)("RefNotFoundError", {
  message: Schema.String,
  ref: Schema.String,
}) {}

export class RefExpectedValueConflictError extends Schema.TaggedErrorClass<RefExpectedValueConflictError>(
  "@cycle/git-store/RefExpectedValueConflictError",
)("RefExpectedValueConflictError", {
  actual: Schema.NullOr(Schema.String),
  expected: Schema.NullOr(Schema.String),
  message: Schema.String,
  ref: Schema.String,
}) {}

export class RefLockUnavailableError extends Schema.TaggedErrorClass<RefLockUnavailableError>(
  "@cycle/git-store/RefLockUnavailableError",
)("RefLockUnavailableError", {
  cause: Cause,
  lockPath: Schema.String,
  message: Schema.String,
  ref: Schema.String,
}) {}

export class SnapshotNotFoundError extends Schema.TaggedErrorClass<SnapshotNotFoundError>(
  "@cycle/git-store/SnapshotNotFoundError",
)("SnapshotNotFoundError", {
  message: Schema.String,
  snapshot: Schema.String,
}) {}

export class PathConflictError extends Schema.TaggedErrorClass<PathConflictError>(
  "@cycle/git-store/PathConflictError",
)("PathConflictError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class EmptyTransactionError extends Schema.TaggedErrorClass<EmptyTransactionError>(
  "@cycle/git-store/EmptyTransactionError",
)("EmptyTransactionError", {
  message: Schema.String,
  pointer: Schema.String,
}) {}

export class TransactionInactiveError extends Schema.TaggedErrorClass<TransactionInactiveError>(
  "@cycle/git-store/TransactionInactiveError",
)("TransactionInactiveError", {
  message: Schema.String,
}) {}

export class InvalidJsonDocumentError extends Schema.TaggedErrorClass<InvalidJsonDocumentError>(
  "@cycle/git-store/InvalidJsonDocumentError",
)("InvalidJsonDocumentError", {
  cause: Cause,
  message: Schema.String,
  path: Schema.optional(Schema.String),
}) {}

export class EventAppendConflictError extends Schema.TaggedErrorClass<EventAppendConflictError>(
  "@cycle/git-store/EventAppendConflictError",
)("EventAppendConflictError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class MissingCommitIdentityError extends Schema.TaggedErrorClass<MissingCommitIdentityError>(
  "@cycle/git-store/MissingCommitIdentityError",
)("MissingCommitIdentityError", {
  message: Schema.String,
}) {}

export class RepositoryIdentityConflictError extends Schema.TaggedErrorClass<RepositoryIdentityConflictError>(
  "@cycle/git-store/RepositoryIdentityConflictError",
)("RepositoryIdentityConflictError", {
  message: Schema.String,
  ref: Schema.String,
  roots: Schema.Array(Schema.String),
}) {}

export class GitRemoteError extends Schema.TaggedErrorClass<GitRemoteError>(
  "@cycle/git-store/GitRemoteError",
)("GitRemoteError", {
  cause: Cause,
  message: Schema.String,
  operation: Schema.String,
  ref: Schema.String,
  remote: Schema.String,
  status: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
  stdout: Schema.optional(Schema.String),
}) {}

export class GitSyncConflictError extends Schema.TaggedErrorClass<GitSyncConflictError>(
  "@cycle/git-store/GitSyncConflictError",
)("GitSyncConflictError", {
  local: Schema.NullOr(Schema.String),
  mergeBase: Schema.optional(Schema.String),
  message: Schema.String,
  ref: Schema.String,
  remote: Schema.NullOr(Schema.String),
}) {}

export class FilesystemProtocolError extends Schema.TaggedErrorClass<FilesystemProtocolError>(
  "@cycle/git-store/FilesystemProtocolError",
)("FilesystemProtocolError", {
  cause: Cause,
  message: Schema.String,
  operation: Schema.String,
  path: Schema.String,
}) {}

export type GitStoreError =
  | RepositoryNotFoundError
  | UnsupportedRepositoryError
  | UnsupportedObjectFormatError
  | InvalidConfigError
  | InvalidPathError
  | InvalidPointerNameError
  | InvalidRefNameError
  | InvalidObjectIdError
  | InvalidEventIdentifierError
  | InvalidGitDirFileError
  | InvalidCommonDirFileError
  | ObjectNotFoundError
  | ObjectTypeMismatchError
  | ObjectDecodeError
  | ObjectEncodingError
  | PackIndexParseError
  | PackObjectParseError
  | UnsupportedPackFormatError
  | RefNotFoundError
  | RefExpectedValueConflictError
  | RefLockUnavailableError
  | SnapshotNotFoundError
  | PathConflictError
  | EmptyTransactionError
  | TransactionInactiveError
  | InvalidJsonDocumentError
  | EventAppendConflictError
  | MissingCommitIdentityError
  | RepositoryIdentityConflictError
  | GitRemoteError
  | GitSyncConflictError
  | FilesystemProtocolError;

export const causeMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
