import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import {
  HttpRecordCreatedEnvelope,
  HttpTicketCreatedEnvelope,
} from "./HttpTicketResourceEnvelope.ts";
import { ResourceEnvelopeOf, strictSchema } from "./shared.ts";

export const InitiativeCreatePayload = strictSchema(ContractSchemas.CreateIssueInput);
export const InitiativeProgressResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.InitiativeProgress,
);
export const InitiativeCreatedEnvelope = HttpTicketCreatedEnvelope;
export const InitiativeUpdatePayload = strictSchema(ContractSchemas.InitiativeUpdateInput);
export const InitiativeUpdateCreatedEnvelope = HttpRecordCreatedEnvelope;
export const InitiativeParams = { initiativeId: Schema.String, repositoryId: Schema.String };
