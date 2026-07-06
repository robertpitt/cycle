import { Schema } from "effect";

export class SqlitePragmaError extends Schema.TaggedErrorClass<SqlitePragmaError>(
  "@cycle/sqlite/SqlitePragmaError",
)("SqlitePragmaError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
  pragma: Schema.optional(Schema.String),
}) {}
