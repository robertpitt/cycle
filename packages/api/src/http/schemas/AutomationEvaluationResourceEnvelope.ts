import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import { ResourceEnvelopeOf, strictSchema } from "./shared.ts";

const AutomationEvaluatePayloadBase = Schema.Struct({
  failOnWarnings: Schema.optional(Schema.Boolean),
  issueIds: Schema.optional(Schema.Array(Schema.String)),
  query: Schema.optional(ContractSchemas.IssueQuery),
  requireFresh: Schema.optional(Schema.Boolean),
  severityThreshold: Schema.optional(Schema.Literals(["warning", "error", "fatal"])),
});

export const AutomationEvaluatePayload = strictSchema(
  AutomationEvaluatePayloadBase.check(
    Schema.makeFilter<typeof AutomationEvaluatePayloadBase.Type>(
      (value) => {
        const issueMode = value.issueIds !== undefined;
        const queryMode = value.query !== undefined;
        const repositoryOnlyOptions =
          value.failOnWarnings !== undefined || value.requireFresh !== undefined;

        if (issueMode && value.issueIds.length === 0) return "at least one issue id";
        if (Number(issueMode) + Number(queryMode) > 1) return "a single automation evaluation mode";
        if ((issueMode || queryMode) && repositoryOnlyOptions) {
          return "repository-only options cannot be combined with issue or query evaluation";
        }

        return true;
      },
      { expected: "an automation evaluation request" },
    ),
  ),
);
export type AutomationEvaluatePayload = typeof AutomationEvaluatePayload.Type;
export const AutomationEvaluationResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.AutomationEvaluation,
);
