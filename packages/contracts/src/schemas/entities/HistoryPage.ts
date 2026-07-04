import { Schema } from "effect";
import { HistoryCommit } from "./HistoryCommit.ts";

export const HistoryPage = Schema.Struct({
  entries: Schema.Array(HistoryCommit).pipe(
    Schema.annotateKey({ description: "History commits for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged repository history response.",
    identifier: "@cycle/contracts/HistoryPage",
    title: "HistoryPage",
  }),
);
export type HistoryPage = typeof HistoryPage.Type;
