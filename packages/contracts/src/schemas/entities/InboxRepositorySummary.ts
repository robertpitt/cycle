import { Schema } from "effect";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";

export const InboxRepositorySummary = Schema.Struct({
  activeSnapshotId: Schema.NullOr(Schema.String).pipe(
    Schema.annotateKey({
      description: "Active snapshot id for the repository, or null when none is active.",
    }),
  ),
  repositoryId: Schema.String.pipe(Schema.annotateKey({ description: "Repository id." })),
  status: Schema.String.pipe(Schema.annotateKey({ description: "Repository projection status." })),
  warningCount: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Number of materialization warnings for the repository." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Repository projection summary included in inbox summary responses.",
    identifier: "@cycle/contracts/InboxRepositorySummary",
    title: "InboxRepositorySummary",
  }),
);
export type InboxRepositorySummary = typeof InboxRepositorySummary.Type;
