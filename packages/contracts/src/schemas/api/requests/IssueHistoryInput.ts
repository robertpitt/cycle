import { Schema } from "effect";
import { HistoryOptions } from "./HistoryOptions.ts";

export const IssueHistoryInput = Schema.Struct({
  id: Schema.String.pipe(
    Schema.annotateKey({ description: "Issue id whose history should be listed." }),
  ),
  options: Schema.optional(HistoryOptions).pipe(
    Schema.annotateKey({ description: "Optional history pagination and source options." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for history entries related to one issue.",
    identifier: "@cycle/contracts/IssueHistoryInput",
    title: "IssueHistoryInput",
  }),
);
export type IssueHistoryInput = typeof IssueHistoryInput.Type;
