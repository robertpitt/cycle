import { Schema } from "effect";
import { ExternalLinkInput } from "../../components/ExternalLinkInput.ts";
import { NullableEstimateValue } from "../../components/NullableEstimateValue.ts";
import { StringList } from "../../components/StringList.ts";
import { TicketTypeId } from "../../components/TicketTypeId.ts";

export const CreateIssueInput = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional assignee id, or null to create unassigned." }),
  ),
  body: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional markdown body for the issue." }),
  ),
  dueDate: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional due date, or null to clear any default." }),
  ),
  estimate: Schema.optional(NullableEstimateValue).pipe(
    Schema.annotateKey({ description: "Optional estimate value, or null to clear any default." }),
  ),
  externalLinks: Schema.optional(Schema.Array(ExternalLinkInput)).pipe(
    Schema.annotateKey({ description: "Optional external links to attach to the issue." }),
  ),
  labels: Schema.optional(StringList).pipe(
    Schema.annotateKey({ description: "Optional label ids or names to attach." }),
  ),
  parent: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional parent issue id, or null for no parent." }),
  ),
  planningNotRequired: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether the issue can skip planning acceptance checks." }),
  ),
  priority: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional priority value." }),
  ),
  repository: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional repository hint preserved in frontmatter." }),
  ),
  status: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional initial workflow status." }),
  ),
  title: Schema.String.pipe(Schema.annotateKey({ description: "Issue title." })),
  type: TicketTypeId.pipe(
    Schema.annotateKey({
      description: "Canonical issue type. Legacy aliases are not accepted for writes.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for creating a committed Cycle issue.",
    identifier: "@cycle/contracts/CreateIssueInput",
    title: "CreateIssueInput",
  }),
);
export type CreateIssueInput = typeof CreateIssueInput.Type;
