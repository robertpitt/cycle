import { Schema } from "effect";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";
import { PositiveInteger } from "../components/PositiveInteger.ts";

export const AgentWorkActivityQuery = Schema.Struct({
  after: Schema.optional(NonNegativeInteger).pipe(
    Schema.annotateKey({ description: "Only return activity after this sequence number." }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of activity events to return." }),
  ),
  repositoryId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Repository id used to scope activity." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Query for listing Agent Work activity events.",
    identifier: "@cycle/contracts/AgentWorkActivityQuery",
    title: "AgentWorkActivityQuery",
  }),
);
export type AgentWorkActivityQuery = typeof AgentWorkActivityQuery.Type;
