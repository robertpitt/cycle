import { Schema } from "effect";
import { ReadOptions } from "./ReadOptions.ts";

export const IssueIdInput = Schema.Struct({
  id: Schema.String.pipe(Schema.annotateKey({ description: "Issue id to read." })),
  options: Schema.optional(ReadOptions).pipe(
    Schema.annotateKey({ description: "Optional read options." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for reading a single issue.",
    identifier: "@cycle/contracts/IssueIdInput",
    title: "IssueIdInput",
  }),
);
export type IssueIdInput = typeof IssueIdInput.Type;
