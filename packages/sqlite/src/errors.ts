import { Schema } from "effect";

const UnknownCause = Schema.optional(Schema.Unknown);

export class SqlitePathError extends Schema.TaggedErrorClass<SqlitePathError>(
  "@cycle/sqlite/SqlitePathError",
)("SqlitePathError", {
  cause: UnknownCause,
  message: Schema.String,
  operation: Schema.String,
  path: Schema.optional(Schema.String),
}) {}

export class SqliteOpenError extends Schema.TaggedErrorClass<SqliteOpenError>(
  "@cycle/sqlite/SqliteOpenError",
)("SqliteOpenError", {
  cause: UnknownCause,
  message: Schema.String,
  operation: Schema.String,
  path: Schema.optional(Schema.String),
}) {}

export class SqlitePragmaError extends Schema.TaggedErrorClass<SqlitePragmaError>(
  "@cycle/sqlite/SqlitePragmaError",
)("SqlitePragmaError", {
  cause: UnknownCause,
  message: Schema.String,
  operation: Schema.String,
  pragma: Schema.optional(Schema.String),
}) {}

export class SqliteMigrationError extends Schema.TaggedErrorClass<SqliteMigrationError>(
  "@cycle/sqlite/SqliteMigrationError",
)("SqliteMigrationError", {
  cause: UnknownCause,
  message: Schema.String,
  migrationName: Schema.optional(Schema.String),
  operation: Schema.String,
}) {}

export const SqliteVectorUnavailableReason = Schema.Literals([
  "binary_missing",
  "load_failed",
  "package_missing",
  "unknown",
  "unsupported_platform",
]);

export type SqliteVectorUnavailableReason = typeof SqliteVectorUnavailableReason.Type;

export class SqliteVectorUnavailableError extends Schema.TaggedErrorClass<SqliteVectorUnavailableError>(
  "@cycle/sqlite/SqliteVectorUnavailableError",
)("SqliteVectorUnavailableError", {
  cause: UnknownCause,
  extensionPath: Schema.optional(Schema.String),
  message: Schema.String,
  operation: Schema.String,
  platform: Schema.optional(Schema.String),
  reason: SqliteVectorUnavailableReason,
}) {}

export type SqliteLayerError =
  | SqliteMigrationError
  | SqliteOpenError
  | SqlitePathError
  | SqlitePragmaError
  | SqliteVectorUnavailableError;
