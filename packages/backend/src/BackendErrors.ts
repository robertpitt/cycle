import { Schema } from "effect";

const BackendErrorFields = {
  cause: Schema.optional(Schema.Unknown),
  host: Schema.optional(Schema.String),
  message: Schema.String,
  operation: Schema.String,
  port: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
  providerId: Schema.optional(Schema.String),
  repositoryId: Schema.optional(Schema.String),
  runtimeFile: Schema.optional(Schema.String),
};

export class BackendConfigError extends Schema.TaggedErrorClass<BackendConfigError>(
  "@cycle/backend/BackendConfigError",
)("BackendConfigError", BackendErrorFields) {}

export class BackendStartupError extends Schema.TaggedErrorClass<BackendStartupError>(
  "@cycle/backend/BackendStartupError",
)("BackendStartupError", BackendErrorFields) {}

export class BackendShutdownError extends Schema.TaggedErrorClass<BackendShutdownError>(
  "@cycle/backend/BackendShutdownError",
)("BackendShutdownError", BackendErrorFields) {}

export class BackendRuntimeDiscoveryError extends Schema.TaggedErrorClass<BackendRuntimeDiscoveryError>(
  "@cycle/backend/BackendRuntimeDiscoveryError",
)("BackendRuntimeDiscoveryError", BackendErrorFields) {}

export class BackendWorkspaceError extends Schema.TaggedErrorClass<BackendWorkspaceError>(
  "@cycle/backend/BackendWorkspaceError",
)("BackendWorkspaceError", BackendErrorFields) {}

export class BackendDatabaseError extends Schema.TaggedErrorClass<BackendDatabaseError>(
  "@cycle/backend/BackendDatabaseError",
)("BackendDatabaseError", BackendErrorFields) {}

export class BackendApiError extends Schema.TaggedErrorClass<BackendApiError>(
  "@cycle/backend/BackendApiError",
)("BackendApiError", BackendErrorFields) {}

export class BackendAgentRuntimeError extends Schema.TaggedErrorClass<BackendAgentRuntimeError>(
  "@cycle/backend/BackendAgentRuntimeError",
)("BackendAgentRuntimeError", BackendErrorFields) {}

export class BackendBootstrapError extends Schema.TaggedErrorClass<BackendBootstrapError>(
  "@cycle/backend/BackendBootstrapError",
)("BackendBootstrapError", BackendErrorFields) {}

export class BackendAlreadyStarted extends Schema.TaggedErrorClass<BackendAlreadyStarted>(
  "@cycle/backend/BackendAlreadyStarted",
)("BackendAlreadyStarted", {
  message: Schema.String,
  operation: Schema.String,
}) {}

export type BackendError =
  | BackendAgentRuntimeError
  | BackendAlreadyStarted
  | BackendApiError
  | BackendBootstrapError
  | BackendConfigError
  | BackendDatabaseError
  | BackendRuntimeDiscoveryError
  | BackendShutdownError
  | BackendStartupError
  | BackendWorkspaceError;

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
