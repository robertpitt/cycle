import { Schema } from "effect";

export const SavedViewSort = Schema.Struct({
  direction: Schema.optional(Schema.Literals(["asc", "desc"])).pipe(
    Schema.annotateKey({
      description: "Sort direction. Omitted values use the view or client default.",
    }),
  ),
  field: Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ).pipe(
    Schema.annotateKey({
      description: "Ticket field used for sorting. Omitted values use the view or client default.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Optional ticket ordering for a saved view.",
    identifier: "@cycle/contracts/SavedViewSort",
    title: "SavedViewSort",
  }),
);
export type SavedViewSort = typeof SavedViewSort.Type;
