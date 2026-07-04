import { Schema } from "effect";
import { TicketDocument } from "./TicketDocument.ts";

export const TicketSearchResult = Schema.Struct({
  matchedFields: Schema.Array(Schema.Literals(["body", "comment", "title"])).pipe(
    Schema.annotateKey({ description: "Fields that matched the search query." }),
  ),
  ticket: TicketDocument.pipe(Schema.annotateKey({ description: "Matched ticket document." })),
}).pipe(
  Schema.annotate({
    description: "Single ticket search result with matched field information.",
    identifier: "@cycle/contracts/TicketSearchResult",
    title: "TicketSearchResult",
  }),
);
export type TicketSearchResult = typeof TicketSearchResult.Type;
