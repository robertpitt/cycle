import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { describe, it } from "vitest";
import { runCycleCli, type CliIo } from "../src/index.ts";

const makeIo = (
  fetchImpl: typeof fetch,
): CliIo & { stderrText: () => string; stdoutText: () => string } => {
  let stdout = "";
  let stderr = "";

  return {
    cwd: "/tmp",
    env: {
      CYCLE_API_TOKEN: "token",
      CYCLE_API_URL: "http://cycle.test",
    },
    fetch: fetchImpl,
    stderr: {
      write: (chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
      },
    },
    stderrText: () => stderr,
    stdin: Readable.from([]) as NodeJS.ReadStream,
    stdout: {
      write: (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      },
    },
    stdoutText: () => stdout,
  };
};

describe("@cycle/cli", () => {
  it("runs the status command through effect/unstable/cli", async () => {
    const io = makeIo(async (request, init) => {
      const requestObject = request instanceof Request ? request : new Request(request, init);

      assert.equal(String(requestObject.url), "http://cycle.test/v1/status");
      assert.equal(requestObject.headers.get("authorization"), "Bearer token");

      return Response.json({
        data: {
          status: "ok",
        },
        meta: {
          requestId: "req_cli",
        },
      });
    });

    const exitCode = await runCycleCli(["--json", "status"], io);

    assert.equal(exitCode, 0);
    assert.equal(io.stderrText(), "");
    const output = JSON.parse(io.stdoutText()) as { data?: { status?: string } };
    assert.equal(output.data?.status, "ok");
  });

  it("maps API authentication failures to exit code 3", async () => {
    const io = makeIo(async () =>
      Response.json(
        {
          error: {
            code: "UNAUTHORIZED",
            details: {},
            message: "Missing or invalid API credentials.",
            requestId: "req_cli",
            retryable: false,
          },
        },
        { status: 401 },
      ),
    );

    const exitCode = await runCycleCli(["--json", "status"], io);

    assert.equal(exitCode, 3);
    const output = JSON.parse(io.stderrText()) as { error?: { code?: string } };
    assert.equal(output.error?.code, "UNAUTHORIZED");
  });

  it("sends issue transition commands to the REST API", async () => {
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    const io = makeIo(async (request, init) => {
      const requestObject = request instanceof Request ? request : new Request(request, init);
      const text = await requestObject.text();
      const body = text.length === 0 ? undefined : JSON.parse(text);
      requests.push({
        ...(body === undefined ? {} : { body }),
        method: requestObject.method,
        url: String(requestObject.url),
      });

      if (requestObject.method === "GET") {
        return Response.json({
          data: {
            repositoryId: "repo-1",
          },
        });
      }

      return Response.json({
        data: {
          id: "ISSUE-1",
          status: "done",
          title: "Finished",
        },
        meta: {
          requestId: "req_transition",
        },
      });
    });

    const exitCode = await runCycleCli(
      [
        "--json",
        "issue",
        "transition",
        "--repository",
        "repo-1",
        "--issue-id",
        "ISSUE-1",
        "--status",
        "done",
      ],
      io,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(requests, [
      {
        method: "GET",
        url: "http://cycle.test/v1/repositories/repo-1",
      },
      {
        body: {
          status: "done",
        },
        method: "POST",
        url: "http://cycle.test/v1/repositories/repo-1/issues/ISSUE-1/transitions",
      },
    ]);
    const output = JSON.parse(io.stdoutText()) as { data?: { status?: string } };
    assert.equal(output.data?.status, "done");
  });

  it("renders nested full-text issue search results in human output", async () => {
    const io = makeIo(async (request, init) => {
      const requestObject = request instanceof Request ? request : new Request(request, init);
      const url = new URL(requestObject.url);

      if (url.pathname === "/v1/repositories/repo-1") {
        return Response.json({ data: { repositoryId: "repo-1" } });
      }

      assert.equal(url.pathname, "/v1/repositories/repo-1/issues");
      assert.equal(url.searchParams.get("q"), "cycle");
      return Response.json({
        data: [
          {
            matchedFields: ["title"],
            ticket: {
              frontmatter: { title: "Search Cycle tickets" },
              id: "CYC-42",
              status: "todo",
            },
          },
        ],
      });
    });

    const exitCode = await runCycleCli(
      ["issue", "list", "--repository", "repo-1", "--q", "cycle"],
      io,
    );

    assert.equal(exitCode, 0);
    assert.equal(io.stderrText(), "");
    assert.equal(io.stdoutText().trim(), "CYC-42 todo Search Cycle tickets");
  });

  it("routes the completed REST command families to their registered v1 endpoints", async () => {
    const cases: ReadonlyArray<{
      readonly argv: ReadonlyArray<string>;
      readonly body?: unknown;
      readonly method: string;
      readonly path: string;
    }> = [
      {
        argv: [
          "comments",
          "archive",
          "--repository",
          "repo-1",
          "--issue-id",
          "ISSUE-1",
          "--comment-id",
          "comment-1",
          "--reason",
          "resolved",
        ],
        body: { reason: "resolved" },
        method: "POST",
        path: "/v1/repositories/repo-1/issues/ISSUE-1/comments/comment-1/archive",
      },
      {
        argv: [
          "pages",
          "archive",
          "--repository",
          "repo-1",
          "--page-id",
          "page-1",
          "--expected-revision-id",
          "revision-1",
        ],
        body: { expectedRevisionId: "revision-1" },
        method: "POST",
        path: "/v1/repositories/repo-1/pages/page-1/archive",
      },
      {
        argv: ["views", "archive", "--repository", "repo-1", "--view-id", "view-1"],
        method: "POST",
        path: "/v1/repositories/repo-1/views/view-1/archive",
      },
      {
        argv: ["drafts", "commit", "--repository", "repo-1", "--draft-id", "draft-1"],
        method: "POST",
        path: "/v1/repositories/repo-1/drafts/draft-1/commit",
      },
      {
        argv: ["templates", "archive", "--repository", "repo-1", "--template-id", "template-1"],
        method: "POST",
        path: "/v1/repositories/repo-1/templates/template-1/archive",
      },
      {
        argv: ["labels", "upsert", "--repository", "repo-1", "--label-id", "bug", "--name", "Bug"],
        body: { id: "bug", name: "Bug" },
        method: "PUT",
        path: "/v1/repositories/repo-1/labels/bug",
      },
      {
        argv: [
          "users",
          "upsert",
          "--repository",
          "repo-1",
          "--user-id",
          "user-1",
          "--display-name",
          "User One",
        ],
        body: { displayName: "User One" },
        method: "PUT",
        path: "/v1/repositories/repo-1/users/user-1",
      },
      {
        argv: [
          "initiatives",
          "update",
          "--repository",
          "repo-1",
          "--initiative-id",
          "INIT-1",
          "--status",
          "on-track",
          "--summary",
          "Healthy",
        ],
        body: { status: "on-track", summary: "Healthy" },
        method: "POST",
        path: "/v1/repositories/repo-1/initiatives/INIT-1/updates",
      },
      {
        argv: ["agent-tasks", "events", "--task-id", "task-1"],
        method: "GET",
        path: "/v1/agent-tasks/task-1/events",
      },
      {
        argv: ["repositories", "warnings", "--repository", "repo-1"],
        method: "GET",
        path: "/v1/repositories/repo-1/warnings",
      },
      {
        argv: [
          "issue",
          "relations",
          "add",
          "--repository",
          "repo-1",
          "--issue-id",
          "ISSUE-1",
          "--related-issue-id",
          "ISSUE-2",
          "--type",
          "blocks",
        ],
        body: { issueId: "ISSUE-2", type: "blocks" },
        method: "POST",
        path: "/v1/repositories/repo-1/issues/ISSUE-1/relations",
      },
    ];

    for (const testCase of cases) {
      const requests: Array<{ body?: unknown; method: string; path: string }> = [];
      const io = makeIo(async (request, init) => {
        const requestObject = request instanceof Request ? request : new Request(request, init);
        const text = await requestObject.text();
        requests.push({
          ...(text.length === 0 ? {} : { body: JSON.parse(text) as unknown }),
          method: requestObject.method,
          path: new URL(requestObject.url).pathname + new URL(requestObject.url).search,
        });

        if (
          requestObject.method === "GET" &&
          new URL(requestObject.url).pathname === "/v1/repositories/repo-1"
        ) {
          return Response.json({ data: { repositoryId: "repo-1" } });
        }

        return Response.json({ data: { id: "resource-1" } });
      });

      const exitCode = await runCycleCli(["--json", ...testCase.argv], io);
      assert.equal(exitCode, 0, `${testCase.argv.join(" ")} failed: ${io.stderrText()}`);
      assert.deepEqual(requests.at(-1), {
        ...(testCase.body === undefined ? {} : { body: testCase.body }),
        method: testCase.method,
        path: testCase.path,
      });
    }
  });

  it("exposes chat through the authenticated WebSocket protocol", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const listeners = new Map<string, (event: { readonly data?: unknown }) => void>();
    const baseIo = makeIo(async () => Response.json({ data: {} }));
    const io: CliIo & { stderrText: () => string; stdoutText: () => string } = {
      ...baseIo,
      webSocketFactory: (url) => {
        assert.equal(url, "ws://cycle.test/v1/chat/ws");
        queueMicrotask(() => listeners.get("open")?.({}));
        return {
          addEventListener: (type, listener) => listeners.set(type, listener),
          close: () => undefined,
          send: (raw) => {
            const message = JSON.parse(raw) as Record<string, unknown>;
            sent.push(message);
            if (message.type === "connection.authenticate") {
              queueMicrotask(() =>
                listeners.get("message")?.({
                  data: JSON.stringify({ type: "connection.ready", version: 1 }),
                }),
              );
              return;
            }
            queueMicrotask(() =>
              listeners.get("message")?.({
                data: JSON.stringify({
                  commandId: message.commandId,
                  payload: { threads: [] },
                  type: "thread.list.snapshot",
                  version: 1,
                }),
              }),
            );
          },
        };
      },
    };

    const exitCode = await runCycleCli(["--json", "chat", "list"], io);

    assert.equal(exitCode, 0);
    assert.equal(sent[0]?.type, "connection.authenticate");
    assert.equal(sent[1]?.type, "thread.list");
    const output = JSON.parse(io.stdoutText()) as { data?: { threads?: unknown[] } };
    assert.deepEqual(output.data?.threads, []);
  });

  it("generates installable shell completion scripts", async () => {
    const run = promisify(execFile);
    const result = await run(process.execPath, ["src/bin.ts", "--completions", "bash"], {
      cwd: process.cwd(),
    });

    assert.match(result.stdout, /begin-cycle-completions/);
    assert.match(result.stdout, /agent-tasks/);
    assert.match(result.stdout, /templates/);
  });
});
