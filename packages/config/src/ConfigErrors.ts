import { Schema } from "effect";

export class AppConfigError extends Schema.TaggedErrorClass<AppConfigError>(
  "@cycle/config/AppConfigError",
)("AppConfigError", {
  cause: Schema.optionalKey(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
}) {}

export class AppConfigFileError extends Schema.TaggedErrorClass<AppConfigFileError>(
  "@cycle/config/AppConfigFileError",
)("AppConfigFileError", {
  cause: Schema.optionalKey(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
}) {}

export class RuntimeDiscoveryError extends Schema.TaggedErrorClass<RuntimeDiscoveryError>(
  "@cycle/config/RuntimeDiscoveryError",
)("RuntimeDiscoveryError", {
  cause: Schema.optionalKey(Schema.Unknown),
  message: Schema.String,
  operation: Schema.String,
}) {}

export class CycleApiConnectionError extends Schema.TaggedErrorClass<CycleApiConnectionError>(
  "@cycle/config/CycleApiConnectionError",
)("CycleApiConnectionError", {
  cause: Schema.optionalKey(Schema.Unknown),
  code: Schema.Literals([
    "API_DISABLED",
    "API_UNAVAILABLE",
    "DISCOVERY_INVALID",
    "INVALID_API_URL",
    "INVALID_ENVIRONMENT",
  ]),
  message: Schema.String,
}) {}
