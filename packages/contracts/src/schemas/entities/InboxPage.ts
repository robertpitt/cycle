import { Schema } from "effect";
import { InboxEntry } from "./InboxEntry.ts";

export const InboxPage = Schema.Struct({
  activeSnapshotIds: Schema.Record(Schema.String, Schema.NullOr(Schema.String)).pipe(
    Schema.annotateKey({ description: "Active snapshot id by repository id at query time." }),
  ),
  entries: Schema.Array(InboxEntry).pipe(
    Schema.annotateKey({ description: "Inbox items for the current page." }),
  ),
  nextCursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque cursor for the next page, when more results are available.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Paged inbox response.",
    identifier: "@cycle/contracts/InboxPage",
    title: "InboxPage",
  }),
);
export type InboxPage = typeof InboxPage.Type;
