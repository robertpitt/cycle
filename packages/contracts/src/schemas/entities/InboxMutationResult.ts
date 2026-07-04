import { Schema } from "effect";
import { InboxStatus } from "../api/requests/InboxStatus.ts";
import { NonNegativeInteger } from "../components/NonNegativeInteger.ts";

export const InboxMutationResult = Schema.Struct({
  matchedCount: NonNegativeInteger.pipe(
    Schema.annotateKey({
      description: "Number of requested items that matched existing inbox entries.",
    }),
  ),
  missingItemIds: Schema.Array(Schema.String).pipe(
    Schema.annotateKey({ description: "Requested item ids that were not found." }),
  ),
  status: InboxStatus.pipe(Schema.annotateKey({ description: "Status applied by the mutation." })),
  updatedCount: NonNegativeInteger.pipe(
    Schema.annotateKey({ description: "Number of inbox items updated." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Result of an inbox item mutation.",
    identifier: "@cycle/contracts/InboxMutationResult",
    title: "InboxMutationResult",
  }),
);
export type InboxMutationResult = typeof InboxMutationResult.Type;
