import { Schema } from "effect";
import { EstimateValue } from "../components/EstimateValue.ts";
import { StringList } from "../components/StringList.ts";
import { IssueFrontmatter } from "./IssueFrontmatter.ts";
import { IssueRelation } from "./IssueRelation.ts";

export const TicketDocument = Schema.Struct({
  archivedAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp when the ticket was archived." }),
  ),
  assignee: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Assignee id when assigned." }),
  ),
  body: Schema.String.pipe(Schema.annotateKey({ description: "Ticket markdown body." })),
  bodyFormat: Schema.Literal("markdown").pipe(
    Schema.annotateKey({ description: "Body format. Currently always markdown." }),
  ),
  createdBy: Schema.String.pipe(
    Schema.annotateKey({ description: "Creator id or display value." }),
  ),
  deletedAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp when the ticket was soft-deleted." }),
  ),
  dueDate: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Due date or timestamp when set." }),
  ),
  estimate: Schema.optional(EstimateValue).pipe(
    Schema.annotateKey({ description: "Estimate value when set." }),
  ),
  frontmatter: IssueFrontmatter.pipe(
    Schema.annotateKey({ description: "Normalized frontmatter for the ticket." }),
  ),
  id: Schema.String.pipe(Schema.annotateKey({ description: "Stable ticket id." })),
  labels: Schema.optional(StringList).pipe(
    Schema.annotateKey({ description: "Label ids or names attached to the ticket." }),
  ),
  parent: Schema.String.pipe(
    Schema.annotateKey({
      description: "Parent issue id. Some legacy records use an empty string for no parent.",
    }),
  ),
  priority: Schema.String.pipe(Schema.annotateKey({ description: "Priority value." })),
  relations: Schema.optional(Schema.Array(IssueRelation)).pipe(
    Schema.annotateKey({ description: "Relations from this ticket to other tickets." }),
  ),
  repository: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Repository hint preserved in frontmatter." }),
  ),
  repositoryId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Repository id containing the ticket when known." }),
  ),
  schemaVersion: Schema.Literal(1).pipe(
    Schema.annotateKey({ description: "Schema version for the ticket document." }),
  ),
  status: Schema.String.pipe(Schema.annotateKey({ description: "Workflow status." })),
  title: Schema.String.pipe(Schema.annotateKey({ description: "Ticket title." })),
  type: Schema.String.pipe(Schema.annotateKey({ description: "Ticket type." })),
  updatedDate: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp or date string for the last ticket update." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Public ticket document including markdown body and normalized frontmatter.",
    identifier: "@cycle/contracts/TicketDocument",
    title: "TicketDocument",
  }),
);
export type TicketDocument = typeof TicketDocument.Type;
