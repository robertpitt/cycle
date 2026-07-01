import { Schema } from "effect";

export class MaterializationError extends Schema.TaggedErrorClass<MaterializationError>(
  "@cycle/database/MaterializationError",
)("MaterializationError", {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
  repositoryId: Schema.String,
}) {}
