import { Schema } from "effect";

export const InboxStatus = Schema.Literals(["archived", "read", "snoozed", "unread"]).pipe(
  Schema.annotate({
    description: "User-specific handling status for a Cycle inbox item.",
    identifier: "@cycle/contracts/InboxStatus",
    title: "InboxStatus",
  }),
);
export type InboxStatus = typeof InboxStatus.Type;
