import { Schema } from "effect";

export const TicketTypeSelection = Schema.Literals([
  "auto",
  "epic",
  "feature",
  "story",
  "bug",
  "task",
  "specification",
]).pipe(
  Schema.annotate({
    description:
      "Ticket type selection value. The auto option delegates type choice to the caller workflow.",
    identifier: "@cycle/contracts/TicketTypeSelection",
    title: "TicketTypeSelection",
  }),
);
export type TicketTypeSelection = typeof TicketTypeSelection.Type;
