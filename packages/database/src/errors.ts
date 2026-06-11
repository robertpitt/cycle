import { Schema } from "effect";

export type DatabaseFailure =
  | ConsistencyError
  | MaterializationError
  | RepositoryNotFoundError
  | SqliteError
  | StorageError
  | ValidationError
  | WorkflowError;

export class RepositoryNotFoundError extends Schema.TaggedErrorClass<RepositoryNotFoundError>(
  "@cycle/database/RepositoryNotFoundError",
)("RepositoryNotFoundError", {
  message: Schema.String,
  repositoryId: Schema.String,
}) {}

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>(
  "@cycle/database/ValidationError",
)("ValidationError", {
  cause: Schema.optional(Schema.Defect()),
  field: Schema.String,
  message: Schema.String,
}) {}

export class WorkflowError extends Schema.TaggedErrorClass<WorkflowError>(
  "@cycle/database/WorkflowError",
)("WorkflowError", {
  message: Schema.String,
  ticketId: Schema.optional(Schema.String),
}) {}

export class StorageError extends Schema.TaggedErrorClass<StorageError>(
  "@cycle/database/StorageError",
)("StorageError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
}) {}

export class SqliteError extends Schema.TaggedErrorClass<SqliteError>(
  "@cycle/database/SqliteError",
)("SqliteError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
}) {}

export class MaterializationError extends Schema.TaggedErrorClass<MaterializationError>(
  "@cycle/database/MaterializationError",
)("MaterializationError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  repositoryId: Schema.String,
}) {}

export class ConsistencyError extends Schema.TaggedErrorClass<ConsistencyError>(
  "@cycle/database/ConsistencyError",
)("ConsistencyError", {
  cause: Schema.optional(Schema.Defect()),
  command: Schema.String,
  committedSnapshotId: Schema.String,
  message: Schema.String,
  objectId: Schema.optional(Schema.String),
  previousSnapshotId: Schema.NullOr(Schema.String),
  repositoryId: Schema.String,
}) {}

export const repositoryNotFound = (repositoryId: string): RepositoryNotFoundError =>
  new RepositoryNotFoundError({
    message: `Repository is not open: ${repositoryId}`,
    repositoryId,
  });

export const validationError = (field: string, message: string, cause?: unknown): ValidationError =>
  new ValidationError({
    cause,
    field,
    message,
  });

export const workflowError = (message: string, ticketId?: string): WorkflowError =>
  new WorkflowError({
    message,
    ticketId,
  });

export const storageError = (
  operation: string,
  cause: unknown,
  message = `GitDB operation failed: ${operation}`,
): StorageError =>
  new StorageError({
    cause,
    message,
    operation,
  });

export const sqliteError = (
  operation: string,
  cause: unknown,
  message = `SQLite operation failed: ${operation}`,
): SqliteError =>
  new SqliteError({
    cause,
    message,
    operation,
  });

export const materializationError = (
  repositoryId: string,
  message: string,
  cause?: unknown,
): MaterializationError =>
  new MaterializationError({
    cause,
    message,
    repositoryId,
  });

export const consistencyError = (input: {
  readonly cause?: unknown;
  readonly command: string;
  readonly committedSnapshotId: string;
  readonly message: string;
  readonly objectId?: string;
  readonly previousSnapshotId: string | null;
  readonly repositoryId: string;
}): ConsistencyError =>
  new ConsistencyError({
    cause: input.cause,
    command: input.command,
    committedSnapshotId: input.committedSnapshotId,
    message: input.message,
    objectId: input.objectId,
    previousSnapshotId: input.previousSnapshotId,
    repositoryId: input.repositoryId,
  });
