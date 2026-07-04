import { Schema } from "effect";

export const SyncPointer = Schema.Struct({
  localAfter: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Local pointer value after sync." }),
  ),
  localBefore: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Local pointer value before sync." }),
  ),
  pointer: Schema.String.pipe(Schema.annotateKey({ description: "GitDB pointer name." })),
  remoteAfter: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Remote pointer value after sync." }),
  ),
  remoteBefore: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Remote pointer value before sync." }),
  ),
  status: Schema.Literals([
    "diverged",
    "fast-forwarded",
    "merged",
    "missing-remote-gitdb-ref",
    "pushed",
    "rebased",
    "rejected",
    "remote-deleted",
    "up-to-date",
  ]).pipe(Schema.annotateKey({ description: "Synchronization outcome for this pointer." })),
}).pipe(
  Schema.annotate({
    description: "Result for synchronizing one GitDB pointer.",
    identifier: "@cycle/contracts/SyncPointer",
    title: "SyncPointer",
  }),
);
export type SyncPointer = typeof SyncPointer.Type;
