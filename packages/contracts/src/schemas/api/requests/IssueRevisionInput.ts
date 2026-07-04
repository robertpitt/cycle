import { Schema } from "effect";

export const IssueRevisionInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id to read." })),
  snapshotId: Schema.String.pipe(
    Schema.annotateKey({ description: "Snapshot id containing the desired revision." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for reading one issue revision.",
    identifier: "@cycle/contracts/IssueRevisionInput",
    title: "IssueRevisionInput",
  }),
);
export type IssueRevisionInput = typeof IssueRevisionInput.Type;
