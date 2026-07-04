import { Schema } from "effect";
import { TicketSearchResult } from "./TicketSearchResult.ts";

export const TicketSearchPage = Schema.Struct({
  entries: Schema.Array(TicketSearchResult).pipe(
    Schema.annotateKey({ description: "Search results for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged ticket search response.",
    identifier: "@cycle/contracts/TicketSearchPage",
    title: "TicketSearchPage",
  }),
);
export type TicketSearchPage = typeof TicketSearchPage.Type;
