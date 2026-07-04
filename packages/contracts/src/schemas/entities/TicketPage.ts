import { Schema } from "effect";
import { TicketDocument } from "./TicketDocument.ts";

export const TicketPage = Schema.Struct({
  entries: Schema.Array(TicketDocument).pipe(
    Schema.annotateKey({ description: "Tickets for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged ticket response.",
    identifier: "@cycle/contracts/TicketPage",
    title: "TicketPage",
  }),
);
export type TicketPage = typeof TicketPage.Type;
