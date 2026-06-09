import { Schema } from "effect";

export const IssueType = Schema.Literals(["epic", "issue"]);
export type IssueType = typeof IssueType.Type | (string & {});
