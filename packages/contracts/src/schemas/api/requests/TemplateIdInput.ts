import { Schema } from "effect";

export const TemplateIdInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue template id." })),
}).pipe(
  Schema.annotate({
    description: "Request identifying one issue template.",
    identifier: "@cycle/contracts/TemplateIdInput",
    title: "TemplateIdInput",
  }),
);
export type TemplateIdInput = typeof TemplateIdInput.Type;
