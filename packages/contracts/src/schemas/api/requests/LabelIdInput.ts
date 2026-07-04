import { Schema } from "effect";

export const LabelIdInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Label id." })),
}).pipe(
  Schema.annotate({
    description: "Request identifying one label.",
    identifier: "@cycle/contracts/LabelIdInput",
    title: "LabelIdInput",
  }),
);
export type LabelIdInput = typeof LabelIdInput.Type;
