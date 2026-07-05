import { ContractSchemas } from "@cycle/contracts";
import { Schema } from "effect";
import {
  CollectionEnvelopeOf,
  CollectionPaginationQueryParams,
  CreatedResourceEnvelopeOf,
  OptionalBooleanStringParam,
  OptionalSearchParam,
  OptionalStringParam,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const HttpViewCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.SavedViewDocument);
export const HttpViewResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.SavedViewDocument);
export const ViewCreatedEnvelope = CreatedResourceEnvelopeOf(ContractSchemas.SavedViewDocument);
export const ViewCreatePayload = strictSchema(ContractSchemas.CreateSavedViewInput);
export const ViewUpdatePayload = strictSchema(ContractSchemas.UpdateSavedViewInput);
export const ViewQueryParams = {
  "filter[kind]": OptionalStringParam("Saved-view kind to match."),
  "filter[pinned]": OptionalBooleanStringParam("Pinned-state filter for saved views."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
};
export const ViewParams = { repositoryId: Schema.String, viewId: Schema.String };
