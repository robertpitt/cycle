import { Schema } from "effect";

export class StorageError extends Schema.TaggedErrorClass<StorageError>(
  "@cycle/database/StorageError",
)("StorageError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  operation: Schema.String,
}) {}
