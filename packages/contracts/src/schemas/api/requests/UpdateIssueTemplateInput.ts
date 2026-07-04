import { Schema } from "effect";
import { IssueTemplateKind } from "../../components/IssueTemplateKind.ts";
import { IssueTemplateDefaultsInput } from "./IssueTemplateDefaultsInput.ts";

export const UpdateIssueTemplateInput = Schema.Struct({
  active: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Replacement active state." }),
  ),
  bodyTemplate: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Replacement markdown body template." }),
  ),
  defaults: Schema.optional(IssueTemplateDefaultsInput).pipe(
    Schema.annotateKey({ description: "Replacement default issue fields." }),
  ),
  description: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Replacement template description." }),
  ),
  kind: Schema.optional(IssueTemplateKind).pipe(
    Schema.annotateKey({ description: "Replacement template category." }),
  ),
  name: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Replacement template display name." }),
  ),
  titleTemplate: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Replacement issue title template." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Patch for an issue template.",
    identifier: "@cycle/contracts/UpdateIssueTemplateInput",
    title: "UpdateIssueTemplateInput",
  }),
);
export type UpdateIssueTemplateInput = typeof UpdateIssueTemplateInput.Type;
