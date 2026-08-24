import { Schema } from "effect";
import { CycleResourceRef } from "../../components/CycleResourceRef.ts";
import { CommentQuery } from "./CommentQuery.ts";

export const CommentListInput = Schema.Struct({
  query: Schema.optional(CommentQuery).pipe(
    Schema.annotateKey({ description: "Comment pagination options." }),
  ),
  target: CycleResourceRef.pipe(
    Schema.annotateKey({ description: "Typed Cycle resource whose comments are listed." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for comments on one typed Cycle resource.",
    identifier: "@cycle/contracts/CommentListInput",
    title: "CommentListInput",
  }),
);
export type CommentListInput = typeof CommentListInput.Type;
