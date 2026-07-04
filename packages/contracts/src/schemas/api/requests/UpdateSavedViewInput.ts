import { Schema } from "effect";
import { SavedViewDisplay } from "../../components/SavedViewDisplay.ts";
import { SavedViewGroupBy } from "../../components/SavedViewGroupBy.ts";
import { SavedViewKind } from "../../components/SavedViewKind.ts";
import { SavedViewSort } from "../../components/SavedViewSort.ts";
import { IssueQuery } from "./IssueQuery.ts";

export const UpdateSavedViewInput = Schema.Struct({
  builtIn: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether the view is built in. Intended for system-owned updates.",
    }),
  ),
  description: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Replacement saved-view description." }),
  ),
  display: Schema.optional(SavedViewDisplay).pipe(
    Schema.annotateKey({ description: "Replacement display preferences." }),
  ),
  groupBy: Schema.optional(SavedViewGroupBy).pipe(
    Schema.annotateKey({ description: "Replacement grouping mode." }),
  ),
  kind: Schema.optional(SavedViewKind).pipe(
    Schema.annotateKey({ description: "Replacement presentation mode." }),
  ),
  name: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Replacement saved-view name." }),
  ),
  pinned: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Replacement pinned state." }),
  ),
  query: Schema.optional(IssueQuery).pipe(
    Schema.annotateKey({ description: "Replacement issue query captured by the view." }),
  ),
  sort: Schema.optional(SavedViewSort).pipe(
    Schema.annotateKey({ description: "Replacement sort settings." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Patch for a saved view.",
    identifier: "@cycle/contracts/UpdateSavedViewInput",
    title: "UpdateSavedViewInput",
  }),
);
export type UpdateSavedViewInput = typeof UpdateSavedViewInput.Type;
