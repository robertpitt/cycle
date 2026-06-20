import { Effect, Result, Schema } from "effect";
import * as McpSchema from "effect/unstable/ai/McpSchema";
import * as AiTool from "effect/unstable/ai/Tool";
import { type CycleApiEnvelope, type CycleMcpApiClientShape, cycleMcpApiError } from "../client.ts";
import {
  AutocompleteEnvelope,
  AutocompleteInput,
  AutomationEvaluateInput,
  AutomationEvaluationEnvelope,
  CommentCollectionEnvelope,
  CommentResourceEnvelope,
  HistoryCollectionEnvelope,
  InboxListInput,
  InboxMutationEnvelope,
  InboxMutationInput,
  InboxPageEnvelope,
  IssueCommentAddInput,
  IssueCommentsListInput,
  IssueCreateInput,
  IssueGetInput,
  IssueHistoryInput,
  IssueListInput,
  IssueRecordAddInput,
  IssueRecordsListInput,
  IssueRelationAddInput,
  IssueRelationRemoveInput,
  IssueSearchInput,
  IssueTransitionInput,
  IssueUpdateInput,
  LabelCollectionEnvelope,
  LabelListInput,
  PlanApplyEnvelope,
  PlanApplyInput,
  RecordCollectionEnvelope,
  RecordResourceEnvelope,
  RepositoryCollectionEnvelope,
  RepositoryGetInput,
  RepositoryListInput,
  RepositoryResourceEnvelope,
  TemplateCollectionEnvelope,
  TemplateListInput,
  TicketListOrSearchCollectionEnvelope,
  TicketResourceEnvelope,
  TicketSearchCollectionEnvelope,
  ToolErrorOutput,
  UserCollectionEnvelope,
  UserListInput,
  ViewCollectionEnvelope,
  ViewCreateInput,
  ViewResourceEnvelope,
  ViewListInput,
} from "./schemas.ts";
import type {
  AutocompleteInput as AutocompleteInputType,
  AutomationEvaluateInput as AutomationEvaluateInputType,
  InboxListInput as InboxListInputType,
  InboxMutationInput as InboxMutationInputType,
  IssueCommentAddInput as IssueCommentAddInputType,
  IssueCommentsListInput as IssueCommentsListInputType,
  IssueCreateInput as IssueCreateInputType,
  IssueGetInput as IssueGetInputType,
  IssueHistoryInput as IssueHistoryInputType,
  IssueListInput as IssueListInputType,
  IssueRecordAddInput as IssueRecordAddInputType,
  IssueRecordsListInput as IssueRecordsListInputType,
  IssueRelationAddInput as IssueRelationAddInputType,
  IssueRelationRemoveInput as IssueRelationRemoveInputType,
  IssueSearchInput as IssueSearchInputType,
  IssueTransitionInput as IssueTransitionInputType,
  IssueUpdateInput as IssueUpdateInputType,
  LabelListInput as LabelListInputType,
  PlanApplyInput as PlanApplyInputType,
  PlanApplyIssueInput as PlanApplyIssueInputType,
  PlanApplyRelationInput as PlanApplyRelationInputType,
  RepositoryGetInput as RepositoryGetInputType,
  RepositoryListInput as RepositoryListInputType,
  TemplateListInput as TemplateListInputType,
  UserListInput as UserListInputType,
  ViewCreateInput as ViewCreateInputType,
  ViewListInput as ViewListInputType,
} from "./schemas.ts";

const StrictDecodeOptions = { onExcessProperty: "error" } as const;

export type CycleMcpToolName =
  | "cycle_repository_list"
  | "cycle_repository_get"
  | "cycle_autocomplete"
  | "cycle_inbox_list"
  | "cycle_inbox_mark_read"
  | "cycle_inbox_mark_unread"
  | "cycle_inbox_archive"
  | "cycle_issue_get"
  | "cycle_issue_list"
  | "cycle_issue_search"
  | "cycle_issue_create"
  | "cycle_issue_update"
  | "cycle_issue_transition"
  | "cycle_issue_comments_list"
  | "cycle_issue_comment_add"
  | "cycle_issue_records_list"
  | "cycle_issue_record_add"
  | "cycle_issue_history"
  | "cycle_issue_relation_add"
  | "cycle_issue_relation_remove"
  | "cycle_label_list"
  | "cycle_user_list"
  | "cycle_template_list"
  | "cycle_view_list"
  | "cycle_view_create"
  | "cycle_automation_evaluate"
  | "cycle_plan_apply";

export type CycleMcpToolResult = {
  readonly isError: boolean;
  readonly value: unknown;
};

export type CycleMcpToolDefinition<Input> = {
  readonly annotations: typeof McpSchema.ToolAnnotations.Type;
  readonly description: string;
  readonly inputSchema: Schema.Decoder<Input>;
  readonly name: CycleMcpToolName;
  readonly outputSchema: Schema.Decoder<unknown>;
  readonly title: string;
  readonly handle: (
    input: Input,
    context: CycleMcpToolContext,
  ) => Effect.Effect<CycleMcpToolResult, never>;
};

export type CycleMcpToolContext = {
  readonly api: CycleMcpApiClientShape;
  readonly makeRequestId: () => string;
};

export const cycleMcpToolNames: ReadonlyArray<CycleMcpToolName> = [
  "cycle_repository_list",
  "cycle_repository_get",
  "cycle_autocomplete",
  "cycle_inbox_list",
  "cycle_inbox_mark_read",
  "cycle_inbox_mark_unread",
  "cycle_inbox_archive",
  "cycle_issue_get",
  "cycle_issue_list",
  "cycle_issue_search",
  "cycle_issue_create",
  "cycle_issue_update",
  "cycle_issue_transition",
  "cycle_issue_comments_list",
  "cycle_issue_comment_add",
  "cycle_issue_records_list",
  "cycle_issue_record_add",
  "cycle_issue_history",
  "cycle_issue_relation_add",
  "cycle_issue_relation_remove",
  "cycle_label_list",
  "cycle_user_list",
  "cycle_template_list",
  "cycle_view_list",
  "cycle_view_create",
  "cycle_automation_evaluate",
  "cycle_plan_apply",
];

export const cycleMcpTools: ReadonlyArray<CycleMcpToolDefinition<any>> = [
  {
    annotations: readOnlyAnnotations("List repositories"),
    description: "List Cycle repositories currently available to the local API.",
    handle: repositoryList,
    inputSchema: RepositoryListInput,
    name: "cycle_repository_list",
    outputSchema: RepositoryCollectionEnvelope,
    title: "List repositories",
  },
  {
    annotations: readOnlyAnnotations("Get repository"),
    description: "Read one Cycle repository status and metadata by repository id.",
    handle: repositoryGet,
    inputSchema: RepositoryGetInput,
    name: "cycle_repository_get",
    outputSchema: RepositoryResourceEnvelope,
    title: "Get repository",
  },
  {
    annotations: readOnlyAnnotations("Autocomplete Cycle references"),
    description: "Search repositories and tickets and return resolvable cycle:// references.",
    handle: autocomplete,
    inputSchema: AutocompleteInput,
    name: "cycle_autocomplete",
    outputSchema: AutocompleteEnvelope,
    title: "Autocomplete Cycle references",
  },
  {
    annotations: readOnlyAnnotations("List inbox"),
    description: "List Cycle inbox items such as mentions, assignments, and comment notifications.",
    handle: inboxList,
    inputSchema: InboxListInput,
    name: "cycle_inbox_list",
    outputSchema: InboxPageEnvelope,
    title: "List inbox",
  },
  {
    annotations: writeAnnotations("Mark inbox read"),
    description: "Mark Cycle inbox items as read.",
    handle: inboxMarkRead,
    inputSchema: InboxMutationInput,
    name: "cycle_inbox_mark_read",
    outputSchema: InboxMutationEnvelope,
    title: "Mark inbox read",
  },
  {
    annotations: writeAnnotations("Mark inbox unread"),
    description: "Mark Cycle inbox items as unread.",
    handle: inboxMarkUnread,
    inputSchema: InboxMutationInput,
    name: "cycle_inbox_mark_unread",
    outputSchema: InboxMutationEnvelope,
    title: "Mark inbox unread",
  },
  {
    annotations: writeAnnotations("Archive inbox"),
    description: "Archive Cycle inbox items after they have been handled.",
    handle: inboxArchive,
    inputSchema: InboxMutationInput,
    name: "cycle_inbox_archive",
    outputSchema: InboxMutationEnvelope,
    title: "Archive inbox",
  },
  {
    annotations: readOnlyAnnotations("Get issue"),
    description: "Read one Cycle issue by repository and issue id.",
    handle: issueGet,
    inputSchema: IssueGetInput,
    name: "cycle_issue_get",
    outputSchema: TicketResourceEnvelope,
    title: "Get issue",
  },
  {
    annotations: readOnlyAnnotations("List issues"),
    description: "List Cycle issues in a repository using supported filters.",
    handle: issueList,
    inputSchema: IssueListInput,
    name: "cycle_issue_list",
    outputSchema: TicketListOrSearchCollectionEnvelope,
    title: "List issues",
  },
  {
    annotations: readOnlyAnnotations("Search issues"),
    description: "Search Cycle issues by text in title, body, and comments.",
    handle: issueSearch,
    inputSchema: IssueSearchInput,
    name: "cycle_issue_search",
    outputSchema: TicketSearchCollectionEnvelope,
    title: "Search issues",
  },
  {
    annotations: writeAnnotations("Create issue"),
    description: "Create a committed Cycle issue in a repository.",
    handle: issueCreate,
    inputSchema: IssueCreateInput,
    name: "cycle_issue_create",
    outputSchema: TicketResourceEnvelope,
    title: "Create issue",
  },
  {
    annotations: writeAnnotations("Update issue"),
    description: "Update a Cycle issue body or mutable frontmatter.",
    handle: issueUpdate,
    inputSchema: IssueUpdateInput,
    name: "cycle_issue_update",
    outputSchema: TicketResourceEnvelope,
    title: "Update issue",
  },
  {
    annotations: writeAnnotations("Transition issue"),
    description: "Transition a Cycle issue to a new workflow status.",
    handle: issueTransition,
    inputSchema: IssueTransitionInput,
    name: "cycle_issue_transition",
    outputSchema: TicketResourceEnvelope,
    title: "Transition issue",
  },
  {
    annotations: readOnlyAnnotations("List issue comments"),
    description: "List user-visible comments for a Cycle issue.",
    handle: issueCommentsList,
    inputSchema: IssueCommentsListInput,
    name: "cycle_issue_comments_list",
    outputSchema: CommentCollectionEnvelope,
    title: "List issue comments",
  },
  {
    annotations: writeAnnotations("Add issue comment"),
    description: "Add a user-visible comment to a Cycle issue.",
    handle: issueCommentAdd,
    inputSchema: IssueCommentAddInput,
    name: "cycle_issue_comment_add",
    outputSchema: CommentResourceEnvelope,
    title: "Add issue comment",
  },
  {
    annotations: readOnlyAnnotations("List issue records"),
    description: "List linked records for a Cycle issue.",
    handle: issueRecordsList,
    inputSchema: IssueRecordsListInput,
    name: "cycle_issue_records_list",
    outputSchema: RecordCollectionEnvelope,
    title: "List issue records",
  },
  {
    annotations: writeAnnotations("Add issue record"),
    description: "Add a linked record to a Cycle issue.",
    handle: issueRecordAdd,
    inputSchema: IssueRecordAddInput,
    name: "cycle_issue_record_add",
    outputSchema: RecordResourceEnvelope,
    title: "Add issue record",
  },
  {
    annotations: readOnlyAnnotations("Issue history"),
    description: "List history commits for a Cycle issue.",
    handle: issueHistory,
    inputSchema: IssueHistoryInput,
    name: "cycle_issue_history",
    outputSchema: HistoryCollectionEnvelope,
    title: "Issue history",
  },
  {
    annotations: writeAnnotations("Add issue relation"),
    description: "Add a relation from a Cycle issue to another issue.",
    handle: issueRelationAdd,
    inputSchema: IssueRelationAddInput,
    name: "cycle_issue_relation_add",
    outputSchema: TicketResourceEnvelope,
    title: "Add issue relation",
  },
  {
    annotations: writeAnnotations("Remove issue relation"),
    description: "Remove a relation from a Cycle issue.",
    handle: issueRelationRemove,
    inputSchema: IssueRelationRemoveInput,
    name: "cycle_issue_relation_remove",
    outputSchema: TicketResourceEnvelope,
    title: "Remove issue relation",
  },
  {
    annotations: readOnlyAnnotations("List labels"),
    description: "List Cycle labels in a repository.",
    handle: labelList,
    inputSchema: LabelListInput,
    name: "cycle_label_list",
    outputSchema: LabelCollectionEnvelope,
    title: "List labels",
  },
  {
    annotations: readOnlyAnnotations("List users"),
    description: "List Cycle users in a repository.",
    handle: userList,
    inputSchema: UserListInput,
    name: "cycle_user_list",
    outputSchema: UserCollectionEnvelope,
    title: "List users",
  },
  {
    annotations: readOnlyAnnotations("List templates"),
    description: "List Cycle issue templates in a repository.",
    handle: templateList,
    inputSchema: TemplateListInput,
    name: "cycle_template_list",
    outputSchema: TemplateCollectionEnvelope,
    title: "List templates",
  },
  {
    annotations: readOnlyAnnotations("List views"),
    description: "List Cycle saved views in a repository.",
    handle: viewList,
    inputSchema: ViewListInput,
    name: "cycle_view_list",
    outputSchema: ViewCollectionEnvelope,
    title: "List views",
  },
  {
    annotations: writeAnnotations("Create view"),
    description: "Create a saved Cycle view for a planned set of work.",
    handle: viewCreate,
    inputSchema: ViewCreateInput,
    name: "cycle_view_create",
    outputSchema: ViewResourceEnvelope,
    title: "Create view",
  },
  {
    annotations: readOnlyAnnotations("Evaluate automation"),
    description: "Evaluate Cycle automation checks for a repository, query, or explicit issues.",
    handle: automationEvaluate,
    inputSchema: AutomationEvaluateInput,
    name: "cycle_automation_evaluate",
    outputSchema: AutomationEvaluationEnvelope,
    title: "Evaluate automation",
  },
  {
    annotations: writeAnnotations("Apply plan"),
    description: "Create multiple planned Cycle issues and apply relations between them.",
    handle: planApply,
    inputSchema: PlanApplyInput,
    name: "cycle_plan_apply",
    outputSchema: PlanApplyEnvelope,
    title: "Apply plan",
  },
];

export const cycleMcpToolByName = new Map<CycleMcpToolName, CycleMcpToolDefinition<any>>(
  cycleMcpTools.map((tool) => [tool.name, tool]),
);

export const mcpToolFromDefinition = (definition: CycleMcpToolDefinition<any>): McpSchema.Tool =>
  new McpSchema.Tool({
    annotations: definition.annotations,
    description: definition.description,
    inputSchema: AiTool.getJsonSchemaFromSchema(definition.inputSchema),
    name: definition.name,
    title: definition.title,
  });

export const callCycleMcpTool = (
  name: string,
  payload: unknown,
  context: CycleMcpToolContext,
): Effect.Effect<CycleMcpToolResult, never> =>
  Effect.gen(function* () {
    const definition = cycleMcpToolByName.get(name as CycleMcpToolName);
    if (definition === undefined) {
      return toolError({
        code: "UNKNOWN_MCP_TOOL",
        message: `Unknown Cycle MCP tool: ${name}`,
        requestId: context.makeRequestId(),
        retryable: false,
        status: 400,
      });
    }

    const decoded = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(definition.inputSchema, StrictDecodeOptions)(payload),
      catch: (error) =>
        cycleMcpApiError({
          code: "INVALID_MCP_TOOL_INPUT",
          details: { parseError: String(error) },
          message: `Invalid input for ${definition.name}.`,
          retryable: false,
          status: 400,
        }),
    }).pipe(Effect.result);

    if (Result.isFailure(decoded)) {
      return toolError({
        ...decoded.failure,
        requestId: decoded.failure.requestId ?? context.makeRequestId(),
      });
    }

    return yield* definition.handle(decoded.success, context);
  }).pipe(
    Effect.withSpan(`mcp.tool.${spanSegment(name)}`, {
      attributes: {
        "mcp.tool.name": name,
        service: "@cycle/api",
      },
    }),
    Effect.annotateLogs({
      service: "@cycle/api",
      tool: name,
    }),
  );

export const callToolResultFrom = (result: CycleMcpToolResult): McpSchema.CallToolResult =>
  new McpSchema.CallToolResult({
    content: [
      {
        text: JSON.stringify(result.value),
        type: "text",
      },
    ],
    isError: result.isError,
    structuredContent: result.value,
  });

function repositoryList(input: RepositoryListInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery("/v1/repositories", repositoryListSearchParams(input)),
    undefined,
    RepositoryCollectionEnvelope,
  );
}

function repositoryGet(input: RepositoryGetInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "GET",
    `/v1/repositories/${segment(input.repositoryId)}`,
    undefined,
    RepositoryResourceEnvelope,
  );
}

function autocomplete(input: AutocompleteInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "GET",
    withQuery("/v1/autocomplete", autocompleteSearchParams(input)),
    undefined,
    AutocompleteEnvelope,
  );
}

function inboxList(input: InboxListInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "GET",
    withQuery("/v1/inbox", inboxSearchParams(input)),
    undefined,
    InboxPageEnvelope,
  );
}

function inboxMarkRead(input: InboxMutationInputType, context: CycleMcpToolContext) {
  return inboxMutation(context, input, "/v1/inbox/read");
}

function inboxMarkUnread(input: InboxMutationInputType, context: CycleMcpToolContext) {
  return inboxMutation(context, input, "/v1/inbox/unread");
}

function inboxArchive(input: InboxMutationInputType, context: CycleMcpToolContext) {
  return inboxMutation(context, input, "/v1/inbox/archive");
}

function inboxMutation(context: CycleMcpToolContext, input: InboxMutationInputType, path: string) {
  return apiResource(
    context,
    input,
    "POST",
    path,
    stripUndefined({
      allowMissing: input.allowMissing,
      itemIds: input.itemIds,
      userId: input.userId,
    }),
    InboxMutationEnvelope,
  );
}

function issueGet(input: IssueGetInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "GET",
    `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}`,
    undefined,
    TicketResourceEnvelope,
  );
}

function issueList(input: IssueListInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(
      `/v1/repositories/${segment(input.repositoryId)}/issues`,
      issueListSearchParams(input.query ?? {}),
    ),
    undefined,
    TicketListOrSearchCollectionEnvelope,
  );
}

function issueSearch(input: IssueSearchInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(
      `/v1/repositories/${segment(input.repositoryId)}/issues`,
      issueListSearchParams({
        cursor: input.cursor,
        limit: input.limit,
        repositoryIds: input.repositoryIds,
        text: input.text,
      }),
    ),
    undefined,
    TicketSearchCollectionEnvelope,
  );
}

function issueCreate(input: IssueCreateInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "POST",
    `/v1/repositories/${segment(input.repositoryId)}/issues`,
    issueCreateBody(input),
    TicketResourceEnvelope,
  );
}

function issueUpdate(input: IssueUpdateInputType, context: CycleMcpToolContext) {
  const body = stripUndefined({
    body: input.body,
    frontmatter: input.frontmatter,
    message: input.message,
  });

  if (Object.keys(body).length === 0) {
    return Effect.succeed(
      toolError({
        code: "INVALID_MCP_TOOL_INPUT",
        message: "cycle_issue_update requires at least one of body, frontmatter, or message.",
        requestId: requestIdFor(input, context),
        retryable: false,
        status: 400,
      }),
    );
  }

  return apiResource(
    context,
    input,
    "PATCH",
    `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}`,
    body,
    TicketResourceEnvelope,
  );
}

function issueTransition(input: IssueTransitionInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "POST",
    `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}/transitions`,
    stripUndefined({
      reason: input.reason,
      status: input.status,
    }),
    TicketResourceEnvelope,
  );
}

function issueCommentsList(input: IssueCommentsListInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(
      `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}/comments`,
      pageSearchParams(input),
    ),
    undefined,
    CommentCollectionEnvelope,
  );
}

function issueCommentAdd(input: IssueCommentAddInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "POST",
    `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}/comments`,
    { body: input.body },
    CommentResourceEnvelope,
  );
}

function issueRecordsList(input: IssueRecordsListInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(
      `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}/records`,
      recordSearchParams(input),
    ),
    undefined,
    RecordCollectionEnvelope,
  );
}

function issueRecordAdd(input: IssueRecordAddInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "POST",
    `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}/records`,
    stripUndefined({
      payload: input.payload,
      recordType: input.recordType,
      userVisible: input.userVisible,
    }),
    RecordResourceEnvelope,
  );
}

function issueHistory(input: IssueHistoryInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(
      `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}/history`,
      pageSearchParams(input),
    ),
    undefined,
    HistoryCollectionEnvelope,
  );
}

function issueRelationAdd(input: IssueRelationAddInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "POST",
    `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}/relations`,
    {
      issueId: input.relatedIssueId,
      type: input.type,
    },
    TicketResourceEnvelope,
  );
}

function issueRelationRemove(input: IssueRelationRemoveInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "POST",
    `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(targetIssueId(input))}/relations/remove`,
    {
      issueId: input.relatedIssueId,
      type: input.type,
    },
    TicketResourceEnvelope,
  );
}

function labelList(input: LabelListInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(`/v1/repositories/${segment(input.repositoryId)}/labels`, labelSearchParams(input)),
    undefined,
    LabelCollectionEnvelope,
  );
}

function userList(input: UserListInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(`/v1/repositories/${segment(input.repositoryId)}/users`, userSearchParams(input)),
    undefined,
    UserCollectionEnvelope,
  );
}

function templateList(input: TemplateListInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(
      `/v1/repositories/${segment(input.repositoryId)}/templates`,
      templateSearchParams(input),
    ),
    undefined,
    TemplateCollectionEnvelope,
  );
}

function viewList(input: ViewListInputType, context: CycleMcpToolContext) {
  return apiCollection(
    context,
    input,
    "GET",
    withQuery(`/v1/repositories/${segment(input.repositoryId)}/views`, viewSearchParams(input)),
    undefined,
    ViewCollectionEnvelope,
  );
}

function viewCreate(input: ViewCreateInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "POST",
    `/v1/repositories/${segment(input.repositoryId)}/views`,
    stripUndefined({
      description: input.description,
      display: input.display,
      groupBy: input.groupBy,
      kind: input.kind,
      name: input.name,
      pinned: input.pinned,
      query: input.query,
      sort: input.sort,
    }),
    ViewResourceEnvelope,
  );
}

function automationEvaluate(input: AutomationEvaluateInputType, context: CycleMcpToolContext) {
  return apiResource(
    context,
    input,
    "POST",
    `/v1/repositories/${segment(input.repositoryId)}/automation/evaluations`,
    stripUndefined({
      failOnWarnings: input.failOnWarnings,
      issueIds: input.issueIds,
      query: input.query,
      requireFresh: input.requireFresh,
      severityThreshold: input.severityThreshold,
    }),
    AutomationEvaluationEnvelope,
  );
}

function planApply(input: PlanApplyInputType, context: CycleMcpToolContext) {
  return Effect.gen(function* () {
    const requestId = requestIdFor(input, context);
    if (input.issues.length === 0) {
      return toolError({
        code: "INVALID_MCP_TOOL_INPUT",
        message: "cycle_plan_apply requires at least one issue.",
        repositoryId: input.repositoryId,
        requestId,
        retryable: false,
        status: 400,
      });
    }

    const created: Array<{ readonly clientId: string; readonly issue: unknown }> = [];
    const clientIds = new Set<string>();
    const issueIdsByClientId = new Map<string, string>();

    for (const issue of input.issues) {
      if (clientIds.has(issue.clientId)) {
        return toolError({
          code: "INVALID_MCP_TOOL_INPUT",
          details: { clientId: issue.clientId },
          message: "cycle_plan_apply issue clientId values must be unique.",
          repositoryId: input.repositoryId,
          requestId,
          retryable: false,
          status: 400,
        });
      }
      clientIds.add(issue.clientId);

      const response = yield* context.api
        .request({
          body: issueCreateBody(issue),
          method: "POST",
          path: `/v1/repositories/${segment(input.repositoryId)}/issues`,
          requestId,
        })
        .pipe(Effect.result);

      if (Result.isFailure(response)) {
        return toolError({
          ...response.failure,
          details: {
            ...(response.failure.details === undefined ? {} : { api: response.failure.details }),
            createdIssues: created,
            failedClientId: issue.clientId,
          },
          repositoryId: input.repositoryId,
          requestId: response.failure.requestId ?? requestId,
        });
      }

      const decoded = decodeApiEnvelope(TicketResourceEnvelope, response.success, requestId);
      if (Result.isFailure(decoded)) {
        return toolError({
          ...decoded.failure,
          details: {
            ...(decoded.failure.details === undefined ? {} : { api: decoded.failure.details }),
            createdIssues: created,
            failedClientId: issue.clientId,
          },
          repositoryId: input.repositoryId,
          requestId,
        });
      }

      const ticket = decoded.success.data as { readonly id?: unknown };
      if (typeof ticket.id !== "string" || ticket.id.length === 0) {
        return toolError({
          code: "INVALID_API_RESPONSE",
          details: { createdIssues: created, failedClientId: issue.clientId },
          message: "Cycle API returned an issue without a string id.",
          repositoryId: input.repositoryId,
          requestId,
          retryable: false,
          status: 500,
        });
      }

      issueIdsByClientId.set(issue.clientId, ticket.id);
      created.push({
        clientId: issue.clientId,
        issue: decoded.success.data,
      });
    }

    const relations: Array<{
      readonly fromIssueId: string;
      readonly relatedIssueId: string;
      readonly type: PlanApplyRelationInputType["type"];
    }> = [];

    for (const relation of input.relations ?? []) {
      const fromIssueId =
        relation.fromIssueId ?? idForClient(relation.fromClientId, issueIdsByClientId);
      const relatedIssueId =
        relation.relatedIssueId ?? idForClient(relation.relatedClientId, issueIdsByClientId);

      if (fromIssueId === undefined || relatedIssueId === undefined) {
        return toolError({
          code: "INVALID_MCP_TOOL_INPUT",
          details: { createdIssues: created, relation, relationsApplied: relations },
          message:
            "cycle_plan_apply relation requires fromIssueId/fromClientId and relatedIssueId/relatedClientId.",
          repositoryId: input.repositoryId,
          requestId,
          retryable: false,
          status: 400,
        });
      }

      const response = yield* context.api
        .request({
          body: {
            issueId: relatedIssueId,
            type: relation.type,
          },
          method: "POST",
          path: `/v1/repositories/${segment(input.repositoryId)}/issues/${segment(fromIssueId)}/relations`,
          requestId,
        })
        .pipe(Effect.result);

      if (Result.isFailure(response)) {
        return toolError({
          ...response.failure,
          details: {
            ...(response.failure.details === undefined ? {} : { api: response.failure.details }),
            createdIssues: created,
            failedRelation: relation,
            relationsApplied: relations,
          },
          repositoryId: input.repositoryId,
          requestId: response.failure.requestId ?? requestId,
        });
      }

      relations.push({
        fromIssueId,
        relatedIssueId,
        type: relation.type,
      });
    }

    return toolSuccess(
      input,
      {
        data: {
          issues: created,
          relations,
        },
        meta: { requestId },
      },
      requestId,
    );
  });
}

const apiResource = <Input extends ToolContextInput, A extends Schema.Decoder<unknown>>(
  context: CycleMcpToolContext,
  input: Input,
  method: string,
  path: string,
  body: unknown,
  schema: A,
): Effect.Effect<CycleMcpToolResult, never> =>
  apiRequest(context, input, method, path, body, schema);

const apiCollection = <Input extends ToolContextInput, A extends Schema.Decoder<unknown>>(
  context: CycleMcpToolContext,
  input: Input,
  method: string,
  path: string,
  body: unknown,
  schema: A,
): Effect.Effect<CycleMcpToolResult, never> =>
  apiRequest(context, input, method, path, body, schema);

const apiRequest = <Input extends ToolContextInput, A extends Schema.Decoder<unknown>>(
  context: CycleMcpToolContext,
  input: Input,
  method: string,
  path: string,
  body: unknown,
  schema: A,
): Effect.Effect<CycleMcpToolResult, never> =>
  Effect.gen(function* () {
    const requestId = requestIdFor(input, context);
    const response = yield* context.api
      .request({
        body,
        method,
        path,
        requestId,
      })
      .pipe(Effect.result);

    if (Result.isFailure(response)) {
      return toolError({
        ...response.failure,
        issueId: input.issueId,
        repositoryId: input.repositoryId,
        requestId: response.failure.requestId ?? requestId,
      });
    }

    const decoded = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(schema, StrictDecodeOptions)(response.success),
      catch: (error) =>
        cycleMcpApiError({
          code: "INVALID_API_RESPONSE",
          details: { parseError: String(error) },
          message: "Cycle API returned an invalid response envelope.",
          requestId,
          retryable: false,
          status: 500,
        }),
    }).pipe(Effect.result);

    if (Result.isFailure(decoded)) {
      return toolError({
        ...decoded.failure,
        issueId: input.issueId,
        repositoryId: input.repositoryId,
        requestId,
      });
    }

    return toolSuccess(input, decoded.success as CycleApiEnvelope, requestId);
  });

type ToolContextInput = {
  readonly issueId?: string;
  readonly repositoryId?: string;
  readonly requestId?: string;
};

const toolSuccess = (
  input: ToolContextInput,
  value: CycleApiEnvelope,
  requestId: string,
): CycleMcpToolResult => ({
  isError: false,
  value: withToolMeta(value, input, value.meta?.requestId ?? requestId),
});

type ToolErrorInput = {
  readonly code: string;
  readonly details?: unknown;
  readonly issueId?: string;
  readonly message: string;
  readonly repositoryId?: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly status?: number;
};

const toolError = (
  error: ToolErrorInput & {
    readonly issueId?: string;
    readonly repositoryId?: string;
  },
): CycleMcpToolResult => ({
  isError: true,
  value: {
    error: {
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
      message: error.message,
      requestId: error.requestId ?? "unknown",
      retryable: error.retryable,
      status: error.status,
    },
    meta: {
      ...(error.issueId === undefined ? {} : { issueId: error.issueId }),
      ...(error.repositoryId === undefined ? {} : { repositoryId: error.repositoryId }),
    },
  } satisfies typeof ToolErrorOutput.Type,
});

const withToolMeta = (
  envelope: CycleApiEnvelope,
  input: ToolContextInput,
  requestId: string,
): CycleApiEnvelope => ({
  ...envelope,
  meta: {
    ...envelope.meta,
    ...(input.issueId === undefined ? {} : { issueId: input.issueId }),
    ...(input.repositoryId === undefined ? {} : { repositoryId: input.repositoryId }),
    requestId,
  },
});

const requestIdFor = (input: ToolContextInput, context: CycleMcpToolContext): string =>
  input.requestId ?? context.makeRequestId();

const targetIssueId = (input: {
  readonly issueId: string;
  readonly targetIssueId?: string;
}): string => input.targetIssueId ?? input.issueId;

export const issueListSearchParams = (
  query: Partial<IssueListInputType["query"] & { readonly text: string }>,
): URLSearchParams => {
  const params = new URLSearchParams();
  setParam(params, "page[cursor]", query.cursor);
  setParam(params, "page[limit]", query.limit);
  setParam(params, "filter[archived]", query.archived);
  setNullableParam(params, "filter[assignee]", query.assignee);
  setParam(params, "filter[assignee][in]", query.assigneeIn?.join(","));
  setParam(params, "filter[blocked]", query.blocked);
  setParam(params, "filter[deleted]", query.deleted);
  setParam(params, "filter[dueAfter]", query.dueAfter);
  setParam(params, "filter[dueBefore]", query.dueBefore);
  setParam(params, "filter[estimate]", query.estimate);
  setParam(params, "filter[hasAssignee]", query.hasAssignee);
  setParam(params, "filter[hasDueDate]", query.hasDueDate);
  setParam(params, "filter[hasEstimate]", query.hasEstimate);
  setParam(params, "filter[hasLabels]", query.hasLabels);
  setParam(params, "filter[label]", query.label);
  setParam(params, "filter[label][in]", query.labelIn?.join(","));
  setNullableParam(params, "filter[parent]", query.parent);
  setParam(params, "filter[priority]", query.priority);
  setParam(params, "filter[priority][in]", query.priorityIn?.join(","));
  setParam(params, "filter[repository][in]", query.repositoryIds?.join(","));
  setParam(params, "filter[staleBefore]", query.staleBefore);
  setParam(params, "filter[status]", query.status);
  setParam(params, "filter[status][in]", query.statusIn?.join(","));
  setParam(params, "filter[type]", query.type);
  setParam(params, "filter[updatedAfter]", query.updatedAfter);
  setParam(params, "filter[updatedBefore]", query.updatedBefore);
  setParam(params, "sort[field]", query.orderBy);
  setParam(params, "sort[direction]", query.orderDirection);
  setParam(params, "q", query.text);

  return params;
};

const repositoryListSearchParams = (input: RepositoryListInputType): URLSearchParams => {
  const params = new URLSearchParams();
  setParam(params, "filter[id]", input.repositoryId);
  setParam(params, "filter[path]", input.path);
  return params;
};

const autocompleteSearchParams = (input: AutocompleteInputType): URLSearchParams => {
  const params = new URLSearchParams();
  setParam(params, "q", input.query);
  setParam(params, "types", input.types?.join(","));
  setParam(params, "limit", input.limit);
  return params;
};

const inboxSearchParams = (input: InboxListInputType): URLSearchParams => {
  const params = new URLSearchParams();
  setParam(params, "userId", input.userId);
  setParam(params, "page[cursor]", input.cursor);
  setParam(params, "page[limit]", input.limit);
  setParam(params, "filter[createdAfter]", input.createdAfter);
  setParam(params, "filter[createdBefore]", input.createdBefore);
  setParam(params, "filter[includeSourceInactive]", input.includeSourceInactive);
  setParam(params, "filter[reason]", input.reason);
  setParam(params, "filter[repository][in]", input.repositoryIds?.join(","));
  setParam(params, "filter[status]", input.status);
  setParam(params, "filter[ticketId]", input.ticketId);
  return params;
};

const pageSearchParams = (input: {
  readonly cursor?: string;
  readonly limit?: number;
}): URLSearchParams => {
  const params = new URLSearchParams();
  setParam(params, "page[cursor]", input.cursor);
  setParam(params, "page[limit]", input.limit);
  return params;
};

const recordSearchParams = (input: IssueRecordsListInputType): URLSearchParams => {
  const params = pageSearchParams(input);
  setParam(params, "filter[recordType]", input.recordType);
  return params;
};

const labelSearchParams = (input: LabelListInputType): URLSearchParams => {
  const params = pageSearchParams(input);
  setParam(params, "filter[archived]", input.archived);
  setParam(params, "q", input.text);
  return params;
};

const userSearchParams = (input: UserListInputType): URLSearchParams => {
  const params = pageSearchParams(input);
  setParam(params, "filter[disabled]", input.disabled);
  setParam(params, "q", input.text);
  return params;
};

const templateSearchParams = (input: TemplateListInputType): URLSearchParams => {
  const params = pageSearchParams(input);
  setParam(params, "filter[active]", input.active);
  setParam(params, "filter[kind]", input.kind);
  setParam(params, "q", input.text);
  return params;
};

const viewSearchParams = (input: ViewListInputType): URLSearchParams => {
  const params = pageSearchParams(input);
  setParam(params, "filter[kind]", input.kind);
  setParam(params, "filter[pinned]", input.pinned);
  setParam(params, "q", input.text);
  return params;
};

const issueCreateBody = (input: IssueCreateInputType | PlanApplyIssueInputType) =>
  stripUndefined({
    assignee: input.assignee,
    body: input.body,
    dueDate: input.dueDate,
    estimate: input.estimate,
    externalLinks: input.externalLinks,
    labels: input.labels,
    parent: input.parent,
    planningNotRequired: input.planningNotRequired,
    priority: input.priority,
    repository: input.repository,
    status: input.status,
    title: input.title,
    type: input.type,
  });

const idForClient = (clientId: string | undefined, ids: ReadonlyMap<string, string>) =>
  clientId === undefined ? undefined : ids.get(clientId);

const decodeApiEnvelope = <A extends Schema.Decoder<unknown>>(
  schema: A,
  value: unknown,
  requestId: string,
) =>
  Effect.runSync(
    Effect.try({
      try: () => Schema.decodeUnknownSync(schema, StrictDecodeOptions)(value),
      catch: (error) =>
        cycleMcpApiError({
          code: "INVALID_API_RESPONSE",
          details: { parseError: String(error) },
          message: "Cycle API returned an invalid response envelope.",
          requestId,
          retryable: false,
          status: 500,
        }),
    }).pipe(Effect.result),
  );

const withQuery = (path: string, params: URLSearchParams): string => {
  const query = params.toString();
  return query.length === 0 ? path : `${path}?${query}`;
};

const setParam = (params: URLSearchParams, key: string, value: unknown): void => {
  if (value === undefined || value === null) return;
  params.set(key, String(value));
};

const setNullableParam = (params: URLSearchParams, key: string, value: unknown): void => {
  if (value === undefined) return;
  params.set(key, value === null ? "null" : String(value));
};

const stripUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

const segment = (value: string): string => encodeURIComponent(value);

const spanSegment = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-|-$/gu, "") || "unknown";

function readOnlyAnnotations(title: string): typeof McpSchema.ToolAnnotations.Type {
  return {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
    title,
  };
}

function writeAnnotations(title: string): typeof McpSchema.ToolAnnotations.Type {
  return {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
    readOnlyHint: false,
    title,
  };
}
