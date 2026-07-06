import { Schema } from "effect";
import type { GitAdapterError, RemoteFetchError, RemotePushError } from "@cycle/git/errors";

export class DocumentNotFoundError extends Schema.TaggedErrorClass<DocumentNotFoundError>(
  "@cycle/git-db/DocumentNotFoundError",
)("DocumentNotFoundError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class InvalidIdentifierError extends Schema.TaggedErrorClass<InvalidIdentifierError>(
  "@cycle/git-db/InvalidIdentifierError",
)("InvalidIdentifierError", {
  kind: Schema.String,
  message: Schema.String,
  value: Schema.String,
}) {}

export class InvalidJsonDocumentError extends Schema.TaggedErrorClass<InvalidJsonDocumentError>(
  "@cycle/git-db/InvalidJsonDocumentError",
)("InvalidJsonDocumentError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  path: Schema.optional(Schema.String),
}) {}

export class InvalidNamespaceError extends Schema.TaggedErrorClass<InvalidNamespaceError>(
  "@cycle/git-db/InvalidNamespaceError",
)("InvalidNamespaceError", {
  message: Schema.String,
  namespace: Schema.String,
}) {}

export class InvalidPathError extends Schema.TaggedErrorClass<InvalidPathError>(
  "@cycle/git-db/InvalidPathError",
)("InvalidPathError", {
  message: Schema.String,
  path: Schema.String,
}) {}

export class InvalidPointerNameError extends Schema.TaggedErrorClass<InvalidPointerNameError>(
  "@cycle/git-db/InvalidPointerNameError",
)("InvalidPointerNameError", {
  message: Schema.String,
  pointer: Schema.String,
}) {}

export class PointerConflictError extends Schema.TaggedErrorClass<PointerConflictError>(
  "@cycle/git-db/PointerConflictError",
)("PointerConflictError", {
  actual: Schema.NullOr(Schema.String),
  cause: Schema.optional(Schema.Defect()),
  expected: Schema.NullOr(Schema.String),
  message: Schema.String,
  pointer: Schema.String,
}) {}

export class PointerNotFoundError extends Schema.TaggedErrorClass<PointerNotFoundError>(
  "@cycle/git-db/PointerNotFoundError",
)("PointerNotFoundError", {
  message: Schema.String,
  pointer: Schema.String,
}) {}

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

export class SnapshotNotFoundError extends Schema.TaggedErrorClass<SnapshotNotFoundError>(
  "@cycle/git-db/SnapshotNotFoundError",
)("SnapshotNotFoundError", {
  message: Schema.String,
  snapshot: Schema.String,
}) {}

export class StoreNotFoundError extends Schema.TaggedErrorClass<StoreNotFoundError>(
  "@cycle/git-db/StoreNotFoundError",
)("StoreNotFoundError", {
  gitDir: Schema.String,
  message: Schema.String,
}) {}

export class SyncConflictError extends Schema.TaggedErrorClass<SyncConflictError>(
  "@cycle/git-db/SyncConflictError",
)("SyncConflictError", {
  localSnapshot: Schema.String,
  mergeBase: Schema.optional(Schema.String),
  message: Schema.String,
  pointer: Schema.String,
  remoteSnapshot: Schema.String,
}) {}

export class TransactionInactiveError extends Schema.TaggedErrorClass<TransactionInactiveError>(
  "@cycle/git-db/TransactionInactiveError",
)("TransactionInactiveError", {
  message: Schema.String,
}) {}

export type GitDbError =
  | StoreNotFoundError
  | InvalidNamespaceError
  | InvalidIdentifierError
  | InvalidPointerNameError
  | InvalidPathError
  | PointerNotFoundError
  | SnapshotNotFoundError
  | DocumentNotFoundError
  | PointerConflictError
  | RepositoryIdentityConflictError
  | SyncConflictError
  | GitAdapterError
  | RemoteFetchError
  | RemotePushError
  | InvalidJsonDocumentError
  | TransactionInactiveError;
