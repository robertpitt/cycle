import { Schema } from "effect";

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>(
  "@cycle/database/ValidationError",
)("ValidationError", {
  cause: Schema.optional(Schema.Defect()),
  field: Schema.String,
  message: Schema.String,
}) {}
