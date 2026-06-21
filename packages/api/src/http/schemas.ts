import { ContractSchemas } from "@cycle/contracts";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const JsonObject = Schema.Record(Schema.String, Schema.Json);
const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const PositiveIntegerFromString = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
);
const ApiPort = PositiveInteger.check(Schema.isLessThanOrEqualTo(65535));
const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const strictSchema = <S extends Schema.Top>(schema: S): S =>
  schema.annotate({ parseOptions: StrictDecodeOptions }) as S;

const ResourceMeta = Schema.Struct({
  requestId: Schema.String,
});

const CollectionMeta = Schema.Struct({
  requestId: Schema.String,
  totalCount: Schema.NullOr(NonNegativeInteger),
});

export const ApiErrorEnvelope = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    // Error details preserve redacted adapter/usecase diagnostics as extension data.
    details: Schema.Record(Schema.String, Schema.Unknown),
    message: Schema.String,
    requestId: Schema.String,
    retryable: Schema.Boolean,
  }),
});
export type ApiErrorEnvelope = typeof ApiErrorEnvelope.Type;

export const ApiBadRequestErrorEnvelope = ApiErrorEnvelope.pipe(HttpApiSchema.status("BadRequest"));
export const ApiUnauthorizedErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("Unauthorized"),
);
export const ApiForbiddenErrorEnvelope = ApiErrorEnvelope.pipe(HttpApiSchema.status("Forbidden"));
export const ApiNotFoundErrorEnvelope = ApiErrorEnvelope.pipe(HttpApiSchema.status("NotFound"));
export const ApiConflictErrorEnvelope = ApiErrorEnvelope.pipe(HttpApiSchema.status("Conflict"));
export const ApiUnprocessableEntityErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("UnprocessableEntity"),
);
export const ApiInternalServerErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("InternalServerError"),
);
export const ApiServiceUnavailableErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("ServiceUnavailable"),
);
export const ApiGatewayTimeoutErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("GatewayTimeout"),
);
export const ApiErrorEnvelopes = [
  ApiBadRequestErrorEnvelope,
  ApiUnauthorizedErrorEnvelope,
  ApiForbiddenErrorEnvelope,
  ApiNotFoundErrorEnvelope,
  ApiConflictErrorEnvelope,
  ApiUnprocessableEntityErrorEnvelope,
  ApiInternalServerErrorEnvelope,
  ApiServiceUnavailableErrorEnvelope,
  ApiGatewayTimeoutErrorEnvelope,
] as const;

export const ResourceEnvelopeOf = <A extends Schema.Top>(data: A) =>
  Schema.Struct({
    data,
    meta: ResourceMeta,
  });

export const CreatedResourceEnvelopeOf = <A extends Schema.Top>(data: A) =>
  ResourceEnvelopeOf(data).pipe(HttpApiSchema.status("Created"));

export const AcceptedResourceEnvelopeOf = <A extends Schema.Top>(data: A) =>
  ResourceEnvelopeOf(data).pipe(HttpApiSchema.status("Accepted"));

export const CollectionEnvelopeOf = <A extends Schema.Top>(entry: A) =>
  Schema.Struct({
    data: Schema.Array(entry),
    links: Schema.Struct({
      next: Schema.NullOr(Schema.String),
      self: Schema.String,
    }),
    meta: CollectionMeta,
    page: Schema.Struct({
      hasMore: Schema.Boolean,
      limit: PositiveInteger,
      nextCursor: Schema.NullOr(Schema.String),
    }),
  });

export const HealthOutput = Schema.Struct({
  apiVersion: Schema.String,
  startedAt: Schema.String,
  status: Schema.Literal("ok"),
});
export const HealthResourceEnvelope = ResourceEnvelopeOf(HealthOutput);
export const ApiStatusOutput = Schema.Struct({
  apiVersion: Schema.String,
  repositoriesMounted: NonNegativeInteger,
  runtime: Schema.Literal("local"),
  startedAt: Schema.String,
  status: Schema.Literal("ok"),
});

export const ApiStatusResourceEnvelope = ResourceEnvelopeOf(ApiStatusOutput);
export const RepositoryStatusResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.RepositoryStatusOutput,
);
export const RepositoryStatusCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.RepositoryStatusOutput,
);
export const RepositoryStatusCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.RepositoryStatusOutput,
);
export const RepositoryStatusAcceptedEnvelope = AcceptedResourceEnvelopeOf(
  ContractSchemas.RepositoryStatusOutput,
);
export const RepositoryHistoryCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.HistoryCommitOutput,
);
export const RepositoryWarningCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.MaterializationWarningOutput,
);
export const RepositoryPushAcceptedEnvelope = AcceptedResourceEnvelopeOf(
  ContractSchemas.SyncResultOutput,
);

export const AutocompleteEntityType = Schema.Literals(["repository", "ticket"]);
export type AutocompleteEntityType = typeof AutocompleteEntityType.Type;

const AutocompleteLimit = Schema.FiniteFromString.check(
  Schema.makeFilter<number>(
    (value) =>
      (Number.isInteger(value) && value > 0 && value <= 100) || "an integer between 1 and 100",
    { expected: "an autocomplete limit between 1 and 100" },
  ),
);

export const AutocompleteQuery = Schema.Struct({
  "page[limit]": Schema.optional(AutocompleteLimit),
  limit: Schema.optional(AutocompleteLimit),
  q: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  types: Schema.optional(Schema.String),
}).check(
  Schema.makeFilter<{
    readonly "page[limit]"?: number;
    readonly limit?: number;
    readonly q?: string;
    readonly type?: string;
    readonly types?: string;
  }>(
    (value) =>
      !(value.type !== undefined && value.types !== undefined) || "only one of type or types",
    { expected: "an autocomplete query" },
  ),
);
export type AutocompleteQuery = typeof AutocompleteQuery.Type;
export const AutocompleteQueryParams = AutocompleteQuery.fields;

export const HttpAutocompleteResultOutput = Schema.Struct({
  id: Schema.String,
  metadata: Schema.optional(JsonObject),
  name: Schema.String,
  repositoryId: Schema.optional(Schema.String),
  subtitle: Schema.optional(Schema.String),
  type: AutocompleteEntityType,
  uri: Schema.String,
});
export type HttpAutocompleteResultOutput = typeof HttpAutocompleteResultOutput.Type;
export const AutocompleteOutput = Schema.Struct({
  results: Schema.Array(HttpAutocompleteResultOutput),
});
export const AutocompleteResourceEnvelope = ResourceEnvelopeOf(AutocompleteOutput);

export const AgentProviderId = ContractSchemas.AgentProviderId;
export const AgentWorkJobType = ContractSchemas.AgentWorkJobType;
export const AgentCapabilitiesOutput = ContractSchemas.AgentCapabilities;
export const AgentProviderProfileOutput = ContractSchemas.AgentProviderProfile;
export const AgentProvidersOutput = Schema.Struct({
  providers: Schema.Array(AgentProviderProfileOutput),
});
export const AgentProvidersResourceEnvelope = ResourceEnvelopeOf(AgentProvidersOutput);

export const ThemePreference = Schema.Literals(["light", "dark", "system"]);
export type ThemePreference = typeof ThemePreference.Type;

export const ProfileOutput = Schema.Struct({
  displayName: Schema.String,
  email: Schema.String,
});
export const ProfileUpdatePayload = strictSchema(
  Schema.Struct({
    displayName: Schema.optional(Schema.String),
    email: Schema.optional(Schema.String),
  }),
);
export const ProfileResourceEnvelope = ResourceEnvelopeOf(ProfileOutput);

export const CompleteOnboardingPayload = strictSchema(
  Schema.Struct({
    displayName: Schema.String,
    email: Schema.String,
    enabledAgentProviderIds: Schema.optional(Schema.Array(AgentProviderId)),
    themePreference: ThemePreference,
  }),
);

export const ThemePreferencePayload = strictSchema(
  Schema.Struct({
    preference: ThemePreference,
  }),
);

export const OnboardingConfigOutput = Schema.Struct({
  completed: Schema.Boolean,
  completedAt: Schema.optional(Schema.String),
});
export const AgentProviderPreferenceOutput = Schema.Struct({
  enabled: Schema.Boolean,
  id: AgentProviderId,
});
export const AgentProvidersConfigOutput = Schema.Struct({
  preferences: Schema.Array(AgentProviderPreferenceOutput),
});
export const ThemeConfigOutput = Schema.Struct({
  preference: ThemePreference,
});
export const LocalApiConfigOutput = Schema.Struct({
  enabled: Schema.Boolean,
  host: Schema.Literals(["127.0.0.1", "localhost"]),
  port: Schema.Union([ApiPort, Schema.Literal("auto")]),
  staticToken: Schema.String,
});
export const RepositoryCommitStyle = Schema.Literals(["descriptive", "compact"]);
export const RepositoryPreferencesOutput = Schema.Struct({
  autoSync: Schema.Boolean,
  commitStyle: RepositoryCommitStyle,
  sidebarExpanded: Schema.Boolean,
});
export const RepositoryPreferencesPatch = Schema.Struct({
  autoSync: Schema.optional(Schema.Boolean),
  commitStyle: Schema.optional(RepositoryCommitStyle),
  sidebarExpanded: Schema.optional(Schema.Boolean),
});
export const RepositoryPreferencesPayload = strictSchema(
  Schema.Struct({
    preferences: RepositoryPreferencesPatch,
  }),
);
export const RepositoryRecordOutput = Schema.Struct({
  addedAt: Schema.String,
  displayName: Schema.String,
  gitDbRootCommitId: Schema.optional(Schema.String),
  id: Schema.String,
  lastOpenedAt: Schema.optional(Schema.String),
  path: Schema.String,
  preferences: RepositoryPreferencesOutput,
});
export const RepositoryRecordNullableOutput = Schema.NullOr(RepositoryRecordOutput);
export const LocalWorkspaceConfigOutput = Schema.Struct({
  repositories: Schema.Array(RepositoryRecordOutput),
});
export const AppConfigOutput = Schema.Struct({
  agentProviders: AgentProvidersConfigOutput,
  api: LocalApiConfigOutput,
  localWorkspace: LocalWorkspaceConfigOutput,
  onboarding: OnboardingConfigOutput,
  profile: ProfileOutput,
  schemaVersion: Schema.Literal(3),
  theme: ThemeConfigOutput,
});
export const AppConfigResourceEnvelope = ResourceEnvelopeOf(AppConfigOutput);
export const RepositoryRecordNullableResourceEnvelope = ResourceEnvelopeOf(
  RepositoryRecordNullableOutput,
);

export const RepositoryOpenPayload = strictSchema(
  Schema.Struct({
    displayName: Schema.optional(Schema.String),
    path: Schema.optional(Schema.String),
    repositoryId: Schema.optional(Schema.String),
    // Store is implementation-owned repository bootstrap data.
    store: Schema.optional(Schema.Unknown),
    syncOnOpen: Schema.optional(Schema.Boolean),
    worktreePath: Schema.optional(Schema.String),
  }),
);

export const RepositoryCollectionQuery = Schema.Struct({
  query: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
});

export const RepositoryHistoryQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  from: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveIntegerFromString),
  max: Schema.optional(PositiveIntegerFromString),
  ticketId: Schema.optional(Schema.String),
});

export const InboxPageResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.InboxPageOutput);
export const InboxSummaryResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.InboxSummaryOutput);
export const InboxMutationResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.InboxMutationResultOutput,
);
export const InboxMutationPayload = strictSchema(ContractSchemas.InboxMutationInput);
export const InboxQueryParams = {
  "filter[createdAfter]": Schema.optional(Schema.String),
  "filter[createdBefore]": Schema.optional(Schema.String),
  "filter[includeSourceInactive]": Schema.optional(Schema.String),
  "filter[reason]": Schema.optional(Schema.String),
  "filter[repository][in]": Schema.optional(Schema.String),
  "filter[status]": Schema.optional(Schema.String),
  "filter[ticketId]": Schema.optional(Schema.String),
  "filter[userId]": Schema.optional(Schema.String),
  "page[cursor]": Schema.optional(Schema.String),
  "page[limit]": Schema.optional(PositiveIntegerFromString),
  repositoryIds: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
};

export const TicketDocumentResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.TicketDocumentOutput,
);

export const DraftDocumentResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.TicketDraftDocumentOutput,
);
export const DraftDocumentCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.TicketDraftDocumentOutput,
);
export const DraftCreatePayload = strictSchema(ContractSchemas.CreateDraftInput);
export const DraftUpdatePayload = strictSchema(
  Schema.Struct({
    body: Schema.optional(Schema.String),
    // Draft frontmatter may contain arbitrary issue metadata owned by document producers.
    frontmatter: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    status: Schema.optional(Schema.String),
  }),
);

export const HttpLabelCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.LabelDefinitionDocumentOutput,
);
export const HttpLabelResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.LabelDefinitionDocumentOutput,
);
export const LabelPayload = strictSchema(ContractSchemas.UpsertLabelInput);
export const LabelQueryParams = {
  "filter[archived]": Schema.optional(Schema.String),
  "page[cursor]": Schema.optional(Schema.String),
  "page[limit]": Schema.optional(PositiveIntegerFromString),
  q: Schema.optional(Schema.String),
};

export const HttpUserCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.UserProfileDocumentOutput,
);
export const HttpUserResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.UserProfileDocumentOutput,
);
export const UserPayload = strictSchema(
  Schema.Struct({
    aliases: Schema.optional(Schema.Array(Schema.String)),
    avatarUrl: Schema.optional(Schema.String),
    disabledAt: Schema.optional(Schema.NullOr(Schema.String)),
    displayName: Schema.String,
    email: Schema.optional(Schema.String),
    source: Schema.optional(Schema.Literals(["import", "local-profile", "manual"])),
    timezone: Schema.optional(Schema.String),
  }),
);
export const UserQueryParams = {
  "filter[disabled]": Schema.optional(Schema.String),
  "page[cursor]": Schema.optional(Schema.String),
  "page[limit]": Schema.optional(PositiveIntegerFromString),
  q: Schema.optional(Schema.String),
};

export const HttpViewCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.SavedViewDocumentOutput,
);
export const HttpViewResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.SavedViewDocumentOutput);
export const ViewCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.SavedViewDocumentOutput,
);
export const ViewCreatePayload = strictSchema(ContractSchemas.CreateSavedViewInput);
export const ViewUpdatePayload = strictSchema(ContractSchemas.UpdateSavedViewInput);
export const ViewQueryParams = {
  "filter[kind]": Schema.optional(Schema.String),
  "filter[pinned]": Schema.optional(Schema.String),
  "page[cursor]": Schema.optional(Schema.String),
  "page[limit]": Schema.optional(PositiveIntegerFromString),
  q: Schema.optional(Schema.String),
};

export const HttpTemplateCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.IssueTemplateDocumentOutput,
);
export const HttpTemplateResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.IssueTemplateDocumentOutput,
);
export const TemplateCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.IssueTemplateDocumentOutput,
);
export const TemplateCreatePayload = strictSchema(ContractSchemas.CreateIssueTemplateInput);
export const TemplateUpdatePayload = strictSchema(ContractSchemas.UpdateIssueTemplateInput);
export const TemplateQueryParams = {
  "filter[active]": Schema.optional(Schema.String),
  "filter[kind]": Schema.optional(Schema.String),
  "page[cursor]": Schema.optional(Schema.String),
  "page[limit]": Schema.optional(PositiveIntegerFromString),
  q: Schema.optional(Schema.String),
};

export const HttpTicketResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.TicketDocumentOutput);
export const HttpTicketCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.TicketDocumentOutput,
);
export const HttpTicketCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.TicketDocumentOutput,
);
export const HttpTicketSearchCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.TicketSearchResultOutput,
);
export const HttpTicketRevisionDiffEnvelope = ResourceEnvelopeOf(
  ContractSchemas.TicketRevisionDiffOutput,
);
export const HttpHistoryCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.HistoryCommitOutput,
);
export const HttpRecordCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.LinkedRecordOutput,
);
export const HttpRecordResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.LinkedRecordOutput);
export const HttpRecordCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.LinkedRecordOutput,
);

export const IssueListQueryParams = {
  "filter[archived]": Schema.optional(Schema.String),
  "filter[assignee]": Schema.optional(Schema.String),
  "filter[assignee][in]": Schema.optional(Schema.String),
  "filter[blocked]": Schema.optional(Schema.String),
  "filter[deleted]": Schema.optional(Schema.String),
  "filter[dueAfter]": Schema.optional(Schema.String),
  "filter[dueBefore]": Schema.optional(Schema.String),
  "filter[estimate]": Schema.optional(Schema.String),
  "filter[hasAssignee]": Schema.optional(Schema.String),
  "filter[hasDueDate]": Schema.optional(Schema.String),
  "filter[hasEstimate]": Schema.optional(Schema.String),
  "filter[hasLabels]": Schema.optional(Schema.String),
  "filter[label]": Schema.optional(Schema.String),
  "filter[label][in]": Schema.optional(Schema.String),
  "filter[parent]": Schema.optional(Schema.String),
  "filter[priority]": Schema.optional(Schema.String),
  "filter[priority][in]": Schema.optional(Schema.String),
  "filter[repository][in]": Schema.optional(Schema.String),
  "filter[staleBefore]": Schema.optional(Schema.String),
  "filter[status]": Schema.optional(Schema.String),
  "filter[status][in]": Schema.optional(Schema.String),
  "filter[type]": Schema.optional(Schema.String),
  "filter[updatedAfter]": Schema.optional(Schema.String),
  "filter[updatedBefore]": Schema.optional(Schema.String),
  "page[cursor]": Schema.optional(Schema.String),
  "page[limit]": Schema.optional(PositiveIntegerFromString),
  assigneeIn: Schema.optional(Schema.String),
  labelIn: Schema.optional(Schema.String),
  orderBy: Schema.optional(Schema.String),
  priorityIn: Schema.optional(Schema.String),
  q: Schema.optional(Schema.String),
  repositoryIds: Schema.optional(Schema.String),
  "sort[direction]": Schema.optional(Schema.String),
  "sort[field]": Schema.optional(Schema.String),
  statusIn: Schema.optional(Schema.String),
};
export const IssueCreatePayload = strictSchema(ContractSchemas.CreateIssueInput);
export const IssueUpdatePayload = strictSchema(ContractSchemas.UpdateIssueInput);
export const IssueTransitionPayload = strictSchema(
  Schema.Struct({
    reason: Schema.optional(Schema.String),
    status: Schema.String,
  }),
);
export const IssueReasonPayload = strictSchema(
  Schema.Struct({
    reason: Schema.optional(Schema.String),
  }),
);
export const IssueHistoryQueryParams = {
  "page[cursor]": Schema.optional(Schema.String),
  "page[limit]": Schema.optional(PositiveIntegerFromString),
};
export const IssueDiffQueryParams = {
  from: Schema.optional(Schema.String),
  fromSnapshotId: Schema.optional(Schema.String),
  to: Schema.optional(Schema.String),
  toSnapshotId: Schema.optional(Schema.String),
};
export const RecordListQueryParams = {
  "filter[recordType]": Schema.optional(Schema.String),
  "page[cursor]": Schema.optional(Schema.String),
  "page[limit]": Schema.optional(PositiveIntegerFromString),
};
export const IssueRelationPayload = strictSchema(ContractSchemas.IssueRelation);
export const IssueRecordAddPayload = strictSchema(
  Schema.Struct({
    // Linked record payload is decoded by the record type owner.
    payload: Schema.Unknown,
    recordType: Schema.optional(Schema.String),
    userVisible: Schema.optional(Schema.Boolean),
  }),
);
export const IssueCommentAddPayload = strictSchema(
  Schema.Struct({
    body: Schema.String,
  }),
);

export const InitiativeCreatePayload = strictSchema(ContractSchemas.CreateIssueInput);
export const InitiativeProgressResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.InitiativeProgressOutput,
);
export const InitiativeCreatedEnvelope = HttpTicketCreatedEnvelope;
export const InitiativeUpdatePayload = strictSchema(ContractSchemas.InitiativeUpdateInput);
export const InitiativeUpdateCreatedEnvelope = HttpRecordCreatedEnvelope;

const AutomationEvaluatePayloadBase = Schema.Struct({
  failOnWarnings: Schema.optional(Schema.Boolean),
  issueIds: Schema.optional(Schema.Array(Schema.String)),
  query: Schema.optional(ContractSchemas.IssueQuery),
  requireFresh: Schema.optional(Schema.Boolean),
  severityThreshold: Schema.optional(Schema.Literals(["warning", "error", "fatal"])),
});

export const AutomationEvaluatePayload = strictSchema(
  AutomationEvaluatePayloadBase.check(
    Schema.makeFilter<typeof AutomationEvaluatePayloadBase.Type>(
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
  ),
);
export type AutomationEvaluatePayload = typeof AutomationEvaluatePayload.Type;
export const AutomationEvaluationResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.AutomationEvaluationOutput,
);

export const ChatMessagePayload = strictSchema(
  Schema.Struct({
    content: Schema.String,
    createdAt: Schema.optional(Schema.String),
    id: Schema.optional(Schema.String),
    role: Schema.Literals(["agent", "assistant", "system", "user"]),
  }),
);

export const ChatRepositoryPayload = strictSchema(
  Schema.Struct({
    displayName: Schema.optional(Schema.String),
    id: Schema.String,
    path: Schema.optional(Schema.String),
  }),
);

export const ChatStreamOptionsPayload = strictSchema(
  Schema.Struct({
    heartbeatMs: Schema.optional(PositiveInteger),
    includeArtifacts: Schema.optional(Schema.Boolean),
    includeProgress: Schema.optional(Schema.Boolean),
  }),
);

export const ChatTurnPayload = strictSchema(
  Schema.Struct({
    instructions: Schema.optional(Schema.String),
    message: Schema.String,
    messages: Schema.optional(Schema.Array(ChatMessagePayload)),
    model: Schema.optional(Schema.String),
    provider: Schema.optional(AgentProviderId),
    repositories: Schema.optional(Schema.Array(ChatRepositoryPayload)),
    sessionId: Schema.optional(Schema.String),
    stream: Schema.optional(ChatStreamOptionsPayload),
    threadId: Schema.optional(Schema.String),
  }),
);

export const ChatThreadParams = { threadId: Schema.String };
export const ChatMessageParams = { messageId: Schema.String, threadId: Schema.String };
export const RepositoryParams = { repositoryId: Schema.String };
export const IssueParams = { repositoryId: Schema.String, issueId: Schema.String };
export const IssueRevisionParams = {
  issueId: Schema.String,
  repositoryId: Schema.String,
  snapshotId: Schema.String,
};
export const IssueCommentParams = {
  commentId: Schema.String,
  issueId: Schema.String,
  repositoryId: Schema.String,
};
export const DraftParams = { draftId: Schema.String, repositoryId: Schema.String };
export const LabelParams = { labelId: Schema.String, repositoryId: Schema.String };
export const UserParams = { repositoryId: Schema.String, userId: Schema.String };
export const ViewParams = { repositoryId: Schema.String, viewId: Schema.String };
export const TemplateParams = { repositoryId: Schema.String, templateId: Schema.String };
export const InitiativeParams = { initiativeId: Schema.String, repositoryId: Schema.String };
