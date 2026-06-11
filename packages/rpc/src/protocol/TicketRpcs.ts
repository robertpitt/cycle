import {
  type AddRecordInput,
  type CreateIssueTemplateInput as DatabaseCreateIssueTemplateInput,
  type CreateOrUpdateUserProfileInput,
  type CreateSavedViewInput as DatabaseCreateSavedViewInput,
  type CreateTicketInput,
  type HistoryPage,
  type InitiativeProgress,
  type IssueTemplateDocument,
  type IssueTemplatePage,
  type IssueTemplateQuery,
  type LabelDefinitionDocument,
  type LabelDefinitionPage,
  type LabelDefinitionQuery,
  type LinkedRecord,
  type MaterializationWarning,
  type RepositoryStatus,
  type SavedViewDocument,
  type SavedViewPage,
  type SavedViewQuery,
  type SearchTicketsQuery,
  type TicketDraftDocument,
  type TicketDocument,
  type TicketPage,
  type TicketQuery,
  type TicketRevisionDiff,
  type TicketSearchPage,
  type TransitionTicketInput,
  type UpsertLabelDefinitionInput,
  type UserProfileDocument,
  type UserProfilePage,
  type UserProfileQuery,
} from "@cycle/database";
import type { SyncResult } from "@cycle/git-db";
import { Schema } from "effect";
import {
  AddLinkedRecordInput as AddLinkedRecordInputSchema,
  AddInitiativeUpdateRequestInput,
  ArchiveIssueInput,
  CreateDraftInput as CreateDraftInputSchema,
  CreateIssueTemplateInput as CreateIssueTemplateInputSchema,
  CreateIssueInput as CreateIssueInputSchema,
  CreateSavedViewInput as CreateSavedViewInputSchema,
  DeleteIssueInput,
  EmptyInput,
  IssueDiffInput,
  IssueHistoryInput,
  IssueIdInput,
  InitiativeProgressInput,
  IssueTemplateQuery as IssueTemplateQuerySchema,
  IssueQuery as IssueQuerySchema,
  IssueRevisionInput,
  LabelDefinitionQuery as LabelDefinitionQuerySchema,
  LabelIdInput,
  RelationIssueInput,
  RecordsForIssueInput,
  RepositoryHistoryInput,
  RepositoryScoped,
  type RepositoryScoped as RepositoryScopedType,
  RestoreIssueInput,
  SavedViewQuery as SavedViewQuerySchema,
  SearchTicketsInput,
  TemplateIdInput,
  TransitionIssueInput as TransitionIssueInputSchema,
  UpdateDraftInput as UpdateDraftInputSchema,
  UpdateTemplateRequestInput,
  UpdateIssueRequestInput,
  UpdateViewRequestInput,
  UpsertLabelInput,
  UpsertUserInput,
  UserProfileQuery as UserProfileQuerySchema,
  ViewIdInput,
  type AddInitiativeUpdateRequestInput as AddInitiativeUpdateRequestInputType,
  type ArchiveIssueInput as ArchiveIssueInputType,
  type DeleteIssueInput as DeleteIssueInputType,
  type EmptyInput as EmptyInputType,
  type IssueDiffInput as IssueDiffInputType,
  type InitiativeProgressInput as InitiativeProgressInputType,
  type UpdateIssueRequestInput as UpdateIssueRequestInputType,
  type IssueHistoryInput as IssueHistoryInputType,
  type IssueIdInput as IssueIdInputType,
  type IssueRevisionInput as IssueRevisionInputType,
  type LabelIdInput as LabelIdInputType,
  type RelationIssueInput as RelationIssueInputType,
  type RecordsForIssueInput as RecordsForIssueInputType,
  type RepositoryHistoryInput as RepositoryHistoryInputType,
  type RestoreIssueInput as RestoreIssueInputType,
  type TemplateIdInput as TemplateIdInputType,
  type UpdateTemplateRequestInput as UpdateTemplateRequestInputType,
  type UpdateViewRequestInput as UpdateViewRequestInputType,
  type ViewIdInput as ViewIdInputType,
} from "../schemas/index.ts";
import type { TicketRpcMethod } from "./Envelope.ts";

export const IssuePage = Schema.Struct({
  entries: Schema.Array(Schema.Unknown),
  nextCursor: Schema.optional(Schema.String),
});

export const IssueHistory = Schema.Struct({
  entries: Schema.Array(Schema.Unknown),
  nextCursor: Schema.optional(Schema.String),
});

export const TicketRpcPayloadSchemas = {
  "repository.history.list": RepositoryScoped(RepositoryHistoryInput),
  "repository.materializationWarnings": RepositoryScoped(EmptyInput),
  "repository.status.get": RepositoryScoped(EmptyInput),
  "repository.status.list": EmptyInput,
  "repository.push": RepositoryScoped(EmptyInput),
  "repository.sync": RepositoryScoped(EmptyInput),
  "ticket.draft.commit": RepositoryScoped(Schema.String),
  "ticket.draft.create": RepositoryScoped(CreateDraftInputSchema),
  "ticket.draft.update": RepositoryScoped(UpdateDraftInputSchema),
  "ticket.issue.archive": RepositoryScoped(ArchiveIssueInput),
  "ticket.issue.create": RepositoryScoped(CreateIssueInputSchema),
  "ticket.issue.delete": RepositoryScoped(DeleteIssueInput),
  "ticket.issue.diff": RepositoryScoped(IssueDiffInput),
  "ticket.issue.get": RepositoryScoped(IssueIdInput),
  "ticket.issue.history": RepositoryScoped(IssueHistoryInput),
  "ticket.issue.list": RepositoryScoped(IssueQuerySchema),
  "ticket.issue.relation.add": RepositoryScoped(RelationIssueInput),
  "ticket.issue.relation.remove": RepositoryScoped(RelationIssueInput),
  "ticket.issue.restore": RepositoryScoped(RestoreIssueInput),
  "ticket.issue.revision.get": RepositoryScoped(IssueRevisionInput),
  "ticket.issue.search": RepositoryScoped(SearchTicketsInput),
  "ticket.issue.transition": RepositoryScoped(TransitionIssueInputSchema),
  "ticket.issue.update": RepositoryScoped(UpdateIssueRequestInput),
  "ticket.initiative.create": RepositoryScoped(CreateIssueInputSchema),
  "ticket.initiative.progress": RepositoryScoped(InitiativeProgressInput),
  "ticket.initiative.update.add": RepositoryScoped(AddInitiativeUpdateRequestInput),
  "ticket.label.archive": RepositoryScoped(LabelIdInput),
  "ticket.label.list": RepositoryScoped(LabelDefinitionQuerySchema),
  "ticket.label.upsert": RepositoryScoped(UpsertLabelInput),
  "ticket.record.add": RepositoryScoped(AddLinkedRecordInputSchema),
  "ticket.record.listForIssue": RepositoryScoped(RecordsForIssueInput),
  "ticket.template.archive": RepositoryScoped(TemplateIdInput),
  "ticket.template.create": RepositoryScoped(CreateIssueTemplateInputSchema),
  "ticket.template.get": RepositoryScoped(TemplateIdInput),
  "ticket.template.list": RepositoryScoped(IssueTemplateQuerySchema),
  "ticket.template.update": RepositoryScoped(UpdateTemplateRequestInput),
  "ticket.user.get": RepositoryScoped(Schema.String),
  "ticket.user.list": RepositoryScoped(UserProfileQuerySchema),
  "ticket.user.upsert": RepositoryScoped(UpsertUserInput),
  "ticket.view.create": RepositoryScoped(CreateSavedViewInputSchema),
  "ticket.view.delete": RepositoryScoped(ViewIdInput),
  "ticket.view.get": RepositoryScoped(ViewIdInput),
  "ticket.view.list": RepositoryScoped(SavedViewQuerySchema),
  "ticket.view.update": RepositoryScoped(UpdateViewRequestInput),
} satisfies Record<TicketRpcMethod, Schema.Top>;

export const TicketRpcSuccessSchemas = {
  "repository.history.list": IssueHistory,
  "repository.materializationWarnings": Schema.Array(Schema.Unknown),
  "repository.status.get": Schema.Unknown,
  "repository.status.list": Schema.Array(Schema.Unknown),
  "repository.push": Schema.Unknown,
  "repository.sync": Schema.Unknown,
  "ticket.draft.commit": Schema.Unknown,
  "ticket.draft.create": Schema.Unknown,
  "ticket.draft.update": Schema.Unknown,
  "ticket.issue.archive": Schema.Unknown,
  "ticket.issue.create": Schema.Unknown,
  "ticket.issue.delete": Schema.Unknown,
  "ticket.issue.diff": Schema.Unknown,
  "ticket.issue.get": Schema.NullOr(Schema.Unknown),
  "ticket.issue.history": IssueHistory,
  "ticket.issue.list": IssuePage,
  "ticket.issue.relation.add": Schema.Unknown,
  "ticket.issue.relation.remove": Schema.Unknown,
  "ticket.issue.restore": Schema.Unknown,
  "ticket.issue.revision.get": Schema.NullOr(Schema.Unknown),
  "ticket.issue.search": IssuePage,
  "ticket.issue.transition": Schema.Unknown,
  "ticket.issue.update": Schema.Unknown,
  "ticket.initiative.create": Schema.Unknown,
  "ticket.initiative.progress": Schema.Unknown,
  "ticket.initiative.update.add": Schema.Unknown,
  "ticket.label.archive": Schema.Unknown,
  "ticket.label.list": IssuePage,
  "ticket.label.upsert": Schema.Unknown,
  "ticket.record.add": Schema.Unknown,
  "ticket.record.listForIssue": Schema.Array(Schema.Unknown),
  "ticket.template.archive": Schema.Unknown,
  "ticket.template.create": Schema.Unknown,
  "ticket.template.get": Schema.NullOr(Schema.Unknown),
  "ticket.template.list": IssuePage,
  "ticket.template.update": Schema.Unknown,
  "ticket.user.get": Schema.NullOr(Schema.Unknown),
  "ticket.user.list": IssuePage,
  "ticket.user.upsert": Schema.Unknown,
  "ticket.view.create": Schema.Unknown,
  "ticket.view.delete": Schema.Unknown,
  "ticket.view.get": Schema.NullOr(Schema.Unknown),
  "ticket.view.list": IssuePage,
  "ticket.view.update": Schema.Unknown,
} satisfies Record<TicketRpcMethod, Schema.Top>;

export type TicketRpcPayloads = {
  readonly "repository.history.list": RepositoryScopedType<RepositoryHistoryInputType>;
  readonly "repository.materializationWarnings": RepositoryScopedType<EmptyInputType>;
  readonly "repository.status.get": RepositoryScopedType<EmptyInputType>;
  readonly "repository.status.list": EmptyInputType;
  readonly "repository.push": RepositoryScopedType<EmptyInputType>;
  readonly "repository.sync": RepositoryScopedType<EmptyInputType>;
  readonly "ticket.draft.commit": RepositoryScopedType<string>;
  readonly "ticket.draft.create": RepositoryScopedType<
    CreateTicketInput & { readonly source?: unknown }
  >;
  readonly "ticket.draft.update": RepositoryScopedType<{
    readonly body?: string;
    readonly draftId: string;
    readonly frontmatter?: Readonly<Record<string, unknown>>;
    readonly status?: string;
  }>;
  readonly "ticket.issue.archive": RepositoryScopedType<ArchiveIssueInputType>;
  readonly "ticket.issue.create": RepositoryScopedType<CreateTicketInput>;
  readonly "ticket.issue.delete": RepositoryScopedType<DeleteIssueInputType>;
  readonly "ticket.issue.diff": RepositoryScopedType<IssueDiffInputType>;
  readonly "ticket.issue.get": RepositoryScopedType<IssueIdInputType>;
  readonly "ticket.issue.history": RepositoryScopedType<IssueHistoryInputType>;
  readonly "ticket.issue.list": RepositoryScopedType<TicketQuery>;
  readonly "ticket.issue.relation.add": RepositoryScopedType<RelationIssueInputType>;
  readonly "ticket.issue.relation.remove": RepositoryScopedType<RelationIssueInputType>;
  readonly "ticket.issue.restore": RepositoryScopedType<RestoreIssueInputType>;
  readonly "ticket.issue.revision.get": RepositoryScopedType<IssueRevisionInputType>;
  readonly "ticket.issue.search": RepositoryScopedType<SearchTicketsQuery>;
  readonly "ticket.issue.transition": RepositoryScopedType<
    TransitionTicketInput & { readonly id: string }
  >;
  readonly "ticket.issue.update": RepositoryScopedType<UpdateIssueRequestInputType>;
  readonly "ticket.initiative.create": RepositoryScopedType<CreateTicketInput>;
  readonly "ticket.initiative.progress": RepositoryScopedType<InitiativeProgressInputType>;
  readonly "ticket.initiative.update.add": RepositoryScopedType<AddInitiativeUpdateRequestInputType>;
  readonly "ticket.label.archive": RepositoryScopedType<LabelIdInputType>;
  readonly "ticket.label.list": RepositoryScopedType<LabelDefinitionQuery>;
  readonly "ticket.label.upsert": RepositoryScopedType<UpsertLabelDefinitionInput>;
  readonly "ticket.record.add": RepositoryScopedType<AddRecordInput & { readonly issueId: string }>;
  readonly "ticket.record.listForIssue": RepositoryScopedType<RecordsForIssueInputType>;
  readonly "ticket.template.archive": RepositoryScopedType<TemplateIdInputType>;
  readonly "ticket.template.create": RepositoryScopedType<DatabaseCreateIssueTemplateInput>;
  readonly "ticket.template.get": RepositoryScopedType<TemplateIdInputType>;
  readonly "ticket.template.list": RepositoryScopedType<IssueTemplateQuery>;
  readonly "ticket.template.update": RepositoryScopedType<UpdateTemplateRequestInputType>;
  readonly "ticket.user.get": RepositoryScopedType<string>;
  readonly "ticket.user.list": RepositoryScopedType<UserProfileQuery>;
  readonly "ticket.user.upsert": RepositoryScopedType<CreateOrUpdateUserProfileInput>;
  readonly "ticket.view.create": RepositoryScopedType<DatabaseCreateSavedViewInput>;
  readonly "ticket.view.delete": RepositoryScopedType<ViewIdInputType>;
  readonly "ticket.view.get": RepositoryScopedType<ViewIdInputType>;
  readonly "ticket.view.list": RepositoryScopedType<SavedViewQuery>;
  readonly "ticket.view.update": RepositoryScopedType<UpdateViewRequestInputType>;
};

export type TicketRpcSuccesses = {
  readonly "repository.history.list": HistoryPage;
  readonly "repository.materializationWarnings": ReadonlyArray<MaterializationWarning>;
  readonly "repository.status.get": RepositoryStatus;
  readonly "repository.status.list": ReadonlyArray<RepositoryStatus>;
  readonly "repository.push": SyncResult;
  readonly "repository.sync": RepositoryStatus;
  readonly "ticket.draft.commit": TicketDocument;
  readonly "ticket.draft.create": TicketDraftDocument;
  readonly "ticket.draft.update": TicketDraftDocument;
  readonly "ticket.issue.archive": TicketDocument;
  readonly "ticket.issue.create": TicketDocument;
  readonly "ticket.issue.delete": TicketDocument;
  readonly "ticket.issue.diff": TicketRevisionDiff;
  readonly "ticket.issue.get": TicketDocument | null;
  readonly "ticket.issue.history": HistoryPage;
  readonly "ticket.issue.list": TicketPage;
  readonly "ticket.issue.relation.add": TicketDocument;
  readonly "ticket.issue.relation.remove": TicketDocument;
  readonly "ticket.issue.restore": TicketDocument;
  readonly "ticket.issue.revision.get": TicketDocument | null;
  readonly "ticket.issue.search": TicketSearchPage;
  readonly "ticket.issue.transition": TicketDocument;
  readonly "ticket.issue.update": TicketDocument;
  readonly "ticket.initiative.create": TicketDocument;
  readonly "ticket.initiative.progress": InitiativeProgress;
  readonly "ticket.initiative.update.add": LinkedRecord;
  readonly "ticket.label.archive": LabelDefinitionDocument;
  readonly "ticket.label.list": LabelDefinitionPage;
  readonly "ticket.label.upsert": LabelDefinitionDocument;
  readonly "ticket.record.add": LinkedRecord;
  readonly "ticket.record.listForIssue": ReadonlyArray<LinkedRecord>;
  readonly "ticket.template.archive": IssueTemplateDocument;
  readonly "ticket.template.create": IssueTemplateDocument;
  readonly "ticket.template.get": IssueTemplateDocument | null;
  readonly "ticket.template.list": IssueTemplatePage;
  readonly "ticket.template.update": IssueTemplateDocument;
  readonly "ticket.user.get": UserProfileDocument | null;
  readonly "ticket.user.list": UserProfilePage;
  readonly "ticket.user.upsert": UserProfileDocument;
  readonly "ticket.view.create": SavedViewDocument;
  readonly "ticket.view.delete": SavedViewDocument;
  readonly "ticket.view.get": SavedViewDocument | null;
  readonly "ticket.view.list": SavedViewPage;
  readonly "ticket.view.update": SavedViewDocument;
};
