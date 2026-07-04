import { Schema } from "effect";

export const InboxMutationInput = Schema.Struct({
  allowMissing: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether missing inbox item ids should be ignored instead of failing.",
    }),
  ),
  itemIds: Schema.Array(Schema.String).pipe(
    Schema.annotateKey({ description: "Inbox item ids to mutate." }),
  ),
  userId: Schema.String.pipe(
    Schema.annotateKey({ description: "User id whose inbox items should be mutated." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Payload for mutating one or more inbox items for a user.",
    identifier: "@cycle/contracts/InboxMutationInput",
    title: "InboxMutationInput",
  }),
);
export type InboxMutationInput = typeof InboxMutationInput.Type;
