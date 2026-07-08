import { Schema } from "effect";

const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const BootstrapPhase = Schema.Literals([
  "idle",
  "starting",
  "loading-repositories",
  "opening-repository",
  "ready",
  "ready-with-background-sync",
  "failed",
]);
export type BootstrapPhase = typeof BootstrapPhase.Type;

export const BootstrapRepositoryStage = Schema.Literals([
  "pending",
  "opening",
  "ready",
  "syncing",
  "failed",
]);
export type BootstrapRepositoryStage = typeof BootstrapRepositoryStage.Type;

export const BootstrapRepositoryStatus = Schema.Struct({
  activeSnapshotId: Schema.optional(Schema.NullOr(Schema.String)),
  currentBranch: Schema.optional(Schema.String),
  defaultRemote: Schema.optional(Schema.String),
  defaultRemoteUrl: Schema.optional(Schema.String),
  displayName: Schema.String,
  error: Schema.optional(Schema.String),
  path: Schema.String,
  repositoryId: Schema.String,
  stage: BootstrapRepositoryStage,
  updatedAt: Schema.String,
  warningCount: Schema.optional(NonNegativeInteger),
});
export type BootstrapRepositoryStatus = typeof BootstrapRepositoryStatus.Type;

export const BootstrapStatus = Schema.Struct({
  blocking: Schema.Boolean,
  completedAt: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  message: Schema.String,
  phase: BootstrapPhase,
  repositories: Schema.Array(BootstrapRepositoryStatus),
  startedAt: Schema.optional(Schema.String),
});
export type BootstrapStatus = typeof BootstrapStatus.Type;
