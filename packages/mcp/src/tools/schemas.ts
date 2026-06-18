import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";

const RequestId = {
  requestId: Schema.optional(Schema.String),
};

const RepositoryFields = {
  repositoryId: Schema.String,
  ...RequestId,
};

const OptionalRepositoryFields = {
  repositoryId: Schema.optional(Schema.String),
  ...RequestId,
};

const IssueContextFields = {
  ...RepositoryFields,
  issueId: Schema.String,
};

const TargetIssueFields = {
  targetIssueId: Schema.optional(Schema.String),
};

const PageLimit = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);
const StringList = Schema.Array(Schema.String);

const ExternalLinkInput = Schema.Struct({
  source: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.String,
});

const IssueCreateFields = {
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  body: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.NullOr(Schema.String)),
  estimate: Schema.optional(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
  externalLinks: Schema.optional(Schema.Array(ExternalLinkInput)),
  labels: Schema.optional(StringList),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  planningNotRequired: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  title: Schema.String,
  type: Schema.optional(Schema.String),
};

const SearchTextInput = {
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
  text: Schema.optional(Schema.String),
};

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
  repositoryIds: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(Schema.String),
  statusIn: Schema.optional(Schema.Array(Schema.String)),
  text: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});
export type IssueListQueryInput = typeof IssueListQueryInput.Type;

export const RepositoryListInput = Schema.Struct({
  path: Schema.optional(Schema.String),
  repositoryId: Schema.optional(Schema.String),
  ...RequestId,
});
export type RepositoryListInput = typeof RepositoryListInput.Type;

export const RepositoryGetInput = Schema.Struct({
  ...RepositoryFields,
});
export type RepositoryGetInput = typeof RepositoryGetInput.Type;

export const AutocompleteInput = Schema.Struct({
  limit: Schema.optional(PageLimit),
  query: Schema.optional(Schema.String),
  types: Schema.optional(Schema.Array(Schema.Literals(["repository", "ticket"]))),
  ...RequestId,
});
export type AutocompleteInput = typeof AutocompleteInput.Type;

export const InboxListInput = Schema.Struct({
  createdAfter: Schema.optional(Schema.String),
  createdBefore: Schema.optional(Schema.String),
  cursor: Schema.optional(Schema.String),
  includeSourceInactive: Schema.optional(Schema.Boolean),
  limit: Schema.optional(PageLimit),
  reason: Schema.optional(
    Schema.Literals(["assigned", "comment_assigned", "comment_created", "mention"]),
  ),
  repositoryIds: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(Schema.Literals(["archived", "read", "snoozed", "unread", "all"])),
  ticketId: Schema.optional(Schema.String),
  userId: Schema.String,
  ...RequestId,
});
export type InboxListInput = typeof InboxListInput.Type;

export const InboxMutationInput = Schema.Struct({
  allowMissing: Schema.optional(Schema.Boolean),
  itemIds: Schema.Array(Schema.String),
  userId: Schema.String,
  ...RequestId,
});
export type InboxMutationInput = typeof InboxMutationInput.Type;

export const IssueGetInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
});
export type IssueGetInput = typeof IssueGetInput.Type;

export const IssueListInput = Schema.Struct({
  ...RepositoryFields,
  issueId: Schema.optional(Schema.String),
  query: Schema.optional(IssueListQueryInput),
});
export type IssueListInput = typeof IssueListInput.Type;

export const IssueSearchInput = Schema.Struct({
  ...RepositoryFields,
  issueId: Schema.optional(Schema.String),
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
  repositoryIds: Schema.optional(Schema.Array(Schema.String)),
  text: Schema.String,
});
export type IssueSearchInput = typeof IssueSearchInput.Type;

export const IssueCreateInput = Schema.Struct({
  ...RepositoryFields,
  ...IssueCreateFields,
});
export type IssueCreateInput = typeof IssueCreateInput.Type;

export const IssueUpdateInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  body: Schema.optional(Schema.String),
  frontmatter: Schema.optional(UnknownRecord),
  message: Schema.optional(Schema.String),
});
export type IssueUpdateInput = typeof IssueUpdateInput.Type;

export const IssueTransitionInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  reason: Schema.optional(Schema.String),
  status: Schema.String,
});
export type IssueTransitionInput = typeof IssueTransitionInput.Type;

export const IssueCommentsListInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
});
export type IssueCommentsListInput = typeof IssueCommentsListInput.Type;

export const IssueCommentAddInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  body: Schema.String,
});
export type IssueCommentAddInput = typeof IssueCommentAddInput.Type;

export const IssueHistoryInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
});
export type IssueHistoryInput = typeof IssueHistoryInput.Type;

export const IssueRecordsListInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
  recordType: Schema.optional(Schema.String),
});
export type IssueRecordsListInput = typeof IssueRecordsListInput.Type;

export const IssueRecordAddInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  payload: Schema.Unknown,
  recordType: Schema.String,
  userVisible: Schema.optional(Schema.Boolean),
});
export type IssueRecordAddInput = typeof IssueRecordAddInput.Type;

export const IssueRelationAddInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  relatedIssueId: Schema.String,
  type: IssueRelationType,
});
export type IssueRelationAddInput = typeof IssueRelationAddInput.Type;

export const IssueRelationRemoveInput = IssueRelationAddInput;
export type IssueRelationRemoveInput = typeof IssueRelationRemoveInput.Type;

export const LabelListInput = Schema.Struct({
  ...RepositoryFields,
  archived: Schema.optional(Schema.Boolean),
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(PageLimit),
  text: Schema.optional(Schema.String),
});
export type LabelListInput = typeof LabelListInput.Type;

export const UserListInput = Schema.Struct({
  ...RepositoryFields,
  cursor: Schema.optional(Schema.String),
  disabled: Schema.optional(Schema.Boolean),
  limit: Schema.optional(PageLimit),
  text: Schema.optional(Schema.String),
});
export type UserListInput = typeof UserListInput.Type;

export const TemplateListInput = Schema.Struct({
  ...RepositoryFields,
  active: Schema.optional(Schema.Boolean),
  cursor: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.Literals(["bug", "feature", "implementation", "initiative", "qa"])),
  limit: Schema.optional(PageLimit),
  text: Schema.optional(Schema.String),
});
export type TemplateListInput = typeof TemplateListInput.Type;

export const ViewListInput = Schema.Struct({
  ...RepositoryFields,
  cursor: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.Literals(["board", "list"])),
  limit: Schema.optional(PageLimit),
  pinned: Schema.optional(Schema.Boolean),
  text: Schema.optional(Schema.String),
});
export type ViewListInput = typeof ViewListInput.Type;

export const ViewCreateInput = Schema.Struct({
  ...RepositoryFields,
  description: Schema.optional(Schema.String),
  display: Schema.optional(UnknownRecord),
  groupBy: Schema.optional(
    Schema.Literals(["assignee", "dueDate", "label", "none", "parent", "priority", "status"]),
  ),
  kind: Schema.optional(Schema.Literals(["board", "list"])),
  name: Schema.String,
  pinned: Schema.optional(Schema.Boolean),
  query: Schema.optional(UnknownRecord),
  sort: Schema.optional(UnknownRecord),
});
export type ViewCreateInput = typeof ViewCreateInput.Type;

export const AutomationEvaluateInput = Schema.Struct({
  ...RepositoryFields,
  failOnWarnings: Schema.optional(Schema.Boolean),
  issueIds: Schema.optional(Schema.Array(Schema.String)),
  query: Schema.optional(UnknownRecord),
  requireFresh: Schema.optional(Schema.Boolean),
  severityThreshold: Schema.optional(Schema.Literals(["error", "fatal", "warning"])),
});
export type AutomationEvaluateInput = typeof AutomationEvaluateInput.Type;

export const PlanApplyIssueInput = Schema.Struct({
  clientId: Schema.String,
  ...IssueCreateFields,
});
export type PlanApplyIssueInput = typeof PlanApplyIssueInput.Type;

export const PlanApplyRelationInput = Schema.Struct({
  fromClientId: Schema.optional(Schema.String),
  fromIssueId: Schema.optional(Schema.String),
  relatedClientId: Schema.optional(Schema.String),
  relatedIssueId: Schema.optional(Schema.String),
  type: IssueRelationType,
});
export type PlanApplyRelationInput = typeof PlanApplyRelationInput.Type;

export const PlanApplyInput = Schema.Struct({
  ...RepositoryFields,
  issues: Schema.Array(PlanApplyIssueInput),
  relations: Schema.optional(Schema.Array(PlanApplyRelationInput)),
});
export type PlanApplyInput = typeof PlanApplyInput.Type;

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
export const TicketListOrSearchCollectionEnvelope = Schema.Union([
  TicketCollectionEnvelope,
  TicketSearchCollectionEnvelope,
]);
export const RepositoryCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.RepositoryStatusOutput,
);
export const RepositoryResourceEnvelope = ApiResourceEnvelope(
  ContractSchemas.RepositoryStatusOutput,
);
export const AutocompleteResultOutput = Schema.Struct({
  id: Schema.String,
  metadata: Schema.optional(UnknownRecord),
  name: Schema.String,
  repositoryId: Schema.optional(Schema.String),
  subtitle: Schema.optional(Schema.String),
  type: Schema.Literals(["repository", "ticket"]),
  uri: Schema.String,
});
export const AutocompleteEnvelope = ApiResourceEnvelope(
  Schema.Struct({
    results: Schema.Array(AutocompleteResultOutput),
  }),
);
export const InboxPageEnvelope = ApiResourceEnvelope(ContractSchemas.InboxPageOutput);
export const InboxMutationEnvelope = ApiResourceEnvelope(ContractSchemas.InboxMutationResultOutput);
export const CommentCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.LinkedRecordOutput);
export const CommentResourceEnvelope = ApiResourceEnvelope(ContractSchemas.LinkedRecordOutput);
export const RecordCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.LinkedRecordOutput);
export const RecordResourceEnvelope = ApiResourceEnvelope(ContractSchemas.LinkedRecordOutput);
export const HistoryCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.HistoryCommitOutput);
export const LabelCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.LabelDefinitionDocumentOutput,
);
export const UserCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.UserProfileDocumentOutput,
);
export const TemplateCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.IssueTemplateDocumentOutput,
);
export const ViewCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.SavedViewDocumentOutput,
);
export const ViewResourceEnvelope = ApiResourceEnvelope(ContractSchemas.SavedViewDocumentOutput);
export const AutomationEvaluationEnvelope = ApiResourceEnvelope(
  ContractSchemas.AutomationEvaluationOutput,
);
export const PlanApplyOutput = Schema.Struct({
  issues: Schema.Array(
    Schema.Struct({
      clientId: Schema.String,
      issue: ContractSchemas.TicketDocumentOutput,
    }),
  ),
  relations: Schema.Array(
    Schema.Struct({
      fromIssueId: Schema.String,
      relatedIssueId: Schema.String,
      type: IssueRelationType,
    }),
  ),
});
export const PlanApplyEnvelope = ApiResourceEnvelope(PlanApplyOutput);

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
