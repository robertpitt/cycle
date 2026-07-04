import { Schema } from "effect";
import { CreateDraftInput } from "../api/requests/CreateDraftInput.ts";
import { Actor } from "../components/Actor.ts";

export const TicketDraftDocument = Schema.Struct({
  createdAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the draft was created." }),
  ),
  createdBy: Actor.pipe(Schema.annotateKey({ description: "Actor that created the draft." })),
  id: Schema.String.pipe(Schema.annotateKey({ description: "Stable draft id." })),
  input: CreateDraftInput.pipe(Schema.annotateKey({ description: "Draft issue fields." })),
  schemaVersion: Schema.Literal(1).pipe(
    Schema.annotateKey({ description: "Schema version for the draft document." }),
  ),
  status: Schema.Literals(["committed", "open"]).pipe(
    Schema.annotateKey({ description: "Draft lifecycle status." }),
  ),
  updatedAt: Schema.String.pipe(
    Schema.annotateKey({ description: "ISO timestamp when the draft last changed." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Public issue draft document.",
    identifier: "@cycle/contracts/TicketDraftDocument",
    title: "TicketDraftDocument",
  }),
);
export type TicketDraftDocument = typeof TicketDraftDocument.Type;
