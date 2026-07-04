import { Schema } from "effect";
import { IssueRelationType } from "../components/IssueRelationType.ts";

export const IssueRelation = Schema.Struct({
  issueId: Schema.String.pipe(Schema.annotateKey({ description: "Related issue id." })),
  type: IssueRelationType.pipe(Schema.annotateKey({ description: "Relation type." })),
}).pipe(
  Schema.annotate({
    description: "Relation from one issue to another as exposed on ticket documents.",
    identifier: "@cycle/contracts/IssueRelation",
    title: "IssueRelation",
  }),
);
export type IssueRelation = typeof IssueRelation.Type;
