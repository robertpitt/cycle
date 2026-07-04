import { Schema } from "effect";
import { RecordQuery } from "./RecordQuery.ts";

export const RecordsForIssueInput = Schema.Struct({
  issueId: Schema.String.pipe(
    Schema.annotateKey({ description: "Issue id whose records should be listed." }),
  ),
  query: Schema.optional(RecordQuery).pipe(
    Schema.annotateKey({ description: "Optional record filters and pagination options." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for linked records attached to an issue.",
    identifier: "@cycle/contracts/RecordsForIssueInput",
    title: "RecordsForIssueInput",
  }),
);
export type RecordsForIssueInput = typeof RecordsForIssueInput.Type;
