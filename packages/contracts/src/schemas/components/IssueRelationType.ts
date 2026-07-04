import { Schema } from "effect";

export const IssueRelationType = Schema.Literals([
  "related",
  "blocked-by",
  "blocking",
  "duplicate",
]).pipe(
  Schema.annotate({
    description: "Relationship type between two Cycle issues.",
    identifier: "@cycle/contracts/IssueRelationType",
    title: "IssueRelationType",
  }),
);
export type IssueRelationType = typeof IssueRelationType.Type;
