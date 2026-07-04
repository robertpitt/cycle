import { Schema } from "effect";
import { RepositoryRef } from "../../components/RepositoryRef.ts";
import { IssueQuery } from "./IssueQuery.ts";

export const AutomationEvaluateQueryInput = Schema.Struct({
  query: IssueQuery.pipe(
    Schema.annotateKey({ description: "Issue query selecting issues to evaluate." }),
  ),
  repository: RepositoryRef.pipe(
    Schema.annotateKey({ description: "Repository containing the matching issues." }),
  ),
  severityThreshold: Schema.optional(Schema.Literals(["warning", "error", "fatal"])).pipe(
    Schema.annotateKey({
      description: "Minimum violation severity that should affect the result.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for evaluating automation checks against an issue query.",
    identifier: "@cycle/contracts/AutomationEvaluateQueryInput",
    title: "AutomationEvaluateQueryInput",
  }),
);
export type AutomationEvaluateQueryInput = typeof AutomationEvaluateQueryInput.Type;
