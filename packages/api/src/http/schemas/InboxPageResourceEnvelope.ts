import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import {
  CollectionEnvelopeWithMetaOf,
  CollectionPaginationQueryParams,
  OptionalBooleanStringParam,
  OptionalCsvStringParam,
  OptionalStringParam,
  RequiredStringParam,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const InboxPageResourceEnvelope = CollectionEnvelopeWithMetaOf(ContractSchemas.InboxEntry, {
  activeSnapshotIds: Schema.Record(Schema.String, Schema.NullOr(Schema.String)).annotate({
    description: "Active snapshot id by repository id at query time.",
  }),
});
export const InboxSummaryResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.InboxSummary);
export const InboxMutationResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.InboxMutationResult,
);
export const InboxMutationPayload = strictSchema(ContractSchemas.InboxMutationInput);
export const InboxQueryParams = {
  "filter[createdAfter]": OptionalStringParam(
    "Only include inbox items created after this ISO timestamp.",
  ),
  "filter[createdBefore]": OptionalStringParam(
    "Only include inbox items created before this ISO timestamp.",
  ),
  "filter[includeSourceInactive]": OptionalBooleanStringParam(
    "Whether to include items whose source ticket or record is inactive.",
  ),
  "filter[reason]": OptionalStringParam("Inbox reason to match."),
  "filter[repository][in]": OptionalCsvStringParam("Comma-separated repository id allow-list."),
  "filter[status]": OptionalStringParam(
    "Inbox status to match. Use all to disable status filtering.",
  ),
  "filter[ticketId]": OptionalStringParam("Ticket id to match."),
  "filter[userId]": RequiredStringParam("User id whose inbox should be queried."),
  ...CollectionPaginationQueryParams,
};
