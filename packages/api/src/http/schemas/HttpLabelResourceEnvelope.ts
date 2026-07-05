import { ContractSchemas } from "@cycle/contracts";
import { Schema } from "effect";
import {
  CollectionEnvelopeOf,
  CollectionPaginationQueryParams,
  OptionalBooleanStringParam,
  OptionalSearchParam,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const HttpLabelCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.LabelDefinitionDocument,
);
export const HttpLabelResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.LabelDefinitionDocument,
);
export const LabelPayload = strictSchema(ContractSchemas.UpsertLabelInput);
export const LabelQueryParams = {
  "filter[archived]": OptionalBooleanStringParam("Archived-state filter for labels."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
};
export const LabelParams = { labelId: Schema.String, repositoryId: Schema.String };
