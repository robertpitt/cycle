import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const SearchTicketsInput = Schema.Struct({
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous search response.",
    }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of search results to return." }),
  ),
  repositoryIds: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Repository id allow-list for multi-repository search." }),
  ),
  text: Schema.String.pipe(
    Schema.annotateKey({ description: "Search text matched against title, body, and comments." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Text search request for Cycle tickets.",
    identifier: "@cycle/contracts/SearchTicketsInput",
    title: "SearchTicketsInput",
  }),
);
export type SearchTicketsInput = typeof SearchTicketsInput.Type;
