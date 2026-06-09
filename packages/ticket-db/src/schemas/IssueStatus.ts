import { Schema } from "effect";

export const DefaultIssueStatus = Schema.Literals([
  "backlog",
  "todo",
  "ready",
  "in-progress",
  "needs-review",
  "in-review",
  "done",
  "canceled",
]);
export type IssueStatus = typeof DefaultIssueStatus.Type | (string & {});
