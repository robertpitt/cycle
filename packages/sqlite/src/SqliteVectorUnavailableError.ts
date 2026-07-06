import { Schema } from "effect";

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
  cause: Schema.optional(Schema.Unknown),
  extensionPath: Schema.optional(Schema.String),
  message: Schema.String,
  operation: Schema.String,
  platform: Schema.optional(Schema.String),
  reason: SqliteVectorUnavailableReason,
}) {}
