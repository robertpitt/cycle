import { Schema } from "effect";
import { LabelDefinitionDocument } from "./LabelDefinitionDocument.ts";

export const LabelDefinitionPage = Schema.Struct({
  entries: Schema.Array(LabelDefinitionDocument).pipe(
    Schema.annotateKey({ description: "Label definitions for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged label definition response.",
    identifier: "@cycle/contracts/LabelDefinitionPage",
    title: "LabelDefinitionPage",
  }),
);
export type LabelDefinitionPage = typeof LabelDefinitionPage.Type;
