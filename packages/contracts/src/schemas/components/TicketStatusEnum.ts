import { Schema } from "effect";

export const TicketStatusEnum = Schema.Literals([
  "backlog",
  "todo",
  "in-progress",
  "review",
  "needs-review",
  "in-review",
  "done",
  "canceled",
  "cancelled",
]).pipe(
  Schema.annotate({
    description: "Known workflow status values for Cycle tickets.",
    identifier: "@cycle/contracts/TicketStatusEnum",
    title: "TicketStatusEnum",
  }),
);
export type TicketStatusEnum = typeof TicketStatusEnum.Type;
