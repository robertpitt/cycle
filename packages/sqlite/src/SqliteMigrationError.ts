import { Schema } from "effect";

export class SqliteMigrationError extends Schema.TaggedErrorClass<SqliteMigrationError>(
  "@cycle/sqlite/SqliteMigrationError",
)("SqliteMigrationError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  migrationName: Schema.optional(Schema.String),
  operation: Schema.String,
}) {}
