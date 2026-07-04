import { Schema } from "effect";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";
import { InboxRepositorySummary } from "./InboxRepositorySummary.ts";

export const InboxSummary = Schema.Struct({
  archivedCount: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Number of archived inbox items." }),
  ),
  byReason: Schema.Record(Schema.String, NonNegativeInteger).pipe(
    Schema.annotateKey({ description: "Inbox item counts grouped by reason." }),
  ),
  byRepository: Schema.Record(Schema.String, NonNegativeInteger).pipe(
    Schema.annotateKey({ description: "Inbox item counts grouped by repository id." }),
  ),
  latestItemTimestamp: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp for the newest inbox item." }),
  ),
  readCount: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Number of read inbox items." }),
  ),
  repositories: Schema.Array(InboxRepositorySummary).pipe(
    Schema.annotateKey({ description: "Repository summaries contributing to inbox state." }),
  ),
  unreadCount: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Number of unread inbox items." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Aggregate inbox counts for a user.",
    identifier: "@cycle/contracts/InboxSummary",
    title: "InboxSummary",
  }),
);
export type InboxSummary = typeof InboxSummary.Type;
