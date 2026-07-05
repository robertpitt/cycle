import { Schema } from "effect";

export class CycleApiError extends Schema.TaggedErrorClass<CycleApiError>(
  "@cycle/api/CycleApiError",
)("CycleApiError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
}) {}
