import { Schema } from "effect";
import { RepositoryRef } from "../../components/RepositoryRef.ts";

export const AutomationEvaluateRepositoryInput = Schema.Struct({
  failOnWarnings: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether warnings should cause a failing evaluation status.",
    }),
  ),
  repository: RepositoryRef.pipe(Schema.annotateKey({ description: "Repository to evaluate." })),
  requireFresh: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether evaluation should require a fresh repository projection.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for evaluating repository-level automation checks.",
    identifier: "@cycle/contracts/AutomationEvaluateRepositoryInput",
    title: "AutomationEvaluateRepositoryInput",
  }),
);
export type AutomationEvaluateRepositoryInput = typeof AutomationEvaluateRepositoryInput.Type;
