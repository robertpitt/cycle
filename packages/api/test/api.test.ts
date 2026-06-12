import { strict as assert } from "node:assert";
import { type CycleUseCase, type TicketDocument } from "@cycle/contracts";
import { type UseCaseRunnerShape } from "@cycle/usecases";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { makeCycleApi, startCycleApiServer } from "../src/index.ts";

const repository = { id: "test-repository" };
const token = "test-token";

const makeRepositoryStatus = () => ({
  activeGeneration: 1,
  activeSnapshotId: null,
  repositoryId: repository.id,
  status: "ready" as const,
  warningCount: 0,
});

const makeIssue = (id: string, title: string, body: string): TicketDocument =>
  ({
    body,
    bodyFormat: "markdown",
    createdBy: "test",
    frontmatter: {
      createdAt: "2026-06-12T00:00:00.000Z",
      createdBy: {
        name: "Test",
        type: "agent",
      },
      id,
      priority: "normal",
      status: "todo",
      title,
      type: "task",
      updatedAt: "2026-06-12T00:00:00.000Z",
    },
    id,
    parent: "",
    priority: "normal",
    schemaVersion: 1,
    status: "todo",
    title,
    type: "task",
    updatedDate: "2026-06-12",
  }) as TicketDocument;

const makeTestApi = () => {
  const calls: Array<string> = [];
  const issues: Array<TicketDocument> = [];
  const runner: UseCaseRunnerShape = {
    run: (useCase: CycleUseCase) =>
      Effect.sync(() => {
        calls.push(useCase.name);

        switch (useCase.name) {
          case "RepositoryList":
            return [makeRepositoryStatus()] as never;
          case "RepositoryOpen":
          case "RepositoryStatusGet":
          case "RepositorySync":
            return makeRepositoryStatus() as never;
          case "RepositoryMaterializationWarningsList":
            return [] as never;
          case "RepositoryHistoryList":
            return { entries: [] } as never;
          case "IssueCreate": {
            const input = (useCase.input as any).input as {
              readonly body?: string;
              readonly title: string;
            };
            const issue = makeIssue("ISSUE-1", input.title, input.body ?? "");
            issues.push(issue);
            return issue as never;
          }
          case "IssueGet":
            return (issues.find((issue) => issue.id === (useCase.input as any).input.id) ??
              null) as never;
          case "IssueList":
            return {
              entries: issues,
            } as never;
          case "IssueTransition": {
            const input = (useCase.input as any).input as {
              readonly id: string;
              readonly status: string;
            };
            const index = issues.findIndex((issue) => issue.id === input.id);
            if (index < 0) return null as never;
            const current = issues[index] as TicketDocument;
            const updated = {
              ...current,
              frontmatter: {
                ...current.frontmatter,
                status: input.status,
              },
              status: input.status,
            } as TicketDocument;
            issues[index] = updated;
            return updated as never;
          }
          default:
            throw new Error(`Unexpected usecase: ${useCase.name}`);
        }
      }),
  };

  return {
    api: makeCycleApi({
      runner,
      staticToken: token,
    }),
    calls,
  };
};

const authed = (body?: unknown): RequestInit => ({
  body: body === undefined ? undefined : JSON.stringify(body),
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-request-id": "req_test",
  },
});

describe("@cycle/api", () => {
  it("serves health and generated OpenAPI from HttpApi", async () => {
    const { api } = makeTestApi();

    try {
      const health = await api.fetch(
        new Request("http://cycle.test/health", {
          headers: {
            origin: "http://localhost:5173",
          },
        }),
      );
      assert.equal(health.status, 200);
      assert.equal(health.headers.get("access-control-allow-origin"), "*");

      const spec = await api.fetch(new Request("http://cycle.test/spec.json"));
      const body = (await spec.json()) as { openapi?: string; paths?: Record<string, unknown> };
      assert.equal(spec.status, 200);
      assert.equal(body.openapi, "3.1.0");
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/issues"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/transitions"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/drafts/{draftId}/commit"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/labels/{labelId}"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/templates/{templateId}/archive"]);
    } finally {
      await api.dispose();
    }
  });

  it("rejects invalid bearer tokens with the standard error envelope", async () => {
    const { api } = makeTestApi();

    try {
      const response = await api.fetch(
        new Request("http://cycle.test/v1/status", {
          headers: {
            authorization: "Bearer wrong",
            "x-request-id": "req_auth",
          },
        }),
      );
      const body = (await response.json()) as { error?: { code?: string; requestId?: string } };

      assert.equal(response.status, 401);
      assert.equal(response.headers.get("x-request-id"), "req_auth");
      assert.equal(body.error?.code, "UNAUTHORIZED");
      assert.equal(body.error?.requestId, "req_auth");
    } finally {
      await api.dispose();
    }
  });

  it("hosts MCP on the same server without applying MCP auth globally", async () => {
    const handle = await startCycleApiServer({
      mcp: {
        enabled: true,
      },
      runner: {
        run: (useCase: CycleUseCase) =>
          Effect.die(new Error(`Unexpected usecase: ${useCase.name}`)),
      },
      staticToken: token,
    });

    try {
      const health = await fetch(`${handle.baseUrl}/health`);
      assert.equal(health.status, 200);

      const preflight = await fetch(`${handle.baseUrl}/mcp`, {
        headers: {
          "access-control-request-headers": "authorization, content-type",
          "access-control-request-method": "POST",
          origin: "http://localhost:5173",
        },
        method: "OPTIONS",
      });
      const mcp = await fetch(`${handle.baseUrl}/mcp`, {
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
      const tools = await fetch(`${handle.baseUrl}/mcp`, {
        body: JSON.stringify({
          id: 2,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
        }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
      });
      const toolsBody = (await tools.json()) as {
        result?: {
          readonly tools?: ReadonlyArray<{ readonly name?: string }>;
        };
      };

      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
      assert.equal(
        preflight.headers.get("access-control-allow-headers"),
        "authorization, content-type",
      );
      assert.equal(mcp.status, 401);
      assert.equal(mcp.headers.get("access-control-allow-origin"), "*");
      assert.equal(tools.status, 200);
      assert.equal(toolsBody.result?.tools?.[0]?.name, "cycle_issue_get");
    } finally {
      await handle.close();
    }
  });

  it("creates and lists issues through the usecase runner", async () => {
    const { api, calls } = makeTestApi();

    try {
      const created = await api.fetch(
        new Request(`http://cycle.test/v1/repositories/${repository.id}/issues`, {
          ...authed({
            body: "Initial body",
            title: "Build the API package",
          }),
          method: "POST",
        }),
      );
      const createdBody = (await created.json()) as { data?: { id?: string } };

      assert.equal(created.status, 201);
      assert.equal(created.headers.get("x-request-id"), "req_test");
      assert.equal(createdBody.data?.id, "ISSUE-1");

      const listed = await api.fetch(
        new Request(`http://cycle.test/v1/repositories/${repository.id}/issues`, authed()),
      );
      const listedBody = (await listed.json()) as { data?: ReadonlyArray<{ id?: string }> };

      assert.equal(listed.status, 200);
      assert.equal(listedBody.data?.length, 1);
      assert.equal(listedBody.data?.[0]?.id, createdBody.data?.id);
      assert.deepEqual(calls, ["IssueCreate", "IssueList"]);
    } finally {
      await api.dispose();
    }
  });

  it("maps transition routes to the canonical issue transition usecase", async () => {
    const { api, calls } = makeTestApi();

    try {
      await api.fetch(
        new Request(`http://cycle.test/v1/repositories/${repository.id}/issues`, {
          ...authed({
            title: "Transition me",
          }),
          method: "POST",
        }),
      );

      const response = await api.fetch(
        new Request(
          `http://cycle.test/v1/repositories/${repository.id}/issues/ISSUE-1/transitions`,
          {
            ...authed({
              status: "in-progress",
            }),
            method: "POST",
          },
        ),
      );
      const body = (await response.json()) as { data?: { status?: string } };

      assert.equal(response.status, 200);
      assert.equal(body.data?.status, "in-progress");
      assert.deepEqual(calls, ["IssueCreate", "IssueTransition"]);
    } finally {
      await api.dispose();
    }
  });

  it("returns a standard unsupported error for comment archive until a usecase exists", async () => {
    const { api } = makeTestApi();

    try {
      const response = await api.fetch(
        new Request(
          `http://cycle.test/v1/repositories/${repository.id}/issues/ISSUE-1/comments/comment-1/archive`,
          {
            ...authed({}),
            method: "POST",
          },
        ),
      );
      const body = (await response.json()) as { error?: { code?: string; retryable?: boolean } };

      assert.equal(response.status, 501);
      assert.equal(body.error?.code, "COMMENT_ARCHIVE_UNAVAILABLE");
      assert.equal(body.error?.retryable, false);
    } finally {
      await api.dispose();
    }
  });
});
