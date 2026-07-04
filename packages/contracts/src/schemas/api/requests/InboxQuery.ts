import { Schema } from "effect";
import { PositiveInteger } from "../../components/PositiveInteger.ts";
import { InboxReason } from "./InboxReason.ts";
import { InboxStatus } from "./InboxStatus.ts";

export const InboxQuery = Schema.Struct({
  createdAfter: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Only include items created after this ISO timestamp." }),
  ),
  createdBefore: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Only include items created before this ISO timestamp." }),
  ),
  cursor: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({
      description: "Opaque pagination cursor returned by a previous inbox response.",
    }),
  ),
  includeSourceInactive: Schema.optional(Schema.Boolean).pipe(
    Schema.annotateKey({
      description: "Whether to include items whose source ticket or record is inactive.",
    }),
  ),
  limit: Schema.optional(PositiveInteger).pipe(
    Schema.annotateKey({ description: "Maximum number of inbox items to return." }),
  ),
  reason: Schema.optional(InboxReason).pipe(
    Schema.annotateKey({ description: "Optional reason filter." }),
  ),
  repositoryIds: Schema.optional(Schema.Array(Schema.String)).pipe(
    Schema.annotateKey({ description: "Optional repository id allow-list." }),
  ),
  status: Schema.optional(Schema.Union([InboxStatus, Schema.Literal("all")])).pipe(
    Schema.annotateKey({
      description: "Optional status filter. The all value disables status filtering.",
    }),
  ),
  ticketId: Schema.optional(Schema.String).pipe(
    Schema.annotateKey({ description: "Optional ticket id filter." }),
  ),
  userId: Schema.String.pipe(
    Schema.annotateKey({ description: "User id whose inbox should be queried." }),
  ),
}).pipe(
  Schema.annotate({
    description: "Filters and pagination options for listing inbox items.",
    identifier: "@cycle/contracts/InboxQuery",
    title: "InboxQuery",
  }),
);
export type InboxQuery = typeof InboxQuery.Type;
