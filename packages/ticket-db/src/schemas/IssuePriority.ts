import { Schema } from "effect";

export const DefaultIssuePriority = Schema.Literals(["none", "low", "medium", "high", "urgent"]);
export type IssuePriority = typeof DefaultIssuePriority.Type | (string & {});
