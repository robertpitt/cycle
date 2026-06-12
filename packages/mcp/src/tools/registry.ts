import { Effect, Result, Schema } from "effect";
import * as McpSchema from "effect/unstable/ai/McpSchema";
import * as AiTool from "effect/unstable/ai/Tool";
import { type CycleApiEnvelope, type CycleMcpApiClientShape, cycleMcpApiError } from "../client.ts";
import {
  CommentCollectionEnvelope,
  CommentResourceEnvelope,
  HistoryCollectionEnvelope,
  IssueCommentAddInput,
  IssueCommentsListInput,
  IssueGetInput,
  IssueHistoryInput,
  IssueListInput,
  IssueRelationAddInput,
  IssueRelationRemoveInput,
  IssueSearchInput,
  IssueTransitionInput,
  IssueUpdateInput,
  TicketCollectionEnvelope,
  TicketResourceEnvelope,
  TicketSearchCollectionEnvelope,
  ToolErrorOutput,
} from "./schemas.ts";
import type {
  IssueCommentAddInput as IssueCommentAddInputType,
  IssueCommentsListInput as IssueCommentsListInputType,
  IssueGetInput as IssueGetInputType,
  IssueHistoryInput as IssueHistoryInputType,
  IssueListInput as IssueListInputType,
  IssueRelationAddInput as IssueRelationAddInputType,
  IssueRelationRemoveInput as IssueRelationRemoveInputType,
  IssueSearchInput as IssueSearchInputType,
  IssueTransitionInput as IssueTransitionInputType,
  IssueUpdateInput as IssueUpdateInputType,
} from "./schemas.ts";

export type CycleMcpToolName =
  | "cycle_issue_get"
  | "cycle_issue_list"
  | "cycle_issue_search"
  | "cycle_issue_update"
  | "cycle_issue_transition"
  | "cycle_issue_comments_list"
  | "cycle_issue_comment_add"
  | "cycle_issue_history"
  | "cycle_issue_relation_add"
  | "cycle_issue_relation_remove";

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
  "cycle_issue_get",
  "cycle_issue_list",
  "cycle_issue_search",
  "cycle_issue_update",
  "cycle_issue_transition",
  "cycle_issue_comments_list",
  "cycle_issue_comment_add",
  "cycle_issue_history",
  "cycle_issue_relation_add",
  "cycle_issue_relation_remove",
];

export const cycleMcpTools: ReadonlyArray<CycleMcpToolDefinition<any>> = [
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
    outputSchema: TicketCollectionEnvelope,
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
      try: () => Schema.decodeUnknownSync(definition.inputSchema)(payload),
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
  });

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
    TicketCollectionEnvelope,
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
        text: input.text,
      }),
    ),
    undefined,
    TicketSearchCollectionEnvelope,
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
      try: () => Schema.decodeUnknownSync(schema)(response.success),
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
  readonly issueId: string;
  readonly repositoryId: string;
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
    issueId: input.issueId,
    repositoryId: input.repositoryId,
    requestId,
  } as CycleApiEnvelope["meta"] & {
    readonly issueId: string;
    readonly repositoryId: string;
  },
});

const requestIdFor = (input: ToolContextInput, context: CycleMcpToolContext): string =>
  input.requestId ?? context.makeRequestId();

const targetIssueId = (input: ToolContextInput & { readonly targetIssueId?: string }): string =>
  input.targetIssueId ?? input.issueId;

export const issueListSearchParams = (
  query: Partial<IssueListInputType["query"] & { readonly text: string }>,
): URLSearchParams => {
  const params = new URLSearchParams();
  setParam(params, "page[cursor]", query.cursor);
  setParam(params, "page[limit]", query.limit);
  setParam(params, "filter[label]", query.label);
  setParam(params, "filter[label][in]", query.labelIn?.join(","));
  setParam(params, "filter[priority]", query.priority);
  setParam(params, "filter[priority][in]", query.priorityIn?.join(","));
  setParam(params, "filter[status]", query.status);
  setParam(params, "filter[status][in]", query.statusIn?.join(","));
  setParam(params, "filter[type]", query.type);
  setParam(params, "q", query.text);

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

const withQuery = (path: string, params: URLSearchParams): string => {
  const query = params.toString();
  return query.length === 0 ? path : `${path}?${query}`;
};

const setParam = (params: URLSearchParams, key: string, value: unknown): void => {
  if (value === undefined || value === null) return;
  params.set(key, String(value));
};

const stripUndefined = (input: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

const segment = (value: string): string => encodeURIComponent(value);

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
