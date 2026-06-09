import {
  DraftSession,
  IssueDocument,
  LinkedRecord,
  type AddLinkedRecordInput,
  type CreateDraftInput,
  type CreateIssueInput,
  type DraftSession as DraftSessionType,
  type IssueDocument as IssueDocumentType,
  type IssueHistory as IssueHistoryType,
  type IssuePage as IssuePageType,
  type IssueQuery,
  type LinkedRecord as LinkedRecordType,
  type TransitionIssueInput,
  type UpdateDraftInput,
} from "@cycle/ticket-db";
import { Schema } from "effect";
import {
  AddLinkedRecordInput as AddLinkedRecordInputSchema,
  CreateDraftInput as CreateDraftInputSchema,
  CreateIssueInput as CreateIssueInputSchema,
  IssueHistoryInput,
  IssueIdInput,
  IssueQuery as IssueQuerySchema,
  RecordsForIssueInput,
  RepositoryScoped,
  type RepositoryScoped as RepositoryScopedType,
  TransitionIssueInput as TransitionIssueInputSchema,
  UpdateDraftInput as UpdateDraftInputSchema,
  UpdateIssueRequestInput,
  type UpdateIssueRequestInput as UpdateIssueRequestInputType,
  type IssueHistoryInput as IssueHistoryInputType,
  type IssueIdInput as IssueIdInputType,
  type RecordsForIssueInput as RecordsForIssueInputType,
} from "../schemas/index.ts";
import type { TicketRpcMethod } from "./Envelope.ts";

export const IssuePage = Schema.Struct({
  entries: Schema.Array(IssueDocument),
  nextCursor: Schema.optional(Schema.String),
});

export const IssueHistory = Schema.Struct({
  entries: Schema.Array(
    Schema.Struct({
      issue: Schema.NullOr(IssueDocument),
      snapshotId: Schema.String,
    }),
  ),
  issueId: Schema.String,
});

export const TicketRpcPayloadSchemas = {
  "ticket.draft.commit": RepositoryScoped(Schema.String),
  "ticket.draft.create": RepositoryScoped(CreateDraftInputSchema),
  "ticket.draft.update": RepositoryScoped(UpdateDraftInputSchema),
  "ticket.issue.create": RepositoryScoped(CreateIssueInputSchema),
  "ticket.issue.get": RepositoryScoped(IssueIdInput),
  "ticket.issue.history": RepositoryScoped(IssueHistoryInput),
  "ticket.issue.list": RepositoryScoped(IssueQuerySchema),
  "ticket.issue.transition": RepositoryScoped(TransitionIssueInputSchema),
  "ticket.issue.update": RepositoryScoped(UpdateIssueRequestInput),
  "ticket.record.add": RepositoryScoped(AddLinkedRecordInputSchema),
  "ticket.record.listForIssue": RepositoryScoped(RecordsForIssueInput),
} satisfies Record<TicketRpcMethod, Schema.Top>;

export const TicketRpcSuccessSchemas = {
  "ticket.draft.commit": IssueDocument,
  "ticket.draft.create": DraftSession,
  "ticket.draft.update": DraftSession,
  "ticket.issue.create": IssueDocument,
  "ticket.issue.get": Schema.NullOr(IssueDocument),
  "ticket.issue.history": IssueHistory,
  "ticket.issue.list": IssuePage,
  "ticket.issue.transition": IssueDocument,
  "ticket.issue.update": IssueDocument,
  "ticket.record.add": LinkedRecord,
  "ticket.record.listForIssue": Schema.Array(LinkedRecord),
} satisfies Record<TicketRpcMethod, Schema.Top>;

export type TicketRpcPayloads = {
  readonly "ticket.draft.commit": RepositoryScopedType<string>;
  readonly "ticket.draft.create": RepositoryScopedType<CreateDraftInput>;
  readonly "ticket.draft.update": RepositoryScopedType<UpdateDraftInput>;
  readonly "ticket.issue.create": RepositoryScopedType<CreateIssueInput>;
  readonly "ticket.issue.get": RepositoryScopedType<IssueIdInputType>;
  readonly "ticket.issue.history": RepositoryScopedType<IssueHistoryInputType>;
  readonly "ticket.issue.list": RepositoryScopedType<IssueQuery>;
  readonly "ticket.issue.transition": RepositoryScopedType<TransitionIssueInput>;
  readonly "ticket.issue.update": RepositoryScopedType<UpdateIssueRequestInputType>;
  readonly "ticket.record.add": RepositoryScopedType<AddLinkedRecordInput>;
  readonly "ticket.record.listForIssue": RepositoryScopedType<RecordsForIssueInputType>;
};

export type TicketRpcSuccesses = {
  readonly "ticket.draft.commit": IssueDocumentType;
  readonly "ticket.draft.create": DraftSessionType;
  readonly "ticket.draft.update": DraftSessionType;
  readonly "ticket.issue.create": IssueDocumentType;
  readonly "ticket.issue.get": IssueDocumentType | null;
  readonly "ticket.issue.history": IssueHistoryType;
  readonly "ticket.issue.list": IssuePageType;
  readonly "ticket.issue.transition": IssueDocumentType;
  readonly "ticket.issue.update": IssueDocumentType;
  readonly "ticket.record.add": LinkedRecordType;
  readonly "ticket.record.listForIssue": ReadonlyArray<LinkedRecordType>;
};
