import { strict as assert } from "node:assert";
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import {
  callCycleMcpTool,
  cycleMcpApiError,
  cycleMcpToolNames,
  cycleMcpTools,
  discoverCycleApi,
  issueListSearchParams,
  mcpToolFromDefinition,
  startCycleMcpHttpServerEffect,
  type CycleApiEnvelope,
  type CycleMcpApiClientShape,
} from "../src/index.ts";
import { describe, it } from "vitest";

const context = (requests: Array<unknown>, response: unknown = { data: null, meta: {} }) => ({
  api: {
    discover: Effect.succeed({
      baseUrl: "http://127.0.0.1:4738",
      token: "secret",
    }),
    request: <T = unknown>(request: {
      readonly body?: unknown;
      readonly method: string;
      readonly path: string;
      readonly requestId?: string;
    }) => {
      requests.push(request);
      return Effect.succeed(response as CycleApiEnvelope<T>);
    },
  } satisfies CycleMcpApiClientShape,
  makeRequestId: () => "req-test",
});

const ticket = (id: string, title = `Ticket ${id}`) => ({
  body: `Body for ${id}`,
  bodyFormat: "markdown",
  createdBy: "agent",
  frontmatter: {
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: {
      name: "Agent",
      type: "agent",
    },
    id,
    priority: "medium",
    status: "todo",
    title,
    type: "feature",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  id,
  parent: "",
  priority: "medium",
  schemaVersion: 1,
  status: "todo",
  title,
  type: "feature",
  updatedDate: "2026-01-01T00:00:00.000Z",
});

describe("@cycle/api/mcp", () => {
  it("registers only the curated v0.2 tool names", () => {
    assert.deepEqual(cycleMcpToolNames, [
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
      "cycle_page_list",
      "cycle_page_get",
      "cycle_page_create",
      "cycle_page_update",
      "cycle_page_archive",
      "cycle_page_restore",
      "cycle_page_history",
      "cycle_page_revision_get",
      "cycle_page_comments_list",
      "cycle_page_comment_add",
      "cycle_label_list",
      "cycle_user_list",
      "cycle_template_list",
      "cycle_view_list",
      "cycle_view_create",
      "cycle_automation_evaluate",
      "cycle_plan_apply",
    ]);
  });

  it("emits MCP annotations for read and write tools", () => {
    const get = mcpToolFromDefinition(
      cycleMcpTools.find((tool) => tool.name === "cycle_issue_get")!,
    );
    const update = mcpToolFromDefinition(
      cycleMcpTools.find((tool) => tool.name === "cycle_issue_update")!,
    );

    assert.equal(get.annotations?.readOnlyHint, true);
    assert.equal(get.annotations?.destructiveHint, false);
    assert.equal(get.annotations?.idempotentHint, true);
    assert.equal(get.annotations?.openWorldHint, false);
    assert.equal(update.annotations?.readOnlyHint, false);
    assert.equal(update.annotations?.destructiveHint, false);
    assert.equal(update.annotations?.idempotentHint, false);
    assert.equal(update.annotations?.openWorldHint, false);
  });

  it("emits MCP paging limits as plain positive integers", () => {
    const toolNames = [
      "cycle_autocomplete",
      "cycle_inbox_list",
      "cycle_issue_list",
      "cycle_issue_search",
      "cycle_issue_comments_list",
      "cycle_issue_records_list",
      "cycle_issue_history",
      "cycle_label_list",
      "cycle_user_list",
      "cycle_template_list",
      "cycle_view_list",
    ] as const;

    for (const toolName of toolNames) {
      const tool = mcpToolFromDefinition(cycleMcpTools.find((entry) => entry.name === toolName)!);
      const schemaJson = JSON.stringify(tool.inputSchema);

      assert.equal(schemaJson.includes("NaN"), false, `${toolName} should not allow NaN`);
      assert.equal(schemaJson.includes("Infinity"), false, `${toolName} should not allow infinity`);
      assert.equal(schemaJson.includes('"integer"'), true, `${toolName} should use integer`);
      assert.equal(schemaJson.includes('"minimum":1'), true, `${toolName} should be positive`);
    }
  });

  it("maps search and relation removal to current REST routes", async () => {
    const requests: Array<any> = [];
    const toolContext = context(requests, {
      data: [],
      links: { next: null, self: "/v1/repositories/repo/issues?q=material" },
      meta: { requestId: "req-search", totalCount: null },
      page: { hasMore: false, limit: 10, nextCursor: null },
    });

    await Effect.runPromise(
      callCycleMcpTool(
        "cycle_issue_search",
        {
          limit: 10,
          repositoryId: "repo",
          repositoryIds: ["repo", "other"],
          text: "material",
        },
        toolContext,
      ),
    );

    assert.equal(
      requests[0].path,
      "/v1/repositories/repo/issues?page%5Blimit%5D=10&filter%5Brepository%5D%5Bin%5D=repo%2Cother&q=material",
    );

    requests.length = 0;
    await Effect.runPromise(
      callCycleMcpTool(
        "cycle_issue_relation_remove",
        {
          issueId: "CYC-1",
          relatedIssueId: "CYC-2",
          repositoryId: "repo",
          type: "blocking",
        },
        context(requests),
      ),
    );

    assert.equal(requests[0].path, "/v1/repositories/repo/issues/CYC-1/relations/remove");
    assert.equal(requests[0].method, "POST");
    assert.deepEqual(requests[0].body, {
      issueId: "CYC-2",
      type: "blocking",
    });
  });

  it("builds issue list query parameters using the API format", () => {
    const params = issueListSearchParams({
      archived: false,
      assignee: null,
      blocked: true,
      cursor: "next",
      dueBefore: "2026-07-01",
      hasLabels: true,
      labelIn: ["bug", "backend"],
      limit: 25,
      orderBy: "updatedAt",
      orderDirection: "desc",
      parent: "CYC-10",
      priority: "high",
      repositoryIds: ["repo-a", "repo-b"],
      statusIn: ["ready", "in-progress"],
      text: "auth",
      type: "feature",
      updatedAfter: "2026-06-01",
    });

    assert.equal(params.get("page[cursor]"), "next");
    assert.equal(params.get("page[limit]"), "25");
    assert.equal(params.get("filter[archived]"), "false");
    assert.equal(params.get("filter[assignee]"), "null");
    assert.equal(params.get("filter[blocked]"), "true");
    assert.equal(params.get("filter[dueBefore]"), "2026-07-01");
    assert.equal(params.get("filter[hasLabels]"), "true");
    assert.equal(params.get("filter[label][in]"), "bug,backend");
    assert.equal(params.get("filter[parent]"), "CYC-10");
    assert.equal(params.get("filter[priority]"), "high");
    assert.equal(params.get("filter[repository][in]"), "repo-a,repo-b");
    assert.equal(params.get("filter[status][in]"), "ready,in-progress");
    assert.equal(params.get("filter[type]"), "feature");
    assert.equal(params.get("filter[updatedAfter]"), "2026-06-01");
    assert.equal(params.get("sort[field]"), "updatedAt");
    assert.equal(params.get("sort[direction]"), "desc");
    assert.equal(params.get("q"), "auth");
  });

  it("maps repository discovery, autocomplete, and inbox tools without issue context", async () => {
    const repositoryRequests: Array<any> = [];
    await Effect.runPromise(
      callCycleMcpTool(
        "cycle_repository_list",
        {
          path: "/workspace/repo",
        },
        context(repositoryRequests, {
          data: [
            {
              activeGeneration: 1,
              activeSnapshotId: null,
              repositoryId: "repo",
              status: "ready",
              warningCount: 0,
            },
          ],
          links: { next: null, self: "/v1/repositories?filter%5Bpath%5D=%2Fworkspace%2Frepo" },
          meta: { requestId: "req-repos", totalCount: null },
          page: { hasMore: false, limit: 50, nextCursor: null },
        }),
      ),
    );
    assert.equal(
      repositoryRequests[0].path,
      "/v1/repositories?filter%5Bpath%5D=%2Fworkspace%2Frepo",
    );

    const autocompleteRequests: Array<any> = [];
    await Effect.runPromise(
      callCycleMcpTool(
        "cycle_autocomplete",
        {
          limit: 5,
          query: "auth",
          types: ["repository", "ticket"],
        },
        context(autocompleteRequests, {
          data: {
            results: [
              {
                id: "CYC-1",
                name: "Auth flow",
                repositoryId: "repo",
                type: "ticket",
                uri: "cycle://repository/repo/tickets/CYC-1",
              },
            ],
          },
          meta: { requestId: "req-autocomplete" },
        }),
      ),
    );
    assert.equal(
      autocompleteRequests[0].path,
      "/v1/autocomplete?q=auth&types=repository%2Cticket&limit=5",
    );

    const inboxRequests: Array<any> = [];
    await Effect.runPromise(
      callCycleMcpTool(
        "cycle_inbox_list",
        {
          reason: "mention",
          repositoryIds: ["repo"],
          status: "unread",
          userId: "agent@example.com",
        },
        context(inboxRequests, {
          data: {
            activeSnapshotIds: { repo: "snap-1" },
            entries: [],
          },
          meta: { requestId: "req-inbox" },
        }),
      ),
    );
    assert.equal(
      inboxRequests[0].path,
      "/v1/inbox?userId=agent%40example.com&filter%5Breason%5D=mention&filter%5Brepository%5D%5Bin%5D=repo&filter%5Bstatus%5D=unread",
    );
  });

  it("maps issue creation to the REST create route", async () => {
    const requests: Array<any> = [];
    const result = await Effect.runPromise(
      callCycleMcpTool(
        "cycle_issue_create",
        {
          body: "Implement the OAuth callback.",
          labels: ["feature"],
          priority: "high",
          repositoryId: "repo",
          title: "Build OAuth callback",
          type: "feature",
        },
        context(requests, {
          data: ticket("CYC-1", "Build OAuth callback"),
          meta: { requestId: "req-create" },
        }),
      ),
    );

    assert.equal(result.isError, false);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].path, "/v1/repositories/repo/issues");
    assert.deepEqual(requests[0].body, {
      body: "Implement the OAuth callback.",
      labels: ["feature"],
      priority: "high",
      title: "Build OAuth callback",
      type: "feature",
    });
  });

  it("applies a plan by creating issues in order and relating created tickets", async () => {
    const requests: Array<any> = [];
    const responses = [
      { data: ticket("CYC-1", "Parent feature"), meta: { requestId: "req-plan" } },
      { data: ticket("CYC-2", "Implementation task"), meta: { requestId: "req-plan" } },
      { data: ticket("CYC-1", "Parent feature"), meta: { requestId: "req-plan" } },
    ];
    const toolContext = {
      api: {
        discover: Effect.succeed({
          baseUrl: "http://127.0.0.1:4738",
          token: "secret",
        }),
        request: <T = unknown>(request: {
          readonly body?: unknown;
          readonly method: string;
          readonly path: string;
          readonly requestId?: string;
        }) => {
          requests.push(request);
          return Effect.succeed(responses.shift() as CycleApiEnvelope<T>);
        },
      } satisfies CycleMcpApiClientShape,
      makeRequestId: () => "req-plan",
    };

    const result = await Effect.runPromise(
      callCycleMcpTool(
        "cycle_plan_apply",
        {
          issues: [
            { clientId: "parent", title: "Parent feature", type: "feature" },
            {
              body: "Ship the implementation",
              clientId: "task",
              title: "Implementation task",
              type: "task",
            },
          ],
          relations: [
            {
              fromClientId: "parent",
              relatedClientId: "task",
              type: "blocking",
            },
          ],
          repositoryId: "repo",
        },
        toolContext,
      ),
    );

    assert.equal(result.isError, false);
    assert.equal(requests.length, 3);
    assert.equal(requests[0].path, "/v1/repositories/repo/issues");
    assert.deepEqual(requests[0].body, {
      title: "Parent feature",
      type: "feature",
    });
    assert.equal(requests[1].path, "/v1/repositories/repo/issues");
    assert.deepEqual(requests[1].body, {
      body: "Ship the implementation",
      title: "Implementation task",
      type: "task",
    });
    assert.equal(requests[2].path, "/v1/repositories/repo/issues/CYC-1/relations");
    assert.deepEqual(requests[2].body, {
      issueId: "CYC-2",
      type: "blocking",
    });
    assert.equal((result.value as any).data.issues[0].clientId, "parent");
    assert.deepEqual((result.value as any).data.relations, [
      {
        fromIssueId: "CYC-1",
        relatedIssueId: "CYC-2",
        type: "blocking",
      },
    ]);
  });

  it("uses an explicit API token with the default API URL without reading app config", async () => {
    const result = await discoverCycleApi({
      apiToken: "api-token",
      env: {
        CYCLE_API_URL_DEFAULT: "http://127.0.0.1:4789/",
        HOME: "/nonexistent-cycle-test-home",
        TMPDIR: "/nonexistent-cycle-test-tmp",
      },
    });

    assert.deepEqual(result, {
      baseUrl: "http://127.0.0.1:4789",
      token: "api-token",
    });
  });

  it("rejects missing explicit repository and issue context before REST calls", async () => {
    const requests: Array<unknown> = [];
    const result = await Effect.runPromise(
      callCycleMcpTool(
        "cycle_issue_get",
        {
          issueId: "CYC-1",
        },
        context(requests),
      ),
    );

    assert.equal(result.isError, true);
    assert.equal((result.value as any).error.code, "INVALID_MCP_TOOL_INPUT");
    assert.equal(requests.length, 0);
  });

  it("rejects tools disallowed by job-scoped ticket-context authority", async () => {
    const requests: Array<unknown> = [];
    const result = await Effect.runPromise(
      callCycleMcpTool(
        "cycle_issue_transition",
        {
          issueId: "CYC-1",
          repositoryId: "repo",
          status: "in-progress",
        },
        {
          ...context(requests),
          authorityMode: "ticket-context",
          jobId: "agent_job_1",
          repositoryId: "repo",
          ticketId: "CYC-1",
        },
      ),
    );

    assert.equal(result.isError, true);
    assert.equal((result.value as any).error.code, "MCP_TOOL_NOT_ALLOWED");
    assert.equal((result.value as any).error.status, 403);
    assert.equal(requests.length, 0);
  });

  it("rejects job-scoped MCP calls outside repository and ticket scope", async () => {
    const repositoryRequests: Array<unknown> = [];
    const repositoryResult = await Effect.runPromise(
      callCycleMcpTool(
        "cycle_issue_get",
        {
          issueId: "CYC-1",
          repositoryId: "other",
        },
        {
          ...context(repositoryRequests),
          authorityMode: "ticket-context",
          jobId: "agent_job_1",
          repositoryId: "repo",
          ticketId: "CYC-1",
        },
      ),
    );

    assert.equal(repositoryResult.isError, true);
    assert.equal((repositoryResult.value as any).error.code, "MCP_REPOSITORY_SCOPE_VIOLATION");
    assert.equal(repositoryRequests.length, 0);

    const ticketRequests: Array<unknown> = [];
    const ticketResult = await Effect.runPromise(
      callCycleMcpTool(
        "cycle_issue_get",
        {
          issueId: "CYC-2",
          repositoryId: "repo",
        },
        {
          ...context(ticketRequests),
          authorityMode: "ticket-context",
          jobId: "agent_job_1",
          repositoryId: "repo",
          ticketId: "CYC-1",
        },
      ),
    );

    assert.equal(ticketResult.isError, true);
    assert.equal((ticketResult.value as any).error.code, "MCP_TICKET_SCOPE_VIOLATION");
    assert.equal(ticketRequests.length, 0);
  });

  it("returns API failures as tool errors", async () => {
    const result = await Effect.runPromise(
      callCycleMcpTool(
        "cycle_issue_get",
        {
          issueId: "CYC-1",
          repositoryId: "repo",
        },
        {
          api: {
            discover: Effect.succeed({
              baseUrl: "http://127.0.0.1:4738",
              token: "secret",
            }),
            request: () =>
              Effect.fail(
                cycleMcpApiError({
                  code: "NOT_FOUND",
                  message: "Issue not found.",
                  requestId: "req-api",
                  retryable: false,
                  status: 404,
                }),
              ),
          },
          makeRequestId: () => "req-test",
        },
      ),
    );

    assert.equal(result.isError, true);
    assert.equal((result.value as any).error.code, "NOT_FOUND");
    assert.equal((result.value as any).error.requestId, "req-api");
  });

  it("rejects unauthenticated HTTP MCP requests by default", async () => {
    const server = await Effect.runPromise(
      startCycleMcpHttpServerEffect({
        apiToken: "api-token",
        auth: { token: "mcp-token" },
        env: {},
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    try {
      const response = await fetch(`${server.baseUrl}${server.path}`, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "ping",
          params: {},
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      assert.equal(response.status, 401);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
    } finally {
      await server.close();
    }
  });

  it("allows wildcard CORS preflight for standalone HTTP MCP", async () => {
    const server = await Effect.runPromise(
      startCycleMcpHttpServerEffect({
        apiToken: "api-token",
        auth: { token: "mcp-token" },
        env: {},
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    try {
      const response = await fetch(`${server.baseUrl}${server.path}`, {
        headers: {
          "access-control-request-headers": "authorization, content-type",
          "access-control-request-method": "POST",
          origin: "http://localhost:5173",
        },
        method: "OPTIONS",
      });

      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
      assert.equal(
        response.headers.get("access-control-allow-headers"),
        "authorization, content-type",
      );
    } finally {
      await server.close();
    }
  });

  it("supports direct HTTP MCP ping without a prior initialize session", async () => {
    const server = await Effect.runPromise(
      startCycleMcpHttpServerEffect({
        apiToken: "api-token",
        auth: { token: "mcp-token" },
        env: {},
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    try {
      const response = await fetch(`${server.baseUrl}${server.path}`, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "ping",
          params: {},
        }),
        headers: {
          authorization: "Bearer mcp-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as { result?: unknown };

      assert.equal(response.status, 200);
      assert.deepEqual(body.result, {});
    } finally {
      await server.close();
    }
  });

  it("supports direct HTTP MCP tools/list without a prior initialize session", async () => {
    const server = await Effect.runPromise(
      startCycleMcpHttpServerEffect({
        apiToken: "api-token",
        auth: { token: "mcp-token" },
        env: {},
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    try {
      const response = await fetch(`${server.baseUrl}${server.path}`, {
        body: JSON.stringify({
          id: 2,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
        }),
        headers: {
          authorization: "Bearer mcp-token",
          "content-type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as {
        result?: {
          readonly tools?: ReadonlyArray<{ readonly name?: string }>;
        };
      };

      assert.equal(response.status, 200);
      assert.equal(body.result?.tools?.length, cycleMcpToolNames.length);
      assert.equal(body.result?.tools?.[0]?.name, cycleMcpToolNames[0]);
    } finally {
      await server.close();
    }
  });

  it("acknowledges HTTP MCP notifications with 202 empty responses", async () => {
    const server = await Effect.runPromise(
      startCycleMcpHttpServerEffect({
        apiToken: "api-token",
        auth: { token: "mcp-token" },
        env: {},
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    try {
      const response = await fetch(`${server.baseUrl}${server.path}`, {
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
        headers: {
          authorization: "Bearer mcp-token",
          "content-type": "application/json",
          "mcp-session-id": "test-session",
        },
        method: "POST",
      });

      assert.equal(response.status, 202);
      assert.equal(await response.text(), "");
    } finally {
      await server.close();
    }
  });
});
