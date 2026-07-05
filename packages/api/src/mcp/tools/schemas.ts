import * as ContractSchemas from "@cycle/contracts/schemas";
import { Schema } from "effect";
import { AutocompleteOutput } from "../../http/schemas/AutocompleteResourceEnvelope.ts";
import { CollectionEnvelopeOf, ResourceEnvelopeOf } from "../../http/schemas/shared.ts";

const RequestId = {
  requestId: Schema.optional(Schema.String),
};

const RepositoryFields = {
  repositoryId: Schema.String,
  ...RequestId,
};

const IssueContextFields = {
  ...RepositoryFields,
  issueId: Schema.String,
};

const TargetIssueFields = {
  targetIssueId: Schema.optional(Schema.String),
};

const EstimateInput = Schema.Union([Schema.Finite, Schema.String]);
const NullableEstimateInput = Schema.NullOr(EstimateInput);
const PageLimit = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const HttpStatusCode = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(100),
  Schema.isLessThanOrEqualTo(599),
);
const IssueRelationType = ContractSchemas.IssueRelation.fields.type;
const IssueQueryInput = Schema.Struct({
  ...ContractSchemas.IssueQuery.fields,
  estimate: Schema.optional(EstimateInput),
});
const IssueListQueryFields = (({ from: _from, relation: _relation, ...fields }) => fields)(
  IssueQueryInput.fields,
);
const IssueCreateFields = {
  ...ContractSchemas.CreateIssueInput.fields,
  estimate: Schema.optional(NullableEstimateInput),
};

export const IssueListQueryInput = Schema.Struct({
  ...IssueListQueryFields,
  limit: Schema.optional(PageLimit),
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
  ...ContractSchemas.InboxQuery.fields,
  limit: Schema.optional(PageLimit),
  ...RequestId,
});
export type InboxListInput = typeof InboxListInput.Type;

export const InboxMutationInput = Schema.Struct({
  ...ContractSchemas.InboxMutationInput.fields,
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
  ...ContractSchemas.SearchTicketsInput.fields,
  limit: Schema.optional(PageLimit),
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
  ...ContractSchemas.UpdateIssueInput.fields,
});
export type IssueUpdateInput = typeof IssueUpdateInput.Type;

export const IssueTransitionInput = Schema.Struct({
  ...IssueContextFields,
  ...TargetIssueFields,
  reason: ContractSchemas.TransitionIssueInput.fields.reason,
  status: ContractSchemas.TransitionIssueInput.fields.status,
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
  payload: ContractSchemas.AddLinkedRecordInput.fields.payload,
  recordType: ContractSchemas.AddLinkedRecordInput.fields.recordType,
  userVisible: ContractSchemas.AddLinkedRecordInput.fields.userVisible,
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
  ...ContractSchemas.LabelDefinitionQuery.fields,
  limit: Schema.optional(PageLimit),
});
export type LabelListInput = typeof LabelListInput.Type;

export const UserListInput = Schema.Struct({
  ...RepositoryFields,
  ...ContractSchemas.UserProfileQuery.fields,
  limit: Schema.optional(PageLimit),
});
export type UserListInput = typeof UserListInput.Type;

export const TemplateListInput = Schema.Struct({
  ...RepositoryFields,
  ...ContractSchemas.IssueTemplateQuery.fields,
  limit: Schema.optional(PageLimit),
});
export type TemplateListInput = typeof TemplateListInput.Type;

export const ViewListInput = Schema.Struct({
  ...RepositoryFields,
  ...ContractSchemas.SavedViewQuery.fields,
  limit: Schema.optional(PageLimit),
});
export type ViewListInput = typeof ViewListInput.Type;

export const ViewCreateInput = Schema.Struct({
  ...RepositoryFields,
  ...ContractSchemas.CreateSavedViewInput.fields,
  query: Schema.optional(IssueQueryInput),
});
export type ViewCreateInput = typeof ViewCreateInput.Type;

const AutomationEvaluateInputBase = Schema.Struct({
  ...RepositoryFields,
  failOnWarnings: Schema.optional(Schema.Boolean),
  issueIds: Schema.optional(Schema.Array(Schema.String)),
  query: Schema.optional(IssueQueryInput),
  requireFresh: Schema.optional(Schema.Boolean),
  severityThreshold: ContractSchemas.AutomationEvaluateIssuesInput.fields.severityThreshold,
});
export const AutomationEvaluateInput = AutomationEvaluateInputBase.check(
  Schema.makeFilter<typeof AutomationEvaluateInputBase.Type>(
    (value) => {
      const issueMode = value.issueIds !== undefined;
      const queryMode = value.query !== undefined;
      const repositoryOnlyOptions =
        value.failOnWarnings !== undefined || value.requireFresh !== undefined;

      if (issueMode && value.issueIds.length === 0) return "at least one issue id";
      if (Number(issueMode) + Number(queryMode) > 1) return "a single automation evaluation mode";
      if ((issueMode || queryMode) && repositoryOnlyOptions) {
        return "repository-only options cannot be combined with issue or query evaluation";
      }

      return true;
    },
    { expected: "an automation evaluation request" },
  ),
);
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

export const ApiResourceEnvelope = ResourceEnvelopeOf;
export const ApiCollectionEnvelope = CollectionEnvelopeOf;

export const TicketResourceEnvelope = ApiResourceEnvelope(ContractSchemas.TicketDocument);
export const TicketCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.TicketDocument);
export const TicketSearchCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.TicketSearchResult,
);
export const TicketListOrSearchCollectionEnvelope = Schema.Union([
  TicketCollectionEnvelope,
  TicketSearchCollectionEnvelope,
]);
export const RepositoryCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.RepositoryStatus);
export const RepositoryResourceEnvelope = ApiResourceEnvelope(ContractSchemas.RepositoryStatus);
export const AutocompleteEnvelope = ApiResourceEnvelope(AutocompleteOutput);
export const InboxPageEnvelope = ApiResourceEnvelope(ContractSchemas.InboxPage);
export const InboxMutationEnvelope = ApiResourceEnvelope(ContractSchemas.InboxMutationResult);
export const CommentCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.LinkedRecord);
export const CommentResourceEnvelope = ApiResourceEnvelope(ContractSchemas.LinkedRecord);
export const RecordCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.LinkedRecord);
export const RecordResourceEnvelope = ApiResourceEnvelope(ContractSchemas.LinkedRecord);
export const HistoryCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.HistoryCommit);
export const LabelCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.LabelDefinitionDocument,
);
export const UserCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.UserProfileDocument);
export const TemplateCollectionEnvelope = ApiCollectionEnvelope(
  ContractSchemas.IssueTemplateDocument,
);
export const ViewCollectionEnvelope = ApiCollectionEnvelope(ContractSchemas.SavedViewDocument);
export const ViewResourceEnvelope = ApiResourceEnvelope(ContractSchemas.SavedViewDocument);
export const AutomationEvaluationEnvelope = ApiResourceEnvelope(
  ContractSchemas.AutomationEvaluation,
);
export const PlanApplyOutput = Schema.Struct({
  issues: Schema.Array(
    Schema.Struct({
      clientId: Schema.String,
      issue: ContractSchemas.TicketDocument,
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
    status: Schema.optional(HttpStatusCode),
  }),
  meta: Schema.Struct({
    issueId: Schema.optional(Schema.String),
    repositoryId: Schema.optional(Schema.String),
  }),
});
export type ToolErrorOutput = typeof ToolErrorOutput.Type;
