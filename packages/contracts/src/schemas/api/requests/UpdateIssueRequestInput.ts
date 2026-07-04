import { Schema } from "effect";
import { UpdateIssueInput } from "./UpdateIssueInput.ts";

export const UpdateIssueRequestInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id to update." })),
  patch: UpdateIssueInput.pipe(
    Schema.annotateKey({ description: "Issue body/frontmatter patch." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Issue update request with id and patch grouped together.",
    identifier: "@cycle/contracts/UpdateIssueRequestInput",
    title: "UpdateIssueRequestInput",
  }),
);
export type UpdateIssueRequestInput = typeof UpdateIssueRequestInput.Type;
