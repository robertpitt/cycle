import { Schema } from "effect";
import { PageSummary } from "./PageSummary.ts";

export const PagePage = Schema.Struct({
  entries: Schema.Array(PageSummary).pipe(
    Schema.annotateKey({ description: "Page summaries for the current result page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Opaque cursor for the next result page." }),
  ),
}).pipe(
  Schema.annotate({
    description: "A deterministic cursor-paged list of Page summaries.",
    identifier: "@cycle/contracts/PagePage",
    title: "PagePage",
  }),
);
export type PagePage = typeof PagePage.Type;
