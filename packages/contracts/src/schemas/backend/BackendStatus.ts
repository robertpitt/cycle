import { Schema } from "effect";
import { BootstrapRepositoryStatus, BootstrapStatus } from "./BootstrapStatus.ts";

export const BackendLifecycleState = Schema.Literals([
  "starting",
  "running",
  "stopping",
  "stopped",
  "failed",
]);
export type BackendLifecycleState = typeof BackendLifecycleState.Type;

export const BackendApiState = Schema.Literals([
  "disabled",
  "failed",
  "running",
  "starting",
  "stopped",
]);
export type BackendApiState = typeof BackendApiState.Type;

export const BackendStatus = Schema.Struct({
  api: Schema.Struct({
    baseUrl: Schema.optional(Schema.String),
    host: Schema.optional(Schema.String),
    mcpUrl: Schema.optional(Schema.String),
    port: Schema.optional(Schema.Number),
    state: BackendApiState,
  }),
  bootstrap: BootstrapStatus,
  lifecycle: BackendLifecycleState,
  lastFailure: Schema.optional(Schema.String),
  repositories: Schema.Array(BootstrapRepositoryStatus),
  runtimeFile: Schema.optional(Schema.String),
  startedAt: Schema.optional(Schema.String),
  updatedAt: Schema.String,
});
export type BackendStatus = typeof BackendStatus.Type;
