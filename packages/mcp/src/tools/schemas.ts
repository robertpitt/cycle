import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";

const RequestId = {
  requestId: Schema.optional(Schema.String),
};

const ContextFields = {
  issueId: Schema.String,
  repositoryId: Schema.String,
  ...RequestId,
};

const TargetIssueFields = {
  targetIssueId: Schema.optional(Schema.String),
};

const PageLimit = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

export const IssueRelationType = Schema.Literals([
  "related",
  "blocked-by",
  "blocking",
  "duplicate",
]);

export const IssueListQueryInput = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  labelIn: Schema.optional(Schema.Array(Schema.String)),
  limit: Schema.optional(PageLimit),
  priority: Schema.optional(Schema.String),
  priorityIn: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(Schema.String),
  statusIn: Schema.optional(Schema.Array(Schema.String)),
  text: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});
export type IssueListQueryInput = typeof IssueListQueryInput.Type;

export const IssueGetInput = Schema.Struct({
  ...ContextFields,
  ...TargetIssueFields,
});
export type IssueGetInput = typeof IssueGetInput.Type;

export const IssueListInput = Schema.Struct({
  ...ContextFields,
  query: Schema.optional(IssueListQueryInput),
});
export type IssueListInput = typeof IssueListInput.Type;

export const IssueSearchInput = Schema.Struct({
  ...ContextFields,
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
  text: Schema.String,
});
export type IssueSearchInput = typeof IssueSearchInput.Type;

export const IssueUpdateInput = Schema.Struct({
  ...ContextFields,
  ...TargetIssueFields,
  body: Schema.optional(Schema.String),
  frontmatter: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  message: Schema.optional(Schema.String),
});
export type IssueUpdateInput = typeof IssueUpdateInput.Type;

export const IssueTransitionInput = Schema.Struct({
  ...ContextFields,
  ...TargetIssueFields,
  reason: Schema.optional(Schema.String),
  status: Schema.String,
});
export type IssueTransitionInput = typeof IssueTransitionInput.Type;

export const IssueCommentsListInput = Schema.Struct({
  ...ContextFields,
  ...TargetIssueFields,
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
});
export type IssueCommentsListInput = typeof IssueCommentsListInput.Type;

export const IssueCommentAddInput = Schema.Struct({
  ...ContextFields,
  ...TargetIssueFields,
  body: Schema.String,
});
export type IssueCommentAddInput = typeof IssueCommentAddInput.Type;

export const IssueHistoryInput = Schema.Struct({
  ...ContextFields,
  ...TargetIssueFields,
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
});
export type IssueHistoryInput = typeof IssueHistoryInput.Type;

export const IssueRelationAddInput = Schema.Struct({
  ...ContextFields,
  ...TargetIssueFields,
  relatedIssueId: Schema.String,
  type: IssueRelationType,
});
export type IssueRelationAddInput = typeof IssueRelationAddInput.Type;

export const IssueRelationRemoveInput = IssueRelationAddInput;
export type IssueRelationRemoveInput = typeof IssueRelationRemoveInput.Type;

export const ApiMetaOutput = Schema.Struct({
  requestId: Schema.optional(Schema.String),
  totalCount: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const ApiResourceEnvelope = <A extends Schema.Top>(data: A) =>
  Schema.Struct({
    data,
    meta: Schema.optional(ApiMetaOutput),
  });

export const ApiCollectionEnvelope = <A extends Schema.Top>(entry: A) =>
  Schema.Struct({
    data: Schema.Array(entry),
    links: Schema.optional(Schema.Unknown),
    meta: Schema.optional(ApiMetaOutput),
    page: Schema.optional(Schema.Unknown),
  });

export const TicketResourceEnvelope = ApiResourceEnvelope(ContractSchemas.TicketDocumentOutput);
export const TicketCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.TicketDocumentOutput);
export const TicketSearchCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.TicketSearchResultOutput,
);
export const CommentCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.LinkedRecordOutput);
export const CommentResourceEnvelope = ApiResourceEnvelope(ContractSchemas.LinkedRecordOutput);
export const HistoryCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.HistoryCommitOutput);

export const ToolErrorOutput = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    details: Schema.optional(Schema.Unknown),
    message: Schema.String,
    requestId: Schema.String,
    retryable: Schema.Boolean,
    status: Schema.optional(Schema.Number),
  }),
  meta: Schema.Struct({
    issueId: Schema.optional(Schema.String),
    repositoryId: Schema.optional(Schema.String),
  }),
});
export type ToolErrorOutput = typeof ToolErrorOutput.Type;
