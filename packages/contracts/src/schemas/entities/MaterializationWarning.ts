import { Schema } from "effect";

export const MaterializationWarning = Schema.Struct({
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the warning was created." }),
  ),
  message: Schema.String.pipe(
    Schema.annotateKey({ description: "Human-readable warning message." }),
  ),
  objectId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional object id related to the warning." }),
  ),
  objectType: Schema.String.pipe(
    Schema.annotateKey({ description: "Object type related to the warning." }),
  ),
  path: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository path related to the warning." }),
  ),
  reason: Schema.String.pipe(
    Schema.annotateKey({ description: "Machine-readable warning reason." }),
  ),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository id containing the warning." }),
  ),
  snapshotId: Schema.String.pipe(
    Schema.annotateKey({ description: "Snapshot id where the warning occurred." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Warning emitted while materializing a repository projection.",
    identifier: "@cycle/contracts/MaterializationWarning",
    title: "MaterializationWarning",
  }),
);
export type MaterializationWarning = typeof MaterializationWarning.Type;
