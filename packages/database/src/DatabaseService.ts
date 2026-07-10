import { Context, Effect } from "effect";
import type {
  AddCommentInput,
  AddRecordInput,
  ArchiveTicketInput,
  CommitOptions,
  CreateIssueTemplateInput,
  CreateOrUpdateUserProfileInput,
  CreateSavedViewInput,
  CreateTicketDraftInput,
  CreateTicketInput,
  DeleteTicketInput,
  HistoryPage,
  InboxMutationInput,
  InboxMutationResult,
  InboxPage,
  InboxQuery,
  InboxSummary,
  InitiativeProgress,
  InitiativeUpdatePayload,
  IssueRelation,
  IssueTemplateDocument,
  IssueTemplatePage,
  IssueTemplateQuery,
  LabelDefinitionDocument,
  LabelDefinitionPage,
  LabelDefinitionQuery,
  LinkedRecord,
  MaterializationWarning,
  RecordPage,
  RecordQuery,
  RepositoryHistoryQuery,
  RepositoryInput,
  RepositoryStatus,
  RestoreTicketInput,
  SavedViewDocument,
  SavedViewPage,
  SavedViewQuery,
  SearchTicketsQuery,
  TicketDocument,
  TicketDraftDocument,
  TicketPage,
  TicketQuery,
  TicketRevisionDiff,
  TicketSearchPage,
  TransitionTicketInput,
  UpdateIssueTemplatePatch,
  UpdateSavedViewPatch,
  UpdateTicketDraftInput,
  UpdateTicketPatch,
  UpsertLabelDefinitionInput,
  UserProfileDocument,
  UserProfilePage,
  UserProfileQuery,
} from "./domain/index.ts";
import type { DatabaseFailure } from "./DatabaseErrors.ts";
import type { RepositorySyncResult } from "./RepositoryStore.ts";

export type DatabaseServiceOptions = {
  readonly projectionPath?: string;
};

export type DatabaseServiceShape = {
  readonly addComment: (
    repositoryId: string,
    ticketId: string,
    input: AddCommentInput,
    options?: CommitOptions,
  ) => Effect.Effect<LinkedRecord, DatabaseFailure>;
  readonly addIssueRelation: (
    repositoryId: string,
    ticketId: string,
    relation: IssueRelation,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly addRecord: <TPayload = unknown>(
    repositoryId: string,
    ticketId: string,
    input: AddRecordInput<TPayload>,
    options?: CommitOptions,
  ) => Effect.Effect<LinkedRecord, DatabaseFailure>;
  readonly archiveTicket: (
    repositoryId: string,
    ticketId: string,
    input?: ArchiveTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly close: Effect.Effect<void>;
  readonly commitDraft: (
    repositoryId: string,
    draftId: string,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly createDraft: (
    repositoryId: string,
    input: CreateTicketDraftInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDraftDocument, DatabaseFailure>;
  readonly createTicket: (
    repositoryId: string,
    input: CreateTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly deleteTicket: (
    repositoryId: string,
    ticketId: string,
    input?: DeleteTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly getTicket: (
    repositoryId: string,
    ticketId: string,
  ) => Effect.Effect<TicketDocument | null, DatabaseFailure>;
  readonly listRepositories: Effect.Effect<ReadonlyArray<RepositoryStatus>, DatabaseFailure>;
  readonly createInitiative: (
    repositoryId: string,
    input: CreateTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly createTemplate: (
    repositoryId: string,
    input: CreateIssueTemplateInput,
    options?: CommitOptions,
  ) => Effect.Effect<IssueTemplateDocument, DatabaseFailure>;
  readonly createView: (
    repositoryId: string,
    input: CreateSavedViewInput,
    options?: CommitOptions,
  ) => Effect.Effect<SavedViewDocument, DatabaseFailure>;
  readonly getTemplate: (
    repositoryId: string,
    templateId: string,
  ) => Effect.Effect<IssueTemplateDocument | null, DatabaseFailure>;
  readonly getUser: (
    repositoryId: string,
    userId: string,
  ) => Effect.Effect<UserProfileDocument | null, DatabaseFailure>;
  readonly getView: (
    repositoryId: string,
    viewId: string,
  ) => Effect.Effect<SavedViewDocument | null, DatabaseFailure>;
  readonly archiveInboxItems: (
    input: InboxMutationInput,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly inboxSummary: (query: InboxQuery) => Effect.Effect<InboxSummary, DatabaseFailure>;
  readonly initiativeProgress: (
    repositoryId: string,
    initiativeId: string,
  ) => Effect.Effect<InitiativeProgress, DatabaseFailure>;
  readonly listLabels: (
    repositoryId: string,
    query?: LabelDefinitionQuery,
  ) => Effect.Effect<LabelDefinitionPage, DatabaseFailure>;
  readonly listTemplates: (
    repositoryId: string,
    query?: IssueTemplateQuery,
  ) => Effect.Effect<IssueTemplatePage, DatabaseFailure>;
  readonly listInbox: (query: InboxQuery) => Effect.Effect<InboxPage, DatabaseFailure>;
  readonly listIssueRelations: (
    repositoryId: string,
    ticketId: string,
  ) => Effect.Effect<ReadonlyArray<IssueRelation>, DatabaseFailure>;
  readonly listTickets: (query?: TicketQuery) => Effect.Effect<TicketPage, DatabaseFailure>;
  readonly listUsers: (
    repositoryId: string,
    query?: UserProfileQuery,
  ) => Effect.Effect<UserProfilePage, DatabaseFailure>;
  readonly listViews: (
    repositoryId: string,
    query?: SavedViewQuery,
  ) => Effect.Effect<SavedViewPage, DatabaseFailure>;
  readonly materializationWarnings: (
    repositoryId: string,
  ) => Effect.Effect<ReadonlyArray<MaterializationWarning>, DatabaseFailure>;
  readonly markInboxRead: (
    input: InboxMutationInput,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly markInboxUnread: (
    input: InboxMutationInput,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly openRepository: (
    input: RepositoryInput,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly repositoryHistory: (
    repositoryId: string,
    query?: RepositoryHistoryQuery,
  ) => Effect.Effect<HistoryPage, DatabaseFailure>;
  readonly pushRepository: (
    repositoryId: string,
  ) => Effect.Effect<RepositorySyncResult, DatabaseFailure>;
  readonly repositoryStatus: (
    repositoryId: string,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly removeIssueRelation: (
    repositoryId: string,
    ticketId: string,
    relation: IssueRelation,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly restoreTicket: (
    repositoryId: string,
    ticketId: string,
    input?: RestoreTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly searchTickets: (
    query: SearchTicketsQuery,
  ) => Effect.Effect<TicketSearchPage, DatabaseFailure>;
  readonly syncRepository: (
    repositoryId: string,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly ticketComments: (
    repositoryId: string,
    ticketId: string,
    query?: RecordQuery,
  ) => Effect.Effect<RecordPage, DatabaseFailure>;
  readonly ticketHistory: (
    repositoryId: string,
    ticketId: string,
    query?: RepositoryHistoryQuery,
  ) => Effect.Effect<HistoryPage, DatabaseFailure>;
  readonly ticketDiff: (
    repositoryId: string,
    ticketId: string,
    fromSnapshotId: string,
    toSnapshotId: string,
  ) => Effect.Effect<TicketRevisionDiff, DatabaseFailure>;
  readonly ticketRevision: (
    repositoryId: string,
    ticketId: string,
    snapshotId: string,
  ) => Effect.Effect<TicketDocument | null, DatabaseFailure>;
  readonly ticketRecords: (
    repositoryId: string,
    ticketId: string,
    query?: RecordQuery,
  ) => Effect.Effect<RecordPage, DatabaseFailure>;
  readonly transitionTicket: (
    repositoryId: string,
    ticketId: string,
    input: TransitionTicketInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly updateDraft: (
    repositoryId: string,
    draftId: string,
    input: UpdateTicketDraftInput,
    options?: CommitOptions,
  ) => Effect.Effect<TicketDraftDocument, DatabaseFailure>;
  readonly updateTicket: (
    repositoryId: string,
    ticketId: string,
    patch: UpdateTicketPatch,
  ) => Effect.Effect<TicketDocument, DatabaseFailure>;
  readonly addInitiativeUpdate: (
    repositoryId: string,
    initiativeId: string,
    input: InitiativeUpdatePayload,
    options?: CommitOptions,
  ) => Effect.Effect<LinkedRecord, DatabaseFailure>;
  readonly archiveLabel: (
    repositoryId: string,
    labelId: string,
    options?: CommitOptions,
  ) => Effect.Effect<LabelDefinitionDocument, DatabaseFailure>;
  readonly archiveTemplate: (
    repositoryId: string,
    templateId: string,
    options?: CommitOptions,
  ) => Effect.Effect<IssueTemplateDocument, DatabaseFailure>;
  readonly deleteView: (
    repositoryId: string,
    viewId: string,
    options?: CommitOptions,
  ) => Effect.Effect<SavedViewDocument, DatabaseFailure>;
  readonly updateTemplate: (
    repositoryId: string,
    templateId: string,
    patch: UpdateIssueTemplatePatch,
    options?: CommitOptions,
  ) => Effect.Effect<IssueTemplateDocument, DatabaseFailure>;
  readonly updateView: (
    repositoryId: string,
    viewId: string,
    patch: UpdateSavedViewPatch,
    options?: CommitOptions,
  ) => Effect.Effect<SavedViewDocument, DatabaseFailure>;
  readonly upsertLabel: (
    repositoryId: string,
    input: UpsertLabelDefinitionInput,
    options?: CommitOptions,
  ) => Effect.Effect<LabelDefinitionDocument, DatabaseFailure>;
  readonly upsertUser: (
    repositoryId: string,
    input: CreateOrUpdateUserProfileInput,
    options?: CommitOptions,
  ) => Effect.Effect<UserProfileDocument, DatabaseFailure>;
};

export class DatabaseService extends Context.Service<DatabaseService, DatabaseServiceShape>()(
  "@cycle/database/DatabaseService",
) {}
