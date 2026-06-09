import { Schema } from "effect";

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>(
  "@cycle/ticket-db/ValidationError",
)("ValidationError", {
  cause: Schema.optional(Schema.Defect()),
  field: Schema.String,
  message: Schema.String,
}) {}

export const validationError = (field: string, message: string, cause?: unknown): ValidationError =>
  new ValidationError({ cause, field, message });
