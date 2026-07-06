import { Schema } from "effect";

export class DesktopApiError extends Schema.TaggedErrorClass<DesktopApiError>(
  "@cycle/desktop/DesktopApiError",
)("DesktopApiError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
}) {}
