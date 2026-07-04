import { Schema } from "effect";

export const IssueDiffInput = Schema.Struct({
  fromSnapshotId: Schema.String.pipe(Schema.annotateKey({ description: "Older snapshot id." })),
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id to diff." })),
  toSnapshotId: Schema.String.pipe(Schema.annotateKey({ description: "Newer snapshot id." })),
}).pipe(
  Schema.annotate({
    description: "Request for an issue diff between two snapshots.",
    identifier: "@cycle/contracts/IssueDiffInput",
    title: "IssueDiffInput",
  }),
);
export type IssueDiffInput = typeof IssueDiffInput.Type;
