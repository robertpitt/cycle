import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const CommentQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Opaque cursor returned by a prior comment list." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum comments to return." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Stable pagination options for generic comments.",
    identifier: "@cycle/contracts/CommentQuery",
    title: "CommentQuery",
  }),
);
export type CommentQuery = typeof CommentQuery.Type;
