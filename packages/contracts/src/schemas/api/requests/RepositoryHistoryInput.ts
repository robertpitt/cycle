import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";

export const RepositoryHistoryInput = Schema.Struct({
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous repository history response.",
    }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of commits to return." }),
  ),
  max: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Legacy maximum commit count accepted by older callers." }),
  ),
  ticketId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Optional ticket id used to narrow history to relevant commits.",
    }),
  ),
}).pipe(
  Schema.annotate({
    description: "Request for repository history commits.",
    identifier: "@cycle/contracts/RepositoryHistoryInput",
    title: "RepositoryHistoryInput",
  }),
);
export type RepositoryHistoryInput = typeof RepositoryHistoryInput.Type;
