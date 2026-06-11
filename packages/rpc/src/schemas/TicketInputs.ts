import { Schema } from "effect";
import {
  type AddRecordInput,
  type CreateTicketInput,
  type IssueRelation as DatabaseIssueRelation,
  type RecordQuery as DatabaseRecordQuery,
  type RepositoryHistoryQuery,
  type SearchTicketsQuery as DatabaseSearchTicketsQuery,
  type TicketQuery,
  type TransitionTicketInput,
  type UpdateTicketPatch,
} from "@cycle/database";
import { RepositoryRef } from "./RepositoryRef.ts";

const StringList = Schema.Array(Schema.String);
const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);
const ExternalLinkSchema = Schema.Struct({
  source: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.String,
});
const IssueRelationType = Schema.Literals(["related", "blocked-by", "blocking", "duplicate"]);

export const EmptyInput = Schema.Struct({});
export type EmptyInput = typeof EmptyInput.Type;

export const ReadOptions = Schema.Struct({
  from: Schema.optional(Schema.String),
});
export type ReadOptions = {
  readonly from?: string;
};

export const HistoryOptions = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  from: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
});
export type HistoryOptions = RepositoryHistoryQuery & {
  readonly from?: string;
  readonly max?: number;
};

export const RepositoryHistoryInput = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  ticketId: Schema.optional(Schema.String),
});
export type RepositoryHistoryInput = RepositoryHistoryQuery & {
  readonly max?: number;
};

export const IssueQuery = Schema.Struct({
  archived: Schema.optional(Schema.Boolean),
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  cursor: Schema.optional(Schema.String),
  deleted: Schema.optional(Schema.Boolean),
  dueAfter: Schema.optional(Schema.String),
  dueBefore: Schema.optional(Schema.String),
  estimate: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
  from: Schema.optional(Schema.String),
  hasDueDate: Schema.optional(Schema.Boolean),
  hasEstimate: Schema.optional(Schema.Boolean),
  label: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  orderBy: Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ),
  orderDirection: Schema.optional(Schema.Literals(["asc", "desc"])),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  priority: Schema.optional(Schema.String),
  relation: Schema.optional(
    Schema.Struct({
      issueId: Schema.optional(Schema.String),
      type: Schema.optional(IssueRelationType),
    }),
  ),
  status: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  updatedAfter: Schema.optional(Schema.String),
  updatedBefore: Schema.optional(Schema.String),
});
export type IssueQuery = TicketQuery & {
  readonly from?: string;
};

export const RecordQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  from: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  recordType: Schema.optional(Schema.String),
});
export type RecordQuery = DatabaseRecordQuery & {
  readonly from?: string;
};

export const CreateIssueInput = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  body: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.NullOr(Schema.String)),
  estimate: Schema.optional(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
  externalLinks: Schema.optional(Schema.Array(ExternalLinkSchema)),
  labels: Schema.optional(StringList),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  planningNotRequired: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  title: Schema.String,
  type: Schema.optional(Schema.String),
});
export type CreateIssueInput = CreateTicketInput;

export const UpdateIssueInput = Schema.Struct({
  body: Schema.optional(Schema.String),
  frontmatter: Schema.optional(UnknownRecord),
  message: Schema.optional(Schema.String),
});
export type UpdateIssueInput = UpdateTicketPatch;

export const TransitionIssueInput = Schema.Struct({
  id: Schema.String,
  reason: Schema.optional(Schema.String),
  status: Schema.String,
});
export type TransitionIssueInput = TransitionTicketInput & {
  readonly id: string;
};

export const AddLinkedRecordInput = Schema.Struct({
  issueId: Schema.String,
  payload: Schema.Unknown,
  recordType: Schema.String,
  userVisible: Schema.optional(Schema.Boolean),
});
export type AddLinkedRecordInput = AddRecordInput & {
  readonly issueId: string;
};

export const SearchTicketsInput = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  repositoryIds: Schema.optional(Schema.Array(Schema.String)),
  text: Schema.String,
});
export type SearchTicketsInput = DatabaseSearchTicketsQuery;

export const ArchiveIssueInput = Schema.Struct({
  id: Schema.String,
  reason: Schema.optional(Schema.String),
});
export type ArchiveIssueInput = typeof ArchiveIssueInput.Type;

export const DeleteIssueInput = Schema.Struct({
  id: Schema.String,
  reason: Schema.optional(Schema.String),
});
export type DeleteIssueInput = typeof DeleteIssueInput.Type;

export const RestoreIssueInput = Schema.Struct({
  id: Schema.String,
  reason: Schema.optional(Schema.String),
});
export type RestoreIssueInput = typeof RestoreIssueInput.Type;

export const IssueRelation = Schema.Struct({
  issueId: Schema.String,
  type: IssueRelationType,
});
export type IssueRelation = DatabaseIssueRelation;

export const RelationIssueInput = Schema.Struct({
  id: Schema.String,
  relation: IssueRelation,
});
export type RelationIssueInput = typeof RelationIssueInput.Type;

export const IssueRevisionInput = Schema.Struct({
  id: Schema.String,
  snapshotId: Schema.String,
});
export type IssueRevisionInput = typeof IssueRevisionInput.Type;

export const IssueDiffInput = Schema.Struct({
  fromSnapshotId: Schema.String,
  id: Schema.String,
  toSnapshotId: Schema.String,
});
export type IssueDiffInput = typeof IssueDiffInput.Type;

export const CreateDraftInput = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  body: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.NullOr(Schema.String)),
  estimate: Schema.optional(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
  externalLinks: Schema.optional(Schema.Array(ExternalLinkSchema)),
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
export type CreateDraftInput = CreateTicketInput & {
  readonly source?: unknown;
};

export const UpdateDraftInput = Schema.Struct({
  body: Schema.optional(Schema.String),
  draftId: Schema.String,
  frontmatter: Schema.optional(UnknownRecord),
  status: Schema.optional(Schema.String),
});
export type UpdateDraftInput = {
  readonly body?: string;
  readonly draftId: string;
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly status?: string;
};

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
