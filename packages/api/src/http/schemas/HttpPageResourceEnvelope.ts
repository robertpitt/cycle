import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import {
  CollectionEnvelopeOf,
  CollectionPaginationQueryParams,
  CreatedResourceEnvelopeOf,
  OptionalBooleanStringParam,
  OptionalStringParam,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const HttpPageResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.PageDocument);
export const HttpPageCreatedEnvelope = CreatedResourceEnvelopeOf(ContractSchemas.PageDocument);
export const HttpPageCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.PageSummary);
export const HttpPageHierarchyEnvelope = ResourceEnvelopeOf(ContractSchemas.PageHierarchy);
export const HttpPageHistoryCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.PageHistoryEntry,
);
export const HttpCommentCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.CommentDocument);
export const HttpCommentCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.CommentDocument,
);

export const PageListQueryParams = {
  archived: ContractSchemas.PageQuery.fields.archived,
  directory: OptionalStringParam("Exact Page directory to list; empty means repository root."),
  recursive: OptionalBooleanStringParam("Whether descendants are included recursively."),
  ...CollectionPaginationQueryParams,
};

export const PageGetQueryParams = {
  includeArchived: OptionalBooleanStringParam("Whether an archived Page may be returned."),
};

export const PageHistoryQueryParams = {
  ...CollectionPaginationQueryParams,
};

export const PageCommentListQueryParams = {
  ...CollectionPaginationQueryParams,
};

export const PageCreatePayload = strictSchema(ContractSchemas.CreatePageInput);

const { pageId: _updatePageId, ...PageUpdateFields } = ContractSchemas.UpdatePageInput.fields;
export const PageUpdatePayload = strictSchema(Schema.Struct(PageUpdateFields));

const { pageId: _archivePageId, ...PageArchiveFields } = ContractSchemas.ArchivePageInput.fields;
export const PageArchivePayload = strictSchema(Schema.Struct(PageArchiveFields));

const { pageId: _restorePageId, ...PageRestoreFields } = ContractSchemas.RestorePageInput.fields;
export const PageRestorePayload = strictSchema(Schema.Struct(PageRestoreFields));

export const PageCommentAddPayload = strictSchema(
  Schema.Struct({
    body: ContractSchemas.CommentAddInput.fields.body,
  }),
);

export const PageParams = {
  pageId: ContractSchemas.PageId,
  repositoryId: Schema.String,
};

export const PageRevisionParams = {
  ...PageParams,
  snapshotId: Schema.String,
};
