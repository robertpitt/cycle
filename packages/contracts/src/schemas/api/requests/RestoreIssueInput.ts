import { Schema } from "effect";

export const RestoreIssueInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id to restore." })),
  reason: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional restore reason." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for restoring an archived or deleted issue.",
    identifier: "@cycle/contracts/RestoreIssueInput",
    title: "RestoreIssueInput",
  }),
);
export type RestoreIssueInput = typeof RestoreIssueInput.Type;
