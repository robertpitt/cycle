import { Schema } from "effect";

export const TransitionIssueInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id to transition." })),
  reason: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional human-readable transition reason." }),
  ),
  status: Schema.String.pipe(Schema.annotateKey({ description: "Target workflow status." })),
}).pipe(
  Schema.annotate({
    description: "Payload for moving an issue to a new workflow status.",
    identifier: "@cycle/contracts/TransitionIssueInput",
    title: "TransitionIssueInput",
  }),
);
export type TransitionIssueInput = typeof TransitionIssueInput.Type;
