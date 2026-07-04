import { Schema } from "effect";

export const DeleteIssueInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id to soft-delete." })),
  reason: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional delete reason." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for soft-deleting an issue.",
    identifier: "@cycle/contracts/DeleteIssueInput",
    title: "DeleteIssueInput",
  }),
);
export type DeleteIssueInput = typeof DeleteIssueInput.Type;
