import { Schema } from "effect";
import { AgentWorkJobStatus } from "./AgentWorkJobStatus.ts";

export const AgentWorkJobListQuery = Schema.Struct({
  repositoryId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Repository id used to scope jobs." }),
  ),
  status: Schema.optional(AgentWorkJobStatus).pipe(
    Schema.annotateKey({ description: "Job lifecycle status to match." }),
  ),
  ticketId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Ticket id used to scope jobs." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Query for listing Agent Work jobs.",
    identifier: "@cycle/contracts/AgentWorkJobListQuery",
    title: "AgentWorkJobListQuery",
  }),
);
export type AgentWorkJobListQuery = typeof AgentWorkJobListQuery.Type;
