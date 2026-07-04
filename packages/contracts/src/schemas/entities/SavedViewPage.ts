import { Schema } from "effect";
import { SavedViewDocument } from "./SavedViewDocument.ts";

export const SavedViewPage = Schema.Struct({
  entries: Schema.Array(SavedViewDocument).pipe(
    Schema.annotateKey({ description: "Saved views for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged saved view response.",
    identifier: "@cycle/contracts/SavedViewPage",
    title: "SavedViewPage",
  }),
);
export type SavedViewPage = typeof SavedViewPage.Type;
