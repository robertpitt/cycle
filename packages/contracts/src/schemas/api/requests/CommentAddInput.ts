import { Schema } from "effect";
import { CycleResourceRef } from "../../components/CycleResourceRef.ts";
import { NonEmptyTrimmedString } from "../../components/NonEmptyTrimmedString.ts";

export const CommentAddInput = Schema.Struct({
  body: NonEmptyTrimmedString.pipe(Schema.annotateKey({ description: "Markdown comment body." })),
  humanApproved: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "MCP audit assertion; never authentication or authorization.",
    }),
  ),
  target: CycleResourceRef.pipe(
    Schema.annotateKey({ description: "Typed Cycle resource receiving the comment." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for appending one generic Markdown comment.",
    identifier: "@cycle/contracts/CommentAddInput",
    title: "CommentAddInput",
  }),
);
export type CommentAddInput = typeof CommentAddInput.Type;
