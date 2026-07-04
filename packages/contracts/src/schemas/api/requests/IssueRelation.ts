import { Schema } from "effect";
import { IssueRelation } from "../../entities/IssueRelation.ts";

export const IssueRelationRequest = IssueRelation.pipe(
  Schema.annotate({
    description: "Relation payload supplied by an API caller.",
    identifier: "@cycle/contracts/IssueRelationRequest",
    title: "IssueRelationRequest",
  }),
);
export type IssueRelationRequest = typeof IssueRelationRequest.Type;
