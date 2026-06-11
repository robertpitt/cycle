import {
  type AddRecordInput,
  type CreateTicketInput,
  type HistoryPage,
  type LinkedRecord,
  type MaterializationWarning,
  type RepositoryStatus,
  type SearchTicketsQuery,
  type TicketDraftDocument,
  type TicketDocument,
  type TicketPage,
  type TicketQuery,
  type TicketRevisionDiff,
  type TicketSearchPage,
  type TransitionTicketInput,
} from "@cycle/database";
import type { SyncResult } from "@cycle/git-db";
import { Schema } from "effect";
import {
  AddLinkedRecordInput as AddLinkedRecordInputSchema,
  ArchiveIssueInput,
  CreateDraftInput as CreateDraftInputSchema,
  CreateIssueInput as CreateIssueInputSchema,
  DeleteIssueInput,
  EmptyInput,
  IssueDiffInput,
  IssueHistoryInput,
  IssueIdInput,
  IssueQuery as IssueQuerySchema,
  IssueRevisionInput,
  RelationIssueInput,
  RecordsForIssueInput,
  RepositoryHistoryInput,
  RepositoryScoped,
  type RepositoryScoped as RepositoryScopedType,
  RestoreIssueInput,
  SearchTicketsInput,
  TransitionIssueInput as TransitionIssueInputSchema,
  UpdateDraftInput as UpdateDraftInputSchema,
  UpdateIssueRequestInput,
  type ArchiveIssueInput as ArchiveIssueInputType,
  type DeleteIssueInput as DeleteIssueInputType,
  type EmptyInput as EmptyInputType,
  type IssueDiffInput as IssueDiffInputType,
  type UpdateIssueRequestInput as UpdateIssueRequestInputType,
  type IssueHistoryInput as IssueHistoryInputType,
  type IssueIdInput as IssueIdInputType,
  type IssueRevisionInput as IssueRevisionInputType,
  type RelationIssueInput as RelationIssueInputType,
  type RecordsForIssueInput as RecordsForIssueInputType,
  type RepositoryHistoryInput as RepositoryHistoryInputType,
  type RestoreIssueInput as RestoreIssueInputType,
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
  "ticket.record.add": RepositoryScoped(AddLinkedRecordInputSchema),
  "ticket.record.listForIssue": RepositoryScoped(RecordsForIssueInput),
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
  "ticket.record.add": Schema.Unknown,
  "ticket.record.listForIssue": Schema.Array(Schema.Unknown),
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
  readonly "ticket.record.add": RepositoryScopedType<AddRecordInput & { readonly issueId: string }>;
  readonly "ticket.record.listForIssue": RepositoryScopedType<RecordsForIssueInputType>;
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
  readonly "ticket.record.add": LinkedRecord;
  readonly "ticket.record.listForIssue": ReadonlyArray<LinkedRecord>;
};
