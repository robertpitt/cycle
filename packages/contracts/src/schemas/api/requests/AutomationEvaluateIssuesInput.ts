import { Schema } from "effect";
import { RepositoryRef } from "../../components/RepositoryRef.ts";

export const AutomationEvaluateIssuesInput = Schema.Struct({
  issueIds: Schema.Array(Schema.String).pipe(
    Schema.annotateKey({ description: "Issue ids to evaluate." }),
  ),
  repository: RepositoryRef.pipe(
    Schema.annotateKey({ description: "Repository containing the issues." }),
  ),
  severityThreshold: Schema.optional(Schema.Literals(["warning", "error", "fatal"])).pipe(
    Schema.annotateKey({
      description: "Minimum violation severity that should affect the result.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for evaluating automation checks against explicit issues.",
    identifier: "@cycle/contracts/AutomationEvaluateIssuesInput",
    title: "AutomationEvaluateIssuesInput",
  }),
);
export type AutomationEvaluateIssuesInput = typeof AutomationEvaluateIssuesInput.Type;
