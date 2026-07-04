import { Schema } from "effect";
import { UpdateIssueTemplateInput } from "./UpdateIssueTemplateInput.ts";

export const UpdateTemplateRequestInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue template id to update." })),
  patch: UpdateIssueTemplateInput.pipe(
    Schema.annotateKey({ description: "Issue-template patch." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Issue-template update request with id and patch grouped together.",
    identifier: "@cycle/contracts/UpdateTemplateRequestInput",
    title: "UpdateTemplateRequestInput",
  }),
);
export type UpdateTemplateRequestInput = typeof UpdateTemplateRequestInput.Type;
