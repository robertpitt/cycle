import { Schema } from "effect";

export const SavedViewGroupBy = Schema.Literals([
  "assignee",
  "dueDate",
  "label",
  "none",
  "parent",
  "priority",
  "status",
]).pipe(
  Schema.annotate({
    description: "Field used to group tickets in a saved view.",
    identifier: "@cycle/contracts/SavedViewGroupBy",
    title: "SavedViewGroupBy",
  }),
);
export type SavedViewGroupBy = typeof SavedViewGroupBy.Type;
