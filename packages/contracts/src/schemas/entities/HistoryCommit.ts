import { Schema } from "effect";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";
import { StringList } from "../components/StringList.ts";

export const HistoryCommit = Schema.Struct({
  authorEmail: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Commit author email when available." }),
  ),
  authorName: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Commit author name when available." }),
  ),
  changedTicketIds: StringList.pipe(
    Schema.annotateKey({ description: "Ticket ids changed by the commit." }),
  ),
  committedAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp when the commit was authored or committed." }),
  ),
  message: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Commit message when available." }),
  ),
  parentIds: StringList.pipe(Schema.annotateKey({ description: "Parent snapshot ids." })),
  sequence: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Monotonic history sequence." }),
  ),
  snapshotId: Schema.String.pipe(
    Schema.annotateKey({ description: "Snapshot id produced by the commit." }),
  ),
  warningCount: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Number of materialization warnings for this snapshot." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Repository history commit summary.",
    identifier: "@cycle/contracts/HistoryCommit",
    title: "HistoryCommit",
  }),
);
export type HistoryCommit = typeof HistoryCommit.Type;
