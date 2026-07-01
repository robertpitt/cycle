import { Schema } from "effect";

export class SqliteError extends Schema.TaggedErrorClass<SqliteError>(
  "@cycle/database/SqliteError",
)("SqliteError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
}) {}
