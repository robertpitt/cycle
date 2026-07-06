import { Schema } from "effect";

export class SqlitePathError extends Schema.TaggedErrorClass<SqlitePathError>(
  "@cycle/sqlite/SqlitePathError",
)("SqlitePathError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
  path: Schema.optional(Schema.String),
}) {}
