import { Schema } from "effect";

export const InboxReason = Schema.Literals([
  "assigned",
  "comment_assigned",
  "comment_created",
  "mention",
]).pipe(
  Schema.annotate({
    description: "Reason an item appears in a user's Cycle inbox.",
    identifier: "@cycle/contracts/InboxReason",
    title: "InboxReason",
  }),
);
export type InboxReason = typeof InboxReason.Type;
