import { Schema } from "effect";
import { IssueTemplateKind } from "../../components/IssueTemplateKind.ts";
import { IssueTemplateDefaultsInput } from "./IssueTemplateDefaultsInput.ts";

export const CreateIssueTemplateInput = Schema.Struct({
  active: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether the template should be available for use." }),
  ),
  bodyTemplate: Schema.String.pipe(Schema.annotateKey({ description: "Markdown body template." })),
  defaults: Schema.optional(IssueTemplateDefaultsInput).pipe(
    Schema.annotateKey({ description: "Default issue fields applied by this template." }),
  ),
  description: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional template description." }),
  ),
  kind: IssueTemplateKind.pipe(Schema.annotateKey({ description: "Template category." })),
  name: Schema.String.pipe(Schema.annotateKey({ description: "Template display name." })),
  titleTemplate: Schema.String.pipe(Schema.annotateKey({ description: "Issue title template." })),
}).pipe(
  Schema.annotate({
    description: "Payload for creating an issue template.",
    identifier: "@cycle/contracts/CreateIssueTemplateInput",
    title: "CreateIssueTemplateInput",
  }),
);
export type CreateIssueTemplateInput = typeof CreateIssueTemplateInput.Type;
