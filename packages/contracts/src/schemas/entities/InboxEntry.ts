import { Schema } from "effect";
import { InboxReason } from "../api/requests/InboxReason.ts";
import { InboxStatus } from "../api/requests/InboxStatus.ts";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";
import { UnknownRecord } from "../components/UnknownRecord.ts";
import { InboxActor } from "./InboxActor.ts";

export const InboxEntry = Schema.Struct({
  actor: InboxActor.pipe(
    Schema.annotateKey({ description: "Actor associated with the inbox event." }),
  ),
  bodyExcerpt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional short excerpt from the source body or comment." }),
  ),
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the item was created." }),
  ),
  eventPath: Schema.String.pipe(Schema.annotateKey({ description: "Stable source event path." })),
  itemId: Schema.String.pipe(Schema.annotateKey({ description: "Stable inbox item id." })),
  metadata: Schema.optional(UnknownRecord).pipe(
    Schema.annotateKey({ description: "Inbox metadata preserved as extension data." }),
  ),
  reason: InboxReason.pipe(
    Schema.annotateKey({ description: "Reason this item appears in the inbox." }),
  ),
  recordId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional source record id." }),
  ),
  repositoryId: Schema.String.pipe(
    Schema.annotateKey({ description: "Repository id containing the source ticket." }),
  ),
  sequence: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Monotonic inbox sequence." }),
  ),
  snapshotId: Schema.String.pipe(
    Schema.annotateKey({ description: "Snapshot id where the item was materialized." }),
  ),
  sourceState: Schema.Literals(["active", "source_archived", "source_deleted"]).pipe(
    Schema.annotateKey({ description: "Current state of the source ticket or record." }),
  ),
  status: InboxStatus.pipe(Schema.annotateKey({ description: "User-specific inbox status." })),
  ticketId: Schema.String.pipe(Schema.annotateKey({ description: "Source ticket id." })),
  title: Schema.String.pipe(Schema.annotateKey({ description: "Inbox item title." })),
  updatedAt: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "ISO timestamp when the item was last changed." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Single inbox item for a user.",
    identifier: "@cycle/contracts/InboxEntry",
    title: "InboxEntry",
  }),
);
export type InboxEntry = typeof InboxEntry.Type;
