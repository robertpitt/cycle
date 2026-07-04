import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";
import { SavedViewKind } from "../../components/SavedViewKind.ts";

export const SavedViewQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous saved-view response.",
    }),
  ),
  kind: Schema.optional(SavedViewKind).pipe(
    Schema.annotateKey({ description: "Optional saved-view kind filter." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of saved views to return." }),
  ),
  pinned: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Optional pinned-state filter." }),
  ),
  text: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional text search over saved-view names and descriptions.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Filters and pagination options for saved views.",
    identifier: "@cycle/contracts/SavedViewQuery",
    title: "SavedViewQuery",
  }),
);
export type SavedViewQuery = typeof SavedViewQuery.Type;
