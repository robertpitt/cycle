import { Schema } from "effect";
import { EstimateValue } from "../../components/EstimateValue.ts";
import { IssueRelationType } from "../../components/IssueRelationType.ts";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const IssueQuery = Schema.Struct({
  archived: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether to include archived issues, or filter specifically by archive state.",
    }),
  ),
  assignee: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Assignee id to match, or null to match unassigned issues.",
    }),
  ),
  assigneeIn: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Assignee id allow-list." }),
  ),
  blocked: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether to filter issues with blocking relations." }),
  ),
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous issue response.",
    }),
  ),
  deleted: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether to include or filter soft-deleted issues." }),
  ),
  dueAfter: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Only include issues due after this ISO date or timestamp.",
    }),
  ),
  dueBefore: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Only include issues due before this ISO date or timestamp.",
    }),
  ),
  estimate: Schema.optional(EstimateValue).pipe(
    Schema.annotateKey({ description: "Estimate value to match." }),
  ),
  from: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional source snapshot or projection identifier." }),
  ),
  hasAssignee: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether to filter by presence of an assignee." }),
  ),
  hasDueDate: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether to filter by presence of a due date." }),
  ),
  hasEstimate: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether to filter by presence of an estimate." }),
  ),
  hasLabels: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({ description: "Whether to filter by presence of labels." }),
  ),
  label: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Single label id or name to match." }),
  ),
  labelIn: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Label id or name allow-list." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of issues to return." }),
  ),
  orderBy: Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ).pipe(Schema.annotateKey({ description: "Issue field used for sorting." })),
  orderDirection: Schema.optional(Schema.Literals(["asc", "desc"])).pipe(
    Schema.annotateKey({ description: "Sort direction." }),
  ),
  parent: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Parent issue id to match, or null to match issues without a parent.",
    }),
  ),
  priority: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Priority value to match." }),
  ),
  priorityIn: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Priority value allow-list." }),
  ),
  relation: Schema.optional(
    Schema.Struct({
      issueId: Schema.optional(Schema.String).pipe(
        Schema.annotateKey({ description: "Related issue id to match." }),
      ),
      type: Schema.optional(IssueRelationType).pipe(
        Schema.annotateKey({ description: "Relation type to match." }),
      ),
    }).pipe(
      Schema.annotate({
        description: "Relation filter used inside an issue list query.",
        identifier: "@cycle/contracts/IssueRelationQuery",
        title: "IssueRelationQuery",
      }),
    ),
  ).pipe(Schema.annotateKey({ description: "Optional relation filter." })),
  repositoryIds: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({
      description: "Repository id allow-list for multi-repository issue queries.",
    }),
  ),
  staleBefore: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Only include issues stale before this ISO timestamp." }),
  ),
  status: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Status value to match." }),
  ),
  statusIn: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Status value allow-list." }),
  ),
  text: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Free text query. HTTP handlers may route non-empty text to search.",
    }),
  ),
  type: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Ticket type value to match." }),
  ),
  updatedAfter: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Only include issues updated after this ISO timestamp." }),
  ),
  updatedBefore: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Only include issues updated before this ISO timestamp." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Filters and pagination options for listing Cycle issues.",
    identifier: "@cycle/contracts/IssueQuery",
    title: "IssueQuery",
  }),
);
export type IssueQuery = typeof IssueQuery.Type;
