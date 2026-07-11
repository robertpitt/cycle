import { Schema } from "effect";
import { CommentDocument } from "./CommentDocument.ts";

export const CommentPage = Schema.Struct({
  entries: Schema.Array(CommentDocument).pipe(
    Schema.annotateKey({ description: "Comments for the current result page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Opaque cursor for the next comment page." }),
  ),
}).pipe(
  Schema.annotate({
    description: "A stable cursor-paged generic comment response.",
    identifier: "@cycle/contracts/CommentPage",
    title: "CommentPage",
  }),
);
export type CommentPage = typeof CommentPage.Type;
