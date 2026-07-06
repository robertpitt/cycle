import { Schema } from "effect";

export class AppConfigError extends Schema.TaggedErrorClass<AppConfigError>(
  "@cycle/config/AppConfigError",
)("AppConfigError", {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
}) {}
