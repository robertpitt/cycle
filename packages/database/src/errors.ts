export type DatabaseFailure =
  | ConsistencyError
  | MaterializationError
  | RepositoryNotFoundError
  | SqliteError
  | StorageError
  | ValidationError
  | WorkflowError;

export class RepositoryNotFoundError extends Error {
  readonly _tag = "RepositoryNotFoundError";
  readonly repositoryId: string;

  constructor(repositoryId: string) {
    super(`Repository is not open: ${repositoryId}`);
    this.repositoryId = repositoryId;
  }
}

export class ValidationError extends Error {
  readonly _tag = "ValidationError";
  readonly cause: unknown;
  readonly field: string;

  constructor(field: string, message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.field = field;
  }
}

export class WorkflowError extends Error {
  readonly _tag = "WorkflowError";
  readonly ticketId: string | undefined;

  constructor(message: string, ticketId?: string) {
    super(message);
    this.ticketId = ticketId;
  }
}

export class StorageError extends Error {
  readonly _tag = "StorageError";
  readonly cause: unknown;
  readonly operation: string;

  constructor(operation: string, message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.operation = operation;
  }
}

export class SqliteError extends Error {
  readonly _tag = "SqliteError";
  readonly cause: unknown;
  readonly operation: string;

  constructor(operation: string, message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.operation = operation;
  }
}

export class MaterializationError extends Error {
  readonly _tag = "MaterializationError";
  readonly cause: unknown;
  readonly repositoryId: string;

  constructor(repositoryId: string, message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.repositoryId = repositoryId;
  }
}

export class ConsistencyError extends Error {
  readonly _tag = "ConsistencyError";
  readonly cause: unknown;
  readonly command: string;
  readonly committedSnapshotId: string;
  readonly objectId: string | undefined;
  readonly previousSnapshotId: string | null;
  readonly repositoryId: string;

  constructor(
    repositoryId: string,
    committedSnapshotId: string,
    previousSnapshotId: string | null,
    command: string,
    objectId: string | undefined,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.cause = cause;
    this.command = command;
    this.committedSnapshotId = committedSnapshotId;
    this.objectId = objectId;
    this.previousSnapshotId = previousSnapshotId;
    this.repositoryId = repositoryId;
  }
}

export const validationError = (field: string, message: string, cause?: unknown): ValidationError =>
  new ValidationError(field, message, cause);

export const workflowError = (message: string, ticketId?: string): WorkflowError =>
  new WorkflowError(message, ticketId);

export const storageError = (
  operation: string,
  cause: unknown,
  message = `GitDB operation failed: ${operation}`,
): StorageError => new StorageError(operation, message, cause);

export const sqliteError = (
  operation: string,
  cause: unknown,
  message = `SQLite operation failed: ${operation}`,
): SqliteError => new SqliteError(operation, message, cause);
