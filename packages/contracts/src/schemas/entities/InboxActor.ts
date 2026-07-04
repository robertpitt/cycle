import { Schema } from "effect";

export const InboxActor = Schema.Struct({
  email: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Actor email when available." }),
  ),
  name: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Actor display name when available." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Actor summary shown on inbox items.",
    identifier: "@cycle/contracts/InboxActor",
    title: "InboxActor",
  }),
);
export type InboxActor = typeof InboxActor.Type;
