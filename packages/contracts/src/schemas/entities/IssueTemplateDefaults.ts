import { Schema } from "effect";
import { ExternalLink } from "../components/ExternalLink.ts";
import { NullableEstimateValue } from "../components/NullableEstimateValue.ts";
import { StringList } from "../components/StringList.ts";

export const IssueTemplateDefaults = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Default assignee id, or null to default to unassigned." }),
  ),
  body: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Default markdown body." }),
  ),
  dueDate: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Default due date, or null to clear any default." }),
  ),
  estimate: Schema.optional(NullableEstimateValue).pipe(
    Schema.annotateKey({ description: "Default estimate value, or null to clear any default." }),
  ),
  externalLinks: Schema.optional(Schema.Array(ExternalLink)).pipe(
    Schema.annotateKey({ description: "Default external links." }),
  ),
  labels: Schema.optional(StringList).pipe(
    Schema.annotateKey({ description: "Default label ids or names." }),
  ),
  parent: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Default parent issue id, or null for no parent." }),
  ),
  planningNotRequired: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Default planning-not-required flag." }),
  ),
  priority: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Default priority." }),
  ),
  repository: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Default repository hint preserved in frontmatter." }),
  ),
  status: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Default workflow status." }),
  ),
  title: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Default issue title." }),
  ),
  type: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Default issue type." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Default issue fields exposed on an issue template.",
    identifier: "@cycle/contracts/IssueTemplateDefaults",
    title: "IssueTemplateDefaults",
  }),
);
export type IssueTemplateDefaults = typeof IssueTemplateDefaults.Type;
