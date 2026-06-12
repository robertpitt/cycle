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
    discover: () =>
      Effect.succeed({
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

describe("@cycle/mcp", () => {
  it("registers only the curated v0.1 tool names", () => {
    assert.deepEqual(cycleMcpToolNames, [
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
          issueId: "CYC-1",
          limit: 10,
          repositoryId: "repo",
          text: "material",
        },
        toolContext,
      ),
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
      cursor: "next",
      labelIn: ["bug", "backend"],
      limit: 25,
      priority: "high",
      statusIn: ["ready", "in-progress"],
      text: "auth",
      type: "feature",
    });

    assert.equal(params.get("page[cursor]"), "next");
    assert.equal(params.get("page[limit]"), "25");
    assert.equal(params.get("filter[label][in]"), "bug,backend");
    assert.equal(params.get("filter[priority]"), "high");
    assert.equal(params.get("filter[status][in]"), "ready,in-progress");
    assert.equal(params.get("filter[type]"), "feature");
    assert.equal(params.get("q"), "auth");
  });

  it("uses an explicit API token with the default API URL when no config token exists", async () => {
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
            discover: () =>
              Effect.succeed({
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
      assert.equal(body.result?.tools?.[0]?.name, "cycle_issue_get");
    } finally {
      await server.close();
    }
  });
});
