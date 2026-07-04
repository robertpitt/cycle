import { Schema } from "effect";
import { IssueRelationRequest } from "./IssueRelation.ts";

export const RelationIssueInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id being mutated." })),
  relation: IssueRelationRequest.pipe(
    Schema.annotateKey({ description: "Relation to add or remove." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for adding or removing an issue relation.",
    identifier: "@cycle/contracts/RelationIssueInput",
    title: "RelationIssueInput",
  }),
);
export type RelationIssueInput = typeof RelationIssueInput.Type;
