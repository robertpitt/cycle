import { Schema } from "effect";

export const AgentWorkBranchAssociationInput = Schema.Struct({
  baseSha: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional base commit sha for the branch." }),
  ),
  branchAssociationId: Schema.String.pipe(
    Schema.annotateKey({ description: "Stable branch association id." }),
  ),
  branchName: Schema.String.pipe(Schema.annotateKey({ description: "Short branch name." })),
  branchRef: Schema.String.pipe(Schema.annotateKey({ description: "Full branch ref." })),
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the association was created." }),
  ),
  handoverCommentId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional comment id used for handover." }),
  ),
  headSha: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional current branch head sha." }),
  ),
  jobId: Schema.String.pipe(
    Schema.annotateKey({ description: "Job id that created or owns the branch." }),
  ),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository id the branch belongs to." }),
  ),
  status: Schema.Literals(["active", "superseded", "failed", "abandoned"]).pipe(
    Schema.annotateKey({ description: "Current association lifecycle status." }),
  ),
  ticketId: Schema.String.pipe(
    Schema.annotateKey({ description: "Ticket id associated with the branch." }),
  ),
  updatedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the association last changed." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Branch association payload for Agent Work persistence boundaries.",
    identifier: "@cycle/contracts/AgentWorkBranchAssociationInput",
    title: "AgentWorkBranchAssociationInput",
  }),
);
export type AgentWorkBranchAssociationInput = typeof AgentWorkBranchAssociationInput.Type;
