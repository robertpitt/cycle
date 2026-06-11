import { Schema } from "effect";
import {
  type AddRecordInput,
  type CreateIssueTemplateInput as DatabaseCreateIssueTemplateInput,
  type CreateOrUpdateUserProfileInput,
  type CreateSavedViewInput as DatabaseCreateSavedViewInput,
  type CreateTicketInput,
  type InitiativeUpdatePayload,
  type IssueTemplateQuery as DatabaseIssueTemplateQuery,
  type IssueRelation as DatabaseIssueRelation,
  type LabelDefinitionQuery as DatabaseLabelDefinitionQuery,
  type SavedViewQuery as DatabaseSavedViewQuery,
  type RecordQuery as DatabaseRecordQuery,
  type RepositoryHistoryQuery,
  type SearchTicketsQuery as DatabaseSearchTicketsQuery,
  type TicketQuery,
  type TransitionTicketInput,
  type UpdateIssueTemplatePatch as DatabaseUpdateIssueTemplatePatch,
  type UpdateSavedViewPatch as DatabaseUpdateSavedViewPatch,
  type UpdateTicketPatch,
  type UpsertLabelDefinitionInput,
  type UserProfileQuery as DatabaseUserProfileQuery,
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
  assigneeIn: Schema.optional(Schema.Array(Schema.String)),
  blocked: Schema.optional(Schema.Boolean),
  cursor: Schema.optional(Schema.String),
  deleted: Schema.optional(Schema.Boolean),
  dueAfter: Schema.optional(Schema.String),
  dueBefore: Schema.optional(Schema.String),
  estimate: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
  from: Schema.optional(Schema.String),
  hasDueDate: Schema.optional(Schema.Boolean),
  hasEstimate: Schema.optional(Schema.Boolean),
  hasAssignee: Schema.optional(Schema.Boolean),
  hasLabels: Schema.optional(Schema.Boolean),
  label: Schema.optional(Schema.String),
  labelIn: Schema.optional(Schema.Array(Schema.String)),
  limit: Schema.optional(Schema.Number),
  orderBy: Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ),
  orderDirection: Schema.optional(Schema.Literals(["asc", "desc"])),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  priority: Schema.optional(Schema.String),
  priorityIn: Schema.optional(Schema.Array(Schema.String)),
  relation: Schema.optional(
    Schema.Struct({
      issueId: Schema.optional(Schema.String),
      type: Schema.optional(IssueRelationType),
    }),
  ),
  repositoryIds: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(Schema.String),
  staleBefore: Schema.optional(Schema.String),
  statusIn: Schema.optional(Schema.Array(Schema.String)),
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

const IssueTemplateDefaultsInput = Schema.Struct({
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
  title: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});

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

export const UserProfileQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  limit: Schema.optional(Schema.Number),
  text: Schema.optional(Schema.String),
});
export type UserProfileQuery = DatabaseUserProfileQuery;

export const UpsertUserInput = Schema.Struct({
  aliases: Schema.optional(Schema.Array(Schema.String)),
  avatarUrl: Schema.optional(Schema.String),
  disabledAt: Schema.optional(Schema.NullOr(Schema.String)),
  displayName: Schema.String,
  email: Schema.String,
  source: Schema.optional(Schema.Literals(["import", "local-profile", "manual"])),
  timezone: Schema.optional(Schema.String),
});
export type UpsertUserInput = CreateOrUpdateUserProfileInput;

export const LabelDefinitionQuery = Schema.Struct({
  archived: Schema.optional(Schema.Boolean),
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  text: Schema.optional(Schema.String),
});
export type LabelDefinitionQuery = DatabaseLabelDefinitionQuery;

export const UpsertLabelInput = Schema.Struct({
  color: Schema.optional(Schema.String),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  id: Schema.optional(Schema.String),
  name: Schema.String,
});
export type UpsertLabelInput = UpsertLabelDefinitionInput;

export const LabelIdInput = Schema.Struct({
  id: Schema.String,
});
export type LabelIdInput = typeof LabelIdInput.Type;

const SavedViewGroupBy = Schema.Literals([
  "assignee",
  "dueDate",
  "label",
  "none",
  "parent",
  "priority",
  "status",
]);
const SavedViewKind = Schema.Literals(["board", "list"]);
const SavedViewSort = Schema.Struct({
  direction: Schema.optional(Schema.Literals(["asc", "desc"])),
  field: Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ),
});
const SavedViewDisplay = Schema.Struct({
  density: Schema.optional(Schema.Literals(["comfortable", "compact"])),
  properties: Schema.optional(
    Schema.Array(
      Schema.Literals(["assignee", "dueDate", "estimate", "labels", "priority", "status"]),
    ),
  ),
});

export const SavedViewQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  kind: Schema.optional(SavedViewKind),
  limit: Schema.optional(Schema.Number),
  pinned: Schema.optional(Schema.Boolean),
  text: Schema.optional(Schema.String),
});
export type SavedViewQuery = DatabaseSavedViewQuery;

export const CreateSavedViewInput = Schema.Struct({
  description: Schema.optional(Schema.String),
  display: Schema.optional(SavedViewDisplay),
  groupBy: Schema.optional(SavedViewGroupBy),
  kind: Schema.optional(SavedViewKind),
  name: Schema.String,
  pinned: Schema.optional(Schema.Boolean),
  query: Schema.optional(IssueQuery),
  sort: Schema.optional(SavedViewSort),
});
export type CreateSavedViewInput = DatabaseCreateSavedViewInput;

export const UpdateSavedViewInput = Schema.Struct({
  builtIn: Schema.optional(Schema.Boolean),
  description: Schema.optional(Schema.String),
  display: Schema.optional(SavedViewDisplay),
  groupBy: Schema.optional(SavedViewGroupBy),
  kind: Schema.optional(SavedViewKind),
  name: Schema.optional(Schema.String),
  pinned: Schema.optional(Schema.Boolean),
  query: Schema.optional(IssueQuery),
  sort: Schema.optional(SavedViewSort),
});
export type UpdateSavedViewInput = DatabaseUpdateSavedViewPatch;

export const ViewIdInput = Schema.Struct({
  id: Schema.String,
});
export type ViewIdInput = typeof ViewIdInput.Type;

export const UpdateViewRequestInput = Schema.Struct({
  id: Schema.String,
  patch: UpdateSavedViewInput,
});
export type UpdateViewRequestInput = typeof UpdateViewRequestInput.Type;

export const IssueTemplateKind = Schema.Literals([
  "bug",
  "feature",
  "implementation",
  "initiative",
  "qa",
]);
export const IssueTemplateQuery = Schema.Struct({
  active: Schema.optional(Schema.Boolean),
  cursor: Schema.optional(Schema.String),
  kind: Schema.optional(IssueTemplateKind),
  limit: Schema.optional(Schema.Number),
  text: Schema.optional(Schema.String),
});
export type IssueTemplateQuery = DatabaseIssueTemplateQuery;

export const CreateIssueTemplateInput = Schema.Struct({
  active: Schema.optional(Schema.Boolean),
  bodyTemplate: Schema.String,
  defaults: Schema.optional(IssueTemplateDefaultsInput),
  description: Schema.optional(Schema.String),
  kind: IssueTemplateKind,
  name: Schema.String,
  titleTemplate: Schema.String,
});
export type CreateIssueTemplateInput = DatabaseCreateIssueTemplateInput;

export const UpdateIssueTemplateInput = Schema.Struct({
  active: Schema.optional(Schema.Boolean),
  bodyTemplate: Schema.optional(Schema.String),
  defaults: Schema.optional(IssueTemplateDefaultsInput),
  description: Schema.optional(Schema.String),
  kind: Schema.optional(IssueTemplateKind),
  name: Schema.optional(Schema.String),
  titleTemplate: Schema.optional(Schema.String),
});
export type UpdateIssueTemplateInput = DatabaseUpdateIssueTemplatePatch;

export const TemplateIdInput = Schema.Struct({
  id: Schema.String,
});
export type TemplateIdInput = typeof TemplateIdInput.Type;

export const UpdateTemplateRequestInput = Schema.Struct({
  id: Schema.String,
  patch: UpdateIssueTemplateInput,
});
export type UpdateTemplateRequestInput = typeof UpdateTemplateRequestInput.Type;

export const InitiativeProgressInput = Schema.Struct({
  id: Schema.String,
});
export type InitiativeProgressInput = typeof InitiativeProgressInput.Type;

export const InitiativeUpdateInput = Schema.Struct({
  blockers: Schema.optional(Schema.Array(Schema.String)),
  nextSteps: Schema.optional(Schema.Array(Schema.String)),
  progressNote: Schema.optional(Schema.String),
  status: Schema.Literals(["at-risk", "blocked", "complete", "on-track"]),
  summary: Schema.String,
});
export type InitiativeUpdateInput = InitiativeUpdatePayload;

export const AddInitiativeUpdateRequestInput = Schema.Struct({
  id: Schema.String,
  update: InitiativeUpdateInput,
});
export type AddInitiativeUpdateRequestInput = typeof AddInitiativeUpdateRequestInput.Type;
