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

export const HttpTemplateCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.IssueTemplateDocument,
);
export const HttpTemplateResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.IssueTemplateDocument,
);
export const TemplateCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.IssueTemplateDocument,
);
export const TemplateCreatePayload = strictSchema(ContractSchemas.CreateIssueTemplateInput);
export const TemplateUpdatePayload = strictSchema(ContractSchemas.UpdateIssueTemplateInput);
export const TemplateQueryParams = {
  "filter[active]": OptionalBooleanStringParam("Active-state filter for issue templates."),
  "filter[kind]": OptionalStringParam("Issue-template kind to match."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
};
export const TemplateParams = { repositoryId: Schema.String, templateId: Schema.String };
