import { Schema } from "effect";
import { PositiveInteger } from "../components/PositiveInteger.ts";

export const AgentWorkDelegate = Schema.Struct({
  agentId: Schema.String.pipe(
    Schema.annotateKey({ description: "Stable agent id assigned to the ticket." }),
  ),
  assignedBy: Schema.String.pipe(
    Schema.annotateKey({ description: "User or system id that assigned the agent." }),
  ),
  assignmentVersion: PositiveInteger.pipe(
    Schema.annotateKey({ description: "Monotonic version for assignment changes." }),
  ),
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the delegate was created." }),
  ),
  enabled: Schema.Boolean.pipe(
    Schema.annotateKey({ description: "Whether this delegate can currently launch work." }),
  ),
  model: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional model override for this delegate." }),
  ),
  notes: Schema.optional(Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional assignment notes visible to operators." }),
  ),
  providerId: Schema.String.pipe(
    Schema.annotateKey({ description: "Provider id used by this delegate." }),
  ),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository id containing the ticket." }),
  ),
  ticketId: Schema.String.pipe(
    Schema.annotateKey({ description: "Ticket id assigned to the agent." }),
  ),
  updatedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the delegate was last changed." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Assignment of a ticket to an agent provider.",
    identifier: "@cycle/contracts/AgentWorkDelegate",
    title: "AgentWorkDelegate",
  }),
);
export type AgentWorkDelegate = typeof AgentWorkDelegate.Type;
