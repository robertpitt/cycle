import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import {
  CollectionEnvelopeOf,
  CollectionPaginationQueryParams,
  CreatedResourceEnvelopeOf,
  OptionalBooleanStringParam,
  OptionalCsvStringParam,
  OptionalSearchParam,
  OptionalStringParam,
  RequiredStringParam,
  ResourceEnvelopeOf,
  strictSchema,
} from "./shared.ts";

export const HttpTicketResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.TicketDocument);
export const HttpTicketCreatedEnvelope = CreatedResourceEnvelopeOf(ContractSchemas.TicketDocument);
export const HttpTicketCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.TicketDocument);
export const HttpTicketSearchCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.TicketSearchResult,
);
export const HttpTicketRevisionDiffEnvelope = ResourceEnvelopeOf(
  ContractSchemas.TicketRevisionDiff,
);
export const HttpHistoryCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.HistoryCommit);
export const HttpRecordCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.LinkedRecord);
export const HttpRecordResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.LinkedRecord);
export const HttpRecordCreatedEnvelope = CreatedResourceEnvelopeOf(ContractSchemas.LinkedRecord);

export const IssueListQueryParams = {
  "filter[archived]": OptionalBooleanStringParam("Archived-state filter for issues."),
  "filter[assignee]": OptionalStringParam(
    "Assignee id to match. Use the literal null to match unassigned issues.",
  ),
  "filter[assignee][in]": OptionalCsvStringParam("Comma-separated assignee id allow-list."),
  "filter[blocked]": OptionalBooleanStringParam("Whether to match issues with blocking relations."),
  "filter[deleted]": OptionalBooleanStringParam("Soft-deleted-state filter for issues."),
  "filter[dueAfter]": OptionalStringParam(
    "Only include issues due after this ISO date or timestamp.",
  ),
  "filter[dueBefore]": OptionalStringParam(
    "Only include issues due before this ISO date or timestamp.",
  ),
  "filter[estimate]": OptionalStringParam("Estimate value to match."),
  "filter[hasAssignee]": OptionalBooleanStringParam(
    "Whether to filter by presence of an assignee.",
  ),
  "filter[hasDueDate]": OptionalBooleanStringParam("Whether to filter by presence of a due date."),
  "filter[hasEstimate]": OptionalBooleanStringParam(
    "Whether to filter by presence of an estimate.",
  ),
  "filter[hasLabels]": OptionalBooleanStringParam("Whether to filter by presence of labels."),
  "filter[label]": OptionalStringParam("Single label id or name to match."),
  "filter[label][in]": OptionalCsvStringParam("Comma-separated label id or name allow-list."),
  "filter[parent]": OptionalStringParam(
    "Parent issue id to match. Use the literal null to match issues without a parent.",
  ),
  "filter[priority]": OptionalStringParam("Priority value to match."),
  "filter[priority][in]": OptionalCsvStringParam("Comma-separated priority value allow-list."),
  "filter[repository][in]": OptionalCsvStringParam(
    "Comma-separated repository id allow-list for multi-repository issue queries.",
  ),
  "filter[staleBefore]": OptionalStringParam(
    "Only include issues stale before this ISO timestamp.",
  ),
  "filter[status]": OptionalStringParam("Workflow status value to match."),
  "filter[status][in]": OptionalCsvStringParam("Comma-separated workflow status allow-list."),
  "filter[type]": OptionalStringParam("Ticket type value to match."),
  "filter[updatedAfter]": OptionalStringParam(
    "Only include issues updated after this ISO timestamp.",
  ),
  "filter[updatedBefore]": OptionalStringParam(
    "Only include issues updated before this ISO timestamp.",
  ),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
  "sort[direction]": Schema.optional(Schema.Literals(["asc", "desc"])).annotate({
    description: "Sort direction.",
  }),
  "sort[field]": Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ).annotate({ description: "Issue field used for sorting." }),
};
export const IssueCreatePayload = strictSchema(ContractSchemas.CreateIssueInput);
export const IssueUpdatePayload = strictSchema(ContractSchemas.UpdateIssueInput);
export const IssueTransitionPayload = strictSchema(
  Schema.Struct({
    reason: Schema.optional(Schema.String),
    status: Schema.String,
  }),
);
export const IssueReasonPayload = strictSchema(
  Schema.Struct({
    reason: Schema.optional(Schema.String),
  }),
);
export const IssueHistoryQueryParams = {
  ...CollectionPaginationQueryParams,
};
export const IssueDiffQueryParams = {
  fromSnapshotId: RequiredStringParam("Older snapshot id."),
  toSnapshotId: RequiredStringParam("Newer snapshot id."),
};
export const RecordListQueryParams = {
  "filter[recordType]": OptionalStringParam("Linked record type to match."),
  ...CollectionPaginationQueryParams,
};
export const IssueCommentListQueryParams = {
  ...CollectionPaginationQueryParams,
};
export const IssueRelationPayload = strictSchema(ContractSchemas.IssueRelation);
export const IssueRecordAddPayload = strictSchema(
  Schema.Struct({
    // Linked record payload is decoded by the record type owner.
    payload: Schema.Unknown,
    recordType: Schema.optional(Schema.String),
    userVisible: Schema.optional(Schema.Boolean),
  }),
);
export const IssueCommentAddPayload = strictSchema(
  Schema.Struct({
    body: Schema.String,
  }),
);

export const IssueParams = { repositoryId: Schema.String, issueId: Schema.String };
export const IssueRevisionParams = {
  issueId: Schema.String,
  repositoryId: Schema.String,
  snapshotId: Schema.String,
};
export const IssueCommentParams = {
  commentId: Schema.String,
  issueId: Schema.String,
  repositoryId: Schema.String,
};
