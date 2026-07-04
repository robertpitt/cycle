import { Schema } from "effect";
import { StringList } from "../components/StringList.ts";
import { AutomationViolation } from "./AutomationViolation.ts";

export const AutomationEvaluation = Schema.Struct({
  checkedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when evaluation ran." }),
  ),
  checkedTicketIds: StringList.pipe(
    Schema.annotateKey({ description: "Ticket ids included in the evaluation." }),
  ),
  checkedUseCase: Schema.Literals([
    "AutomationEvaluateIssues",
    "AutomationEvaluateQuery",
    "AutomationEvaluateRepository",
  ]).pipe(Schema.annotateKey({ description: "Usecase that produced this evaluation." })),
  repositoryId: Schema.String.pipe(Schema.annotateKey({ description: "Repository id evaluated." })),
  status: Schema.Literals(["fail", "pass", "warn"]).pipe(
    Schema.annotateKey({ description: "Overall evaluation status." }),
  ),
  summary: Schema.String.pipe(
    Schema.annotateKey({ description: "Human-readable evaluation summary." }),
  ),
  violations: Schema.Array(AutomationViolation).pipe(
    Schema.annotateKey({ description: "Policy violations discovered during evaluation." }),
  ),
  warnings: StringList.pipe(
    Schema.annotateKey({ description: "Non-violation warnings produced during evaluation." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Result of evaluating automation checks.",
    identifier: "@cycle/contracts/AutomationEvaluation",
    title: "AutomationEvaluation",
  }),
);
export type AutomationEvaluation = typeof AutomationEvaluation.Type;
