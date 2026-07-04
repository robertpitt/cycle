import { Schema } from "effect";

export const SavedViewDisplay = Schema.Struct({
  density: Schema.optional(Schema.Literals(["comfortable", "compact"])).pipe(
    Schema.annotateKey({ description: "Preferred visual density for the view." }),
  ),
  properties: Schema.optional(
    Schema.Array(
      Schema.Literals(["assignee", "dueDate", "estimate", "labels", "priority", "status"]),
    ),
  ).pipe(
    Schema.annotateKey({
      description: "Ticket properties clients should surface for each row or card.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Display preferences attached to a saved view.",
    identifier: "@cycle/contracts/SavedViewDisplay",
    title: "SavedViewDisplay",
  }),
);
export type SavedViewDisplay = typeof SavedViewDisplay.Type;
