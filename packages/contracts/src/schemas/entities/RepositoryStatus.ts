import { Schema } from "effect";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";
import { RepositoryStatusEnum } from "../components/RepositoryStatusEnum.ts";
import { CycleRepositoryMetadata } from "./CycleRepositoryMetadata.ts";
import { RepositoryMetadata } from "./RepositoryMetadata.ts";

export const RepositoryStatus = Schema.Struct({
  activeGeneration: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Active projection generation number." }),
  ),
  activeSnapshotId: Schema.NullOr(Schema.String).pipe(
    Schema.annotateKey({
      description: "Active GitDB snapshot id, or null when no snapshot is active.",
    }),
  ),
  cycleMetadata: Schema.optional(CycleRepositoryMetadata).pipe(
    Schema.annotateKey({ description: "Cycle-specific repository metadata when initialized." }),
  ),
  lastSyncCompletedAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp when the last sync completed." }),
  ),
  lastSyncError: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Last sync error message when sync failed." }),
  ),
  lastSyncStartedAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp when the last sync started." }),
  ),
  metadata: Schema.optional(RepositoryMetadata).pipe(
    Schema.annotateKey({ description: "Detected git metadata for the repository." }),
  ),
  repositoryId: Schema.String.pipe(Schema.annotateKey({ description: "Stable repository id." })),
  status: RepositoryStatusEnum.pipe(
    Schema.annotateKey({ description: "Repository projection status." }),
  ),
  warningCount: NonNegativeInteger.pipe(
    Schema.annotateKey({
      description: "Number of materialization warnings for the active projection.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Current Cycle status for an opened repository.",
    identifier: "@cycle/contracts/RepositoryStatus",
    title: "RepositoryStatus",
  }),
);
export type RepositoryStatus = typeof RepositoryStatus.Type;
