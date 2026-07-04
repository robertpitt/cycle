import { Schema } from "effect";

export const CycleRepositoryMetadata = Schema.Struct({
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when Cycle metadata was created." }),
  ),
  schemaVersion: Schema.Literal(1).pipe(
    Schema.annotateKey({ description: "Schema version for Cycle repository metadata." }),
  ),
  ticketIdFormat: Schema.Literal("prefix-base36-5+").pipe(
    Schema.annotateKey({ description: "Ticket id format used by this repository." }),
  ),
  ticketPrefix: Schema.String.pipe(
    Schema.annotateKey({ description: "Prefix used when generating ticket ids." }),
  ),
  updatedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when Cycle metadata last changed." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Cycle-specific metadata stored for a repository.",
    identifier: "@cycle/contracts/CycleRepositoryMetadata",
    title: "CycleRepositoryMetadata",
  }),
);
export type CycleRepositoryMetadata = typeof CycleRepositoryMetadata.Type;
