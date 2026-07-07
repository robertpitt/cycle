import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import { CreatedResourceEnvelopeOf, ResourceEnvelopeOf, strictSchema } from "./shared.ts";

export const TicketDocumentResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.TicketDocument);

export const DraftDocumentResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.TicketDraftDocument,
);
export const DraftDocumentCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.TicketDraftDocument,
);
export const DraftCreatePayload = strictSchema(ContractSchemas.CreateDraftInput);
export const DraftUpdatePayload = strictSchema(
  Schema.Struct({
    body: Schema.optional(Schema.String),
    // Draft frontmatter may contain arbitrary issue metadata owned by document producers.
    frontmatter: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    status: Schema.optional(Schema.String),
  }),
);
export const DraftParams = { draftId: Schema.String, repositoryId: Schema.String };
