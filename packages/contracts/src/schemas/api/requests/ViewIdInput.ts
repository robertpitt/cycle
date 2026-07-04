import { Schema } from "effect";

export const ViewIdInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Saved-view id." })),
}).pipe(
  Schema.annotate({
    description: "Request identifying one saved view.",
    identifier: "@cycle/contracts/ViewIdInput",
    title: "ViewIdInput",
  }),
);
export type ViewIdInput = typeof ViewIdInput.Type;
