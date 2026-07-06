import { Schema } from "effect";

export class SqliteOpenError extends Schema.TaggedErrorClass<SqliteOpenError>(
  "@cycle/sqlite/SqliteOpenError",
)("SqliteOpenError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
  path: Schema.optional(Schema.String),
}) {}
