import { ContractSchemas } from "@cycle/contracts";
import * as AgentTaskSchemas from "@cycle/agents/schemas";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

const JsonObject = Schema.Record(Schema.String, Schema.Json);
const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PositiveInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const PositiveIntegerFromString = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(100),
);
const ApiPort = PositiveInteger.check(Schema.isLessThanOrEqualTo(65535));
const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const strictSchema = <S extends Schema.Top>(schema: S): S =>
  schema.annotate({ parseOptions: StrictDecodeOptions }) as S;

const OptionalStringParam = (description: string) =>
  Schema.optional(Schema.String).annotate({ description });

const RequiredStringParam = (description: string) => Schema.String.annotate({ description });

const OptionalBooleanStringParam = (description: string) =>
  Schema.optional(Schema.Literals(["false", "true"])).annotate({ description });

const OptionalPageCursorParam = (description: string) =>
  Schema.optional(Schema.String).annotate({ description });

const OptionalPageLimitParam = (description: string) =>
  Schema.optional(PositiveIntegerFromString).annotate({ description });

const OptionalCsvStringParam = (description: string) =>
  Schema.optional(Schema.String).annotate({ description });

const OptionalSearchParam = OptionalStringParam(
  "Free-text search string applied by the endpoint to its primary display fields.",
);

const GenericPageCursorParam = OptionalPageCursorParam(
  "Opaque pagination cursor returned by the previous collection response.",
);

const GenericPageLimitParam = OptionalPageLimitParam(
  "Maximum number of collection entries to return. Defaults to 50 and must be between 1 and 100.",
);

const CollectionPaginationQueryParams = {
  "page[cursor]": GenericPageCursorParam,
  "page[limit]": GenericPageLimitParam,
};

const ResourceMeta = Schema.Struct({
  requestId: Schema.String.annotate({
    description: "Request identifier returned in the x-request-id response header.",
  }),
});

const CollectionMeta = Schema.Struct({
  requestId: Schema.String.annotate({
    description: "Request identifier returned in the x-request-id response header.",
  }),
  totalCount: Schema.NullOr(NonNegativeInteger).annotate({
    description: "Total matching entry count when it is inexpensive to compute; otherwise null.",
  }),
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
export const ApiNotImplementedErrorEnvelope = ApiErrorEnvelope.pipe(
  HttpApiSchema.status("NotImplemented"),
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
  ApiNotImplementedErrorEnvelope,
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
    data: Schema.Array(entry).annotate({
      description: "Collection entries for the current page.",
    }),
    links: Schema.Struct({
      next: Schema.NullOr(Schema.String).annotate({
        description: "Relative URL for the next page, or null when no next page is available.",
      }),
      self: Schema.String.annotate({
        description: "Relative URL for the current request.",
      }),
    }),
    meta: CollectionMeta,
    page: Schema.Struct({
      hasMore: Schema.Boolean.annotate({
        description: "Whether another page is available.",
      }),
      limit: PositiveInteger.check(Schema.isLessThanOrEqualTo(100)).annotate({
        description: "Maximum number of entries requested for this page.",
      }),
      nextCursor: Schema.NullOr(Schema.String).annotate({
        description: "Opaque cursor to pass as page[cursor] for the next page.",
      }),
    }),
  });

export const CollectionEnvelopeWithMetaOf = <A extends Schema.Top, F extends Schema.Struct.Fields>(
  entry: A,
  metaFields: F,
) =>
  Schema.Struct({
    data: Schema.Array(entry).annotate({
      description: "Collection entries for the current page.",
    }),
    links: Schema.Struct({
      next: Schema.NullOr(Schema.String).annotate({
        description: "Relative URL for the next page, or null when no next page is available.",
      }),
      self: Schema.String.annotate({
        description: "Relative URL for the current request.",
      }),
    }),
    meta: Schema.Struct({
      requestId: Schema.String.annotate({
        description: "Request identifier returned in the x-request-id response header.",
      }),
      totalCount: Schema.NullOr(NonNegativeInteger).annotate({
        description:
          "Total matching entry count when it is inexpensive to compute; otherwise null.",
      }),
      ...metaFields,
    }),
    page: Schema.Struct({
      hasMore: Schema.Boolean.annotate({
        description: "Whether another page is available.",
      }),
      limit: PositiveInteger.check(Schema.isLessThanOrEqualTo(100)).annotate({
        description: "Maximum number of entries requested for this page.",
      }),
      nextCursor: Schema.NullOr(Schema.String).annotate({
        description: "Opaque cursor to pass as page[cursor] for the next page.",
      }),
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
  ContractSchemas.RepositoryStatus,
);
export const RepositoryStatusCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.RepositoryStatus,
);
export const RepositoryStatusCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.RepositoryStatus,
);
export const RepositoryStatusAcceptedEnvelope = AcceptedResourceEnvelopeOf(
  ContractSchemas.RepositoryStatus,
);
export const RepositoryHistoryCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.HistoryCommit,
);
export const RepositoryWarningCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.MaterializationWarning,
);
export const RepositoryPushAcceptedEnvelope = AcceptedResourceEnvelopeOf(
  ContractSchemas.SyncResult,
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
  "filter[type][in]": OptionalCsvStringParam(
    "Comma-separated autocomplete entity types to include. Supported values are repository and ticket.",
  ),
  "page[limit]": Schema.optional(AutocompleteLimit).annotate({
    description: "Maximum number of autocomplete results to return. Defaults to 50.",
  }),
  q: OptionalSearchParam,
});
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
export const AgentCapabilitiesOutput = ContractSchemas.AgentCapabilities;
export const AgentProviderProfileOutput = ContractSchemas.AgentProviderProfile;
export const AgentProvidersOutput = Schema.Struct({
  providers: Schema.Array(AgentProviderProfileOutput),
});
export const AgentProvidersResourceEnvelope = ResourceEnvelopeOf(AgentProvidersOutput);

export const AgentTaskOutput = AgentTaskSchemas.AgentTask;
export const AgentTaskEventOutput = AgentTaskSchemas.AgentTaskEvent;
export const AgentTaskCreatePayload = AgentTaskSchemas.AgentTaskRequest;
export const AgentTaskCancelPayload = AgentTaskSchemas.CancelAgentTaskInput;
export const AgentTaskRetryPayload = AgentTaskSchemas.RetryAgentTaskInput;
export const AgentTaskInputPayload = AgentTaskSchemas.AgentTaskInput;
export const TicketAgentTaskCreatePayload = strictSchema(
  Schema.Struct({
    agentId: Schema.optional(Schema.String),
    authority: Schema.optional(AgentTaskSchemas.AgentTaskAuthority),
    idempotencyKey: Schema.optional(Schema.String),
    input: Schema.optional(Schema.Union([Schema.String, AgentTaskSchemas.AgentTaskJsonObject])),
    instructions: Schema.optional(Schema.String),
    maxAttempts: Schema.optional(PositiveInteger),
    metadata: Schema.optional(AgentTaskSchemas.AgentTaskJsonObject),
    model: Schema.optional(Schema.String),
    providerId: Schema.optional(Schema.String),
    requestedBy: Schema.optional(Schema.String),
    responseFormat: Schema.optional(AgentTaskSchemas.AgentTaskResponseFormat),
    tools: Schema.optional(Schema.Array(AgentTaskSchemas.AgentTaskToolRequest)),
    trigger: Schema.optional(Schema.String),
    workspace: Schema.optional(AgentTaskSchemas.AgentTaskWorkspace),
  }),
);
export const AgentTaskResourceEnvelope = ResourceEnvelopeOf(AgentTaskOutput);
export const AgentTaskAcceptedEnvelope = AcceptedResourceEnvelopeOf(AgentTaskOutput);
export const AgentTaskCollectionEnvelope = CollectionEnvelopeOf(AgentTaskOutput);
export const AgentTaskEventCollectionEnvelope = CollectionEnvelopeOf(AgentTaskEventOutput);
export const AgentTaskParams = { taskId: Schema.String };
export const AgentTaskIssueParams = {
  issueId: Schema.String,
  repositoryId: Schema.String,
};
export const AgentTaskListQueryParams = {
  "filter[originKind]": OptionalStringParam("Agent task origin kind to match."),
  "filter[repositoryId]": OptionalStringParam("Repository id associated with the task origin."),
  "filter[status]": Schema.optional(AgentTaskSchemas.AgentTaskStatus).annotate({
    description: "Agent task status to match.",
  }),
  "filter[ticketId]": OptionalStringParam("Ticket id associated with the task origin."),
  "page[cursor]": OptionalPageCursorParam(
    "Opaque cursor returned by the previous agent task collection response.",
  ),
  "page[limit]": OptionalPageLimitParam(
    "Maximum number of agent tasks to return. Defaults to 100 and must be between 1 and 100.",
  ),
};
export const AgentTaskEventQueryParams = {
  "page[cursor]": OptionalPageCursorParam(
    "Event sequence cursor returned by the previous event collection response.",
  ),
  "page[limit]": OptionalPageLimitParam(
    "Maximum number of agent task events to return. Defaults to 100 and must be between 1 and 100.",
  ),
};

export const ThemePreference = Schema.Literals(["light", "dark", "system"]);
export type ThemePreference = typeof ThemePreference.Type;
export const InterfaceDensity = Schema.Literals(["compact", "spacious"]);
export type InterfaceDensity = typeof InterfaceDensity.Type;

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
export const InterfaceDensityPayload = strictSchema(
  Schema.Struct({
    density: InterfaceDensity,
  }),
);

export const OnboardingConfigOutput = Schema.Struct({
  completed: Schema.Boolean,
  completedAt: Schema.optional(Schema.String),
});
export const AgentProviderPreferenceOutput = Schema.Struct({
  config: Schema.optional(JsonObject),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.Boolean,
  executablePath: Schema.optional(Schema.NullOr(Schema.String)),
  id: AgentProviderId,
  maxConcurrentRuns: Schema.NullOr(PositiveInteger),
});
export const AgentProvidersConfigOutput = Schema.Struct({
  preferences: Schema.Array(AgentProviderPreferenceOutput),
});
export const AgentProviderPreferencePatch = Schema.Struct({
  config: Schema.optional(JsonObject),
  defaultModel: Schema.optional(Schema.NullOr(Schema.String)),
  enabled: Schema.optional(Schema.Boolean),
  executablePath: Schema.optional(Schema.NullOr(Schema.String)),
  maxConcurrentRuns: Schema.optional(Schema.NullOr(PositiveInteger)),
});
export const AgentProviderPreferencePayload = strictSchema(
  Schema.Struct({
    preference: AgentProviderPreferencePatch,
  }),
);
export const ThemeConfigOutput = Schema.Struct({
  density: InterfaceDensity,
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
  schemaVersion: Schema.Literal(4),
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
  "filter[id]": OptionalStringParam("Repository id to match exactly."),
  "filter[path]": OptionalStringParam(
    "Repository worktree or Git directory path to match exactly.",
  ),
  "filter[status]": OptionalStringParam("Repository materialization status to match."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
});

export const RepositoryWarningQuery = Schema.Struct(CollectionPaginationQueryParams);

export const RepositoryHistoryQuery = Schema.Struct({
  "filter[ticketId]": OptionalStringParam("Ticket id used to narrow history to relevant commits."),
  ...CollectionPaginationQueryParams,
});

export const InboxPageResourceEnvelope = CollectionEnvelopeWithMetaOf(ContractSchemas.InboxEntry, {
  activeSnapshotIds: Schema.Record(Schema.String, Schema.NullOr(Schema.String)).annotate({
    description: "Active snapshot id by repository id at query time.",
  }),
});
export const InboxSummaryResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.InboxSummary);
export const InboxMutationResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.InboxMutationResult,
);
export const InboxMutationPayload = strictSchema(ContractSchemas.InboxMutationInput);
export const InboxQueryParams = {
  "filter[createdAfter]": OptionalStringParam(
    "Only include inbox items created after this ISO timestamp.",
  ),
  "filter[createdBefore]": OptionalStringParam(
    "Only include inbox items created before this ISO timestamp.",
  ),
  "filter[includeSourceInactive]": OptionalBooleanStringParam(
    "Whether to include items whose source ticket or record is inactive.",
  ),
  "filter[reason]": OptionalStringParam("Inbox reason to match."),
  "filter[repository][in]": OptionalCsvStringParam("Comma-separated repository id allow-list."),
  "filter[status]": OptionalStringParam(
    "Inbox status to match. Use all to disable status filtering.",
  ),
  "filter[ticketId]": OptionalStringParam("Ticket id to match."),
  "filter[userId]": RequiredStringParam("User id whose inbox should be queried."),
  ...CollectionPaginationQueryParams,
};

export const TicketDocumentResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.TicketDocument);

export const DraftDocumentResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.TicketDraftDocument,
);
export const DraftDocumentCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.TicketDraftDocument,
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
  ContractSchemas.LabelDefinitionDocument,
);
export const HttpLabelResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.LabelDefinitionDocument,
);
export const LabelPayload = strictSchema(ContractSchemas.UpsertLabelInput);
export const LabelQueryParams = {
  "filter[archived]": OptionalBooleanStringParam("Archived-state filter for labels."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
};

export const HttpUserCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.UserProfileDocument);
export const HttpUserResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.UserProfileDocument);
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
  "filter[disabled]": OptionalBooleanStringParam("Disabled-state filter for user profiles."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
};

export const HttpViewCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.SavedViewDocument);
export const HttpViewResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.SavedViewDocument);
export const ViewCreatedEnvelope = CreatedResourceEnvelopeOf(ContractSchemas.SavedViewDocument);
export const ViewCreatePayload = strictSchema(ContractSchemas.CreateSavedViewInput);
export const ViewUpdatePayload = strictSchema(ContractSchemas.UpdateSavedViewInput);
export const ViewQueryParams = {
  "filter[kind]": OptionalStringParam("Saved-view kind to match."),
  "filter[pinned]": OptionalBooleanStringParam("Pinned-state filter for saved views."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
};

export const HttpTemplateCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.IssueTemplateDocument,
);
export const HttpTemplateResourceEnvelope = ResourceEnvelopeOf(
  ContractSchemas.IssueTemplateDocument,
);
export const TemplateCreatedEnvelope = CreatedResourceEnvelopeOf(
  ContractSchemas.IssueTemplateDocument,
);
export const TemplateCreatePayload = strictSchema(ContractSchemas.CreateIssueTemplateInput);
export const TemplateUpdatePayload = strictSchema(ContractSchemas.UpdateIssueTemplateInput);
export const TemplateQueryParams = {
  "filter[active]": OptionalBooleanStringParam("Active-state filter for issue templates."),
  "filter[kind]": OptionalStringParam("Issue-template kind to match."),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
};

export const HttpTicketResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.TicketDocument);
export const HttpTicketCreatedEnvelope = CreatedResourceEnvelopeOf(ContractSchemas.TicketDocument);
export const HttpTicketCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.TicketDocument);
export const HttpTicketSearchCollectionEnvelope = CollectionEnvelopeOf(
  ContractSchemas.TicketSearchResult,
);
export const HttpTicketRevisionDiffEnvelope = ResourceEnvelopeOf(
  ContractSchemas.TicketRevisionDiff,
);
export const HttpHistoryCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.HistoryCommit);
export const HttpRecordCollectionEnvelope = CollectionEnvelopeOf(ContractSchemas.LinkedRecord);
export const HttpRecordResourceEnvelope = ResourceEnvelopeOf(ContractSchemas.LinkedRecord);
export const HttpRecordCreatedEnvelope = CreatedResourceEnvelopeOf(ContractSchemas.LinkedRecord);

export const IssueListQueryParams = {
  "filter[archived]": OptionalBooleanStringParam("Archived-state filter for issues."),
  "filter[assignee]": OptionalStringParam(
    "Assignee id to match. Use the literal null to match unassigned issues.",
  ),
  "filter[assignee][in]": OptionalCsvStringParam("Comma-separated assignee id allow-list."),
  "filter[blocked]": OptionalBooleanStringParam("Whether to match issues with blocking relations."),
  "filter[deleted]": OptionalBooleanStringParam("Soft-deleted-state filter for issues."),
  "filter[dueAfter]": OptionalStringParam(
    "Only include issues due after this ISO date or timestamp.",
  ),
  "filter[dueBefore]": OptionalStringParam(
    "Only include issues due before this ISO date or timestamp.",
  ),
  "filter[estimate]": OptionalStringParam("Estimate value to match."),
  "filter[hasAssignee]": OptionalBooleanStringParam(
    "Whether to filter by presence of an assignee.",
  ),
  "filter[hasDueDate]": OptionalBooleanStringParam("Whether to filter by presence of a due date."),
  "filter[hasEstimate]": OptionalBooleanStringParam(
    "Whether to filter by presence of an estimate.",
  ),
  "filter[hasLabels]": OptionalBooleanStringParam("Whether to filter by presence of labels."),
  "filter[label]": OptionalStringParam("Single label id or name to match."),
  "filter[label][in]": OptionalCsvStringParam("Comma-separated label id or name allow-list."),
  "filter[parent]": OptionalStringParam(
    "Parent issue id to match. Use the literal null to match issues without a parent.",
  ),
  "filter[priority]": OptionalStringParam("Priority value to match."),
  "filter[priority][in]": OptionalCsvStringParam("Comma-separated priority value allow-list."),
  "filter[repository][in]": OptionalCsvStringParam(
    "Comma-separated repository id allow-list for multi-repository issue queries.",
  ),
  "filter[staleBefore]": OptionalStringParam(
    "Only include issues stale before this ISO timestamp.",
  ),
  "filter[status]": OptionalStringParam("Workflow status value to match."),
  "filter[status][in]": OptionalCsvStringParam("Comma-separated workflow status allow-list."),
  "filter[type]": OptionalStringParam("Ticket type value to match."),
  "filter[updatedAfter]": OptionalStringParam(
    "Only include issues updated after this ISO timestamp.",
  ),
  "filter[updatedBefore]": OptionalStringParam(
    "Only include issues updated before this ISO timestamp.",
  ),
  ...CollectionPaginationQueryParams,
  q: OptionalSearchParam,
  "sort[direction]": Schema.optional(Schema.Literals(["asc", "desc"])).annotate({
    description: "Sort direction.",
  }),
  "sort[field]": Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ).annotate({ description: "Issue field used for sorting." }),
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
  ...CollectionPaginationQueryParams,
};
export const IssueDiffQueryParams = {
  fromSnapshotId: RequiredStringParam("Older snapshot id."),
  toSnapshotId: RequiredStringParam("Newer snapshot id."),
};
export const RecordListQueryParams = {
  "filter[recordType]": OptionalStringParam("Linked record type to match."),
  ...CollectionPaginationQueryParams,
};
export const IssueCommentListQueryParams = {
  ...CollectionPaginationQueryParams,
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
  ContractSchemas.InitiativeProgress,
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
  ContractSchemas.AutomationEvaluation,
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
