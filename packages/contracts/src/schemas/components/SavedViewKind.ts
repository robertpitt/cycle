import { Schema } from "effect";

export const SavedViewKind = Schema.Literals(["board", "list"]).pipe(
  Schema.annotate({
    description: "Presentation mode for a saved view.",
    identifier: "@cycle/contracts/SavedViewKind",
    title: "SavedViewKind",
  }),
);
export type SavedViewKind = typeof SavedViewKind.Type;
