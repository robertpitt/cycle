import { Schema } from "effect";

export const ArchiveIssueInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id to archive." })),
  reason: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional archive reason." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for archiving an issue.",
    identifier: "@cycle/contracts/ArchiveIssueInput",
    title: "ArchiveIssueInput",
  }),
);
export type ArchiveIssueInput = typeof ArchiveIssueInput.Type;
