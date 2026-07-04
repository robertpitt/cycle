import { Schema } from "effect";
import { Actor } from "../components/Actor.ts";
import { ExternalLink } from "../components/ExternalLink.ts";
import { NullableEstimateValue } from "../components/NullableEstimateValue.ts";
import { StringList } from "../components/StringList.ts";
import { UnknownRecord } from "../components/UnknownRecord.ts";
import { IssueRelation } from "./IssueRelation.ts";

export const IssueFrontmatter = Schema.StructWithRest(
  Schema.Struct({
    agentProvenance: Schema.optional(UnknownRecord).pipe(
      Schema.annotateKey({
        description: "Agent-owned provenance metadata preserved as extension data.",
      }),
    ),
    archivedAt: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.annotateKey({
        description: "ISO timestamp when the issue was archived, or null when restored.",
      }),
    ),
    archivedBy: Schema.optional(Schema.NullOr(Actor)).pipe(
      Schema.annotateKey({
        description: "Actor that archived the issue, or null when not available.",
      }),
    ),
    assignee: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.annotateKey({ description: "Assignee id, or null when unassigned." }),
    ),
    children: Schema.optional(StringList).pipe(
      Schema.annotateKey({ description: "Child issue ids." }),
    ),
    createdAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when the issue was created." }),
    ),
    createdBy: Actor.pipe(Schema.annotateKey({ description: "Actor that created the issue." })),
    deletedAt: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.annotateKey({
        description: "ISO timestamp when the issue was soft-deleted, or null when restored.",
      }),
    ),
    deletedBy: Schema.optional(Schema.NullOr(Actor)).pipe(
      Schema.annotateKey({
        description: "Actor that soft-deleted the issue, or null when not available.",
      }),
    ),
    duplicateOf: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.annotateKey({
        description: "Issue id this issue duplicates, or null when not a duplicate.",
      }),
    ),
    dueDate: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.annotateKey({ description: "Due date or timestamp, or null when unset." }),
    ),
    estimate: Schema.optional(NullableEstimateValue).pipe(
      Schema.annotateKey({ description: "Estimate value, or null when explicitly cleared." }),
    ),
    externalLinks: Schema.optional(Schema.Array(ExternalLink)).pipe(
      Schema.annotateKey({ description: "External links attached to the issue." }),
    ),
    id: Schema.String.pipe(Schema.annotateKey({ description: "Stable issue id." })),
    labels: Schema.optional(StringList).pipe(
      Schema.annotateKey({ description: "Label ids or names attached to the issue." }),
    ),
    parent: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.annotateKey({ description: "Parent issue id, or null when the issue has no parent." }),
    ),
    planAcceptedAt: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({
        description: "ISO timestamp when the implementation plan was accepted.",
      }),
    ),
    planAcceptedBy: Schema.optional(Actor).pipe(
      Schema.annotateKey({ description: "Actor that accepted the implementation plan." }),
    ),
    planningNotRequired: Schema.optional(Schema.Boolean).pipe(
      Schema.annotateKey({ description: "Whether planning acceptance checks are not required." }),
    ),
    priority: Schema.String.pipe(Schema.annotateKey({ description: "Priority value." })),
    relations: Schema.optional(Schema.Array(IssueRelation)).pipe(
      Schema.annotateKey({ description: "Relations from this issue to other issues." }),
    ),
    repository: Schema.optional(Schema.String).pipe(
      Schema.annotateKey({ description: "Repository hint preserved in frontmatter." }),
    ),
    status: Schema.String.pipe(Schema.annotateKey({ description: "Workflow status." })),
    title: Schema.String.pipe(Schema.annotateKey({ description: "Issue title." })),
    type: Schema.String.pipe(Schema.annotateKey({ description: "Issue type." })),
    updatedAt: Schema.String.pipe(
      Schema.annotateKey({ description: "ISO timestamp when frontmatter last changed." }),
    ),
  }),
  [UnknownRecord],
).pipe(
  Schema.annotate({
    description: "Normalized ticket frontmatter exposed on ticket documents.",
    identifier: "@cycle/contracts/IssueFrontmatter",
    title: "IssueFrontmatter",
  }),
);
export type IssueFrontmatter = typeof IssueFrontmatter.Type;
