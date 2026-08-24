import { Data, Schema } from "effect";
import type { PagesFailure } from "@cycle/contracts/schemas";

export class DatabaseConsistencyError extends Schema.TaggedErrorClass<DatabaseConsistencyError>(
  "@cycle/database/DatabaseConsistencyError",
)("DatabaseConsistencyError", {
  cause: Schema.optional(Schema.Defect()),
  command: Schema.String,
  committedSnapshotId: Schema.String,
  message: Schema.String,
  objectId: Schema.optional(Schema.String),
  previousSnapshotId: Schema.NullOr(Schema.String),
  repositoryId: Schema.String,
}) {}

export class DatabaseEventFoldError extends Data.TaggedError("DatabaseEventFoldError")<{
  readonly cause: unknown;
}> {}

export class DatabaseMaterializationError extends Schema.TaggedErrorClass<DatabaseMaterializationError>(
  "@cycle/database/DatabaseMaterializationError",
)("DatabaseMaterializationError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  repositoryId: Schema.String,
}) {}

export class DatabaseRepositoryNotFoundError extends Schema.TaggedErrorClass<DatabaseRepositoryNotFoundError>(
  "@cycle/database/DatabaseRepositoryNotFoundError",
)("DatabaseRepositoryNotFoundError", {
  message: Schema.String,
  repositoryId: Schema.String,
}) {}

export class DatabaseSqliteError extends Schema.TaggedErrorClass<DatabaseSqliteError>(
  "@cycle/database/DatabaseSqliteError",
)("DatabaseSqliteError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
}) {}

export class DatabaseStorageError extends Schema.TaggedErrorClass<DatabaseStorageError>(
  "@cycle/database/DatabaseStorageError",
)("DatabaseStorageError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
}) {}

export class DatabaseValidationError extends Schema.TaggedErrorClass<DatabaseValidationError>(
  "@cycle/database/DatabaseValidationError",
)("DatabaseValidationError", {
  cause: Schema.optional(Schema.Defect()),
  field: Schema.String,
  message: Schema.String,
}) {}

export class DatabaseWorkflowError extends Schema.TaggedErrorClass<DatabaseWorkflowError>(
  "@cycle/database/DatabaseWorkflowError",
)("DatabaseWorkflowError", {
  message: Schema.String,
  ticketId: Schema.optional(Schema.String),
}) {}

export type DatabaseFailure =
  | PagesFailure
  | DatabaseConsistencyError
  | DatabaseMaterializationError
  | DatabaseRepositoryNotFoundError
  | DatabaseSqliteError
  | DatabaseStorageError
  | DatabaseValidationError
  | DatabaseWorkflowError;
