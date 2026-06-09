import { Schema } from "effect";
import {
  DraftStatus,
  ExternalLink,
  type AddLinkedRecordInput as TicketDbAddLinkedRecordInput,
  type CreateDraftInput as TicketDbCreateDraftInput,
  type CreateIssueInput as TicketDbCreateIssueInput,
  type HistoryOptions as TicketDbHistoryOptions,
  type IssueQuery as TicketDbIssueQuery,
  type ReadOptions as TicketDbReadOptions,
  type RecordQuery as TicketDbRecordQuery,
  type TransitionIssueInput as TicketDbTransitionIssueInput,
  type UpdateDraftInput as TicketDbUpdateDraftInput,
  type UpdateIssueInput as TicketDbUpdateIssueInput,
} from "@cycle/ticket-db";
import { RepositoryRef } from "./RepositoryRef.ts";

const StringList = Schema.Array(Schema.String);
const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);

export const ReadOptions = Schema.Struct({
  from: Schema.optional(Schema.String),
});
export type ReadOptions = TicketDbReadOptions;

export const HistoryOptions = Schema.Struct({
  from: Schema.optional(Schema.String),
  max: Schema.optional(Schema.Number),
});
export type HistoryOptions = TicketDbHistoryOptions;

export const IssueQuery = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  cursor: Schema.optional(Schema.String),
  from: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  priority: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});
export type IssueQuery = TicketDbIssueQuery;

export const RecordQuery = Schema.Struct({
  from: Schema.optional(Schema.String),
  recordType: Schema.optional(Schema.String),
});
export type RecordQuery = TicketDbRecordQuery;

export const CreateIssueInput = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  body: Schema.optional(Schema.String),
  externalLinks: Schema.optional(Schema.Array(ExternalLink)),
  labels: Schema.optional(StringList),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  planningNotRequired: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  title: Schema.String,
  type: Schema.optional(Schema.String),
});
export type CreateIssueInput = TicketDbCreateIssueInput;

export const UpdateIssueInput = Schema.Struct({
  body: Schema.optional(Schema.String),
  frontmatter: Schema.optional(UnknownRecord),
  message: Schema.optional(Schema.String),
});
export type UpdateIssueInput = TicketDbUpdateIssueInput;

export const TransitionIssueInput = Schema.Struct({
  id: Schema.String,
  reason: Schema.optional(Schema.String),
  status: Schema.String,
});
export type TransitionIssueInput = TicketDbTransitionIssueInput;

export const AddLinkedRecordInput = Schema.Struct({
  issueId: Schema.String,
  payload: Schema.Unknown,
  recordType: Schema.String,
  userVisible: Schema.optional(Schema.Boolean),
});
export type AddLinkedRecordInput = TicketDbAddLinkedRecordInput;

export const CreateDraftInput = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  body: Schema.optional(Schema.String),
  externalLinks: Schema.optional(Schema.Array(ExternalLink)),
  labels: Schema.optional(StringList),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  planningNotRequired: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  source: Schema.optional(Schema.Unknown),
  status: Schema.optional(Schema.String),
  title: Schema.String,
  type: Schema.optional(Schema.String),
});
export type CreateDraftInput = TicketDbCreateDraftInput;

export const UpdateDraftInput = Schema.Struct({
  body: Schema.optional(Schema.String),
  draftId: Schema.String,
  frontmatter: Schema.optional(UnknownRecord),
  status: Schema.optional(DraftStatus),
});
export type UpdateDraftInput = TicketDbUpdateDraftInput;

export const RepositoryScoped = <A extends Schema.Top>(input: A) =>
  Schema.Struct({
    input,
    repository: RepositoryRef,
  });

export type RepositoryScoped<A> = {
  readonly input: A;
  readonly repository: RepositoryRef;
};

export const IssueIdInput = Schema.Struct({
  id: Schema.String,
  options: Schema.optional(ReadOptions),
});
export type IssueIdInput = typeof IssueIdInput.Type;

export const IssueHistoryInput = Schema.Struct({
  id: Schema.String,
  options: Schema.optional(HistoryOptions),
});
export type IssueHistoryInput = typeof IssueHistoryInput.Type;

export const RecordsForIssueInput = Schema.Struct({
  issueId: Schema.String,
  query: Schema.optional(RecordQuery),
});
export type RecordsForIssueInput = typeof RecordsForIssueInput.Type;

export const UpdateIssueRequestInput = Schema.Struct({
  id: Schema.String,
  patch: UpdateIssueInput,
});
export type UpdateIssueRequestInput = typeof UpdateIssueRequestInput.Type;
