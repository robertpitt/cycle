import { Schema } from "effect";

export const IssueTemplateKind = Schema.Literals([
  "bug",
  "feature",
  "implementation",
  "initiative",
  "qa",
  "specification",
  "story",
]).pipe(
  Schema.annotate({
    description: "Template category used when creating reusable issue templates.",
    identifier: "@cycle/contracts/IssueTemplateKind",
    title: "IssueTemplateKind",
  }),
);
export type IssueTemplateKind = typeof IssueTemplateKind.Type;
