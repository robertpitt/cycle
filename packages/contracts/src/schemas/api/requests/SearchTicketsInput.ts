import { Schema } from "effect";
import { IssueQuery } from "./IssueQuery.ts";

export const SearchTicketsInput = Schema.Struct({
  ...IssueQuery.fields,
  text: Schema.String.pipe(
    Schema.annotateKey({
      description: "Search text matched against ticket references, titles, and bodies.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Text search request for Cycle tickets.",
    identifier: "@cycle/contracts/SearchTicketsInput",
    title: "SearchTicketsInput",
  }),
);
export type SearchTicketsInput = typeof SearchTicketsInput.Type;
