import { Schema } from "effect";
import { SavedViewDisplay } from "../../components/SavedViewDisplay.ts";
import { SavedViewGroupBy } from "../../components/SavedViewGroupBy.ts";
import { SavedViewKind } from "../../components/SavedViewKind.ts";
import { SavedViewSort } from "../../components/SavedViewSort.ts";
import { IssueQuery } from "./IssueQuery.ts";

export const CreateSavedViewInput = Schema.Struct({
  description: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional saved-view description." }),
  ),
  display: Schema.optional(SavedViewDisplay).pipe(
    Schema.annotateKey({ description: "Optional display preferences." }),
  ),
  groupBy: Schema.optional(SavedViewGroupBy).pipe(
    Schema.annotateKey({ description: "Optional grouping mode." }),
  ),
  kind: Schema.optional(SavedViewKind).pipe(
    Schema.annotateKey({ description: "Optional presentation mode." }),
  ),
  name: Schema.String.pipe(Schema.annotateKey({ description: "Saved-view name." })),
  pinned: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether the view should be pinned in clients." }),
  ),
  query: Schema.optional(IssueQuery).pipe(
    Schema.annotateKey({ description: "Optional issue query captured by the view." }),
  ),
  sort: Schema.optional(SavedViewSort).pipe(
    Schema.annotateKey({ description: "Optional sort settings." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for creating a saved view.",
    identifier: "@cycle/contracts/CreateSavedViewInput",
    title: "CreateSavedViewInput",
  }),
);
export type CreateSavedViewInput = typeof CreateSavedViewInput.Type;
