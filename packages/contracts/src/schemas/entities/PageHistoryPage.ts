import { Schema } from "effect";
import { PageHistoryEntry } from "./PageHistoryEntry.ts";

export const PageHistoryPage = Schema.Struct({
  entries: Schema.Array(PageHistoryEntry).pipe(
    Schema.annotateKey({ description: "Page history entries for the current result page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Opaque cursor for the next history page." }),
  ),
}).pipe(
  Schema.annotate({
    description: "A cursor-paged Page lifecycle history response.",
    identifier: "@cycle/contracts/PageHistoryPage",
    title: "PageHistoryPage",
  }),
);
export type PageHistoryPage = typeof PageHistoryPage.Type;
