import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "vitest";
import {
  latestAgentTask,
  parseAgentTask,
  statusLabel,
  taskStatusTone,
} from "../src/renderer/lib/agentTasks.ts";
import { cycleApiClient, decodeRepositoryIssueCursor } from "../src/renderer/lib/cycleApiClient.ts";

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
  globalThis.window = originalWindow;
});

const installRendererApiWindow = (): void => {
  const storage = new Map<string, string>();

  globalThis.window = {
    location: {
      hash: "",
      protocol: "http:",
      search: "?cycleApiUrl=http://cycle.test&cycleApiToken=test-token",
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  } as Window & typeof globalThis;
};

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

const collectionEnvelope = (
  data: readonly unknown[],
  nextCursor: string | null = null,
  meta: Readonly<Record<string, unknown>> = {},
) => ({
  data,
  links: {
    next: null,
    self: "/",
  },
  meta: {
    requestId: "req-test",
    totalCount: null,
    ...meta,
  },
  page: {
    hasMore: nextCursor !== null,
    limit: 100,
    nextCursor,
  },
});

describe("renderer cycle API client", () => {
  it("schema-decodes repository issue cursors", () => {
    const cursor = JSON.stringify({
      __cycleRepositoryIssueCursors: {
        repo_a: "cursor-a",
        repo_b: "",
      },
    });

    assert.deepEqual(decodeRepositoryIssueCursor(cursor), {
      repo_a: "cursor-a",
    });
  });

  it("rejects malformed repository issue cursors", () => {
    assert.equal(
      decodeRepositoryIssueCursor(
        JSON.stringify({
          __cycleRepositoryIssueCursors: {
            repo_a: 42,
          },
        }),
      ),
      undefined,
    );
    assert.equal(
      decodeRepositoryIssueCursor(
        JSON.stringify({
          __cycleRepositoryIssueCursors: {},
          debug: true,
        }),
      ),
      undefined,
    );
  });

  it("parses agent tasks and formats task status", () => {
    const task = parseAgentTask(agentTaskRecord("task-a", "waiting_for_input"));

    assert.equal(task?.taskId, "task-a");
    assert.equal(task?.status, "waiting_for_input");
    assert.equal(statusLabel("waiting_for_input"), "Waiting For Input");
    assert.equal(taskStatusTone("failed"), "danger");
    assert.equal(taskStatusTone("cancelled"), "neutral");
  });

  it("selects a successful retry instead of an older blocked attempt", () => {
    const blockedTask = parseAgentTask({
      ...agentTaskRecord("task-blocked", "blocked"),
      updatedAt: "2026-07-10T14:00:00.000Z",
    });
    const completedRetry = parseAgentTask({
      ...agentTaskRecord("task-retry", "completed"),
      createdAt: "2026-07-10T14:01:00.000Z",
      metadata: {
        retryOfTaskId: "task-blocked",
      },
      updatedAt: "2026-07-10T14:05:00.000Z",
    });

    assert.ok(blockedTask);
    assert.ok(completedRetry);
    assert.equal(latestAgentTask([blockedTask, completedRetry])?.taskId, "task-retry");
  });

  it("uses canonical query parameters and adapts inbox collection pages", async () => {
    const calls: URL[] = [];
    installRendererApiWindow();

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      calls.push(url);

      if (url.pathname === "/v1/autocomplete") {
        return jsonResponse({
          data: {
            results: [],
          },
          meta: { requestId: "req-test" },
        });
      }

      if (url.pathname === "/v1/agent-tasks") {
        return jsonResponse(collectionEnvelope([]));
      }

      if (url.pathname === "/v1/inbox") {
        return jsonResponse(
          collectionEnvelope([inboxEntryRecord(1)], "cursor-2", {
            activeSnapshotIds: {
              "repo-a": "snapshot-a",
            },
          }),
        );
      }

      return jsonResponse(collectionEnvelope([]));
    };

    await cycleApiClient.autocomplete({
      limit: 25,
      query: "cy",
      types: ["repository", "ticket"],
    });
    await cycleApiClient.listAgentTasks({
      limit: 10,
      originKind: "ticket",
      repositoryId: "repo-a",
      status: "running",
      ticketId: "ISSUE-1",
    });
    const inboxPage = await cycleApiClient.call("inbox.list", {
      limit: 50,
      repositoryIds: ["repo-a", "repo-b"],
      status: "unread",
      userId: "ada@example.com",
    });

    const autocomplete = calls[0];
    assert.equal(autocomplete?.searchParams.get("q"), "cy");
    assert.equal(autocomplete?.searchParams.get("page[limit]"), "25");
    assert.equal(autocomplete?.searchParams.get("filter[type][in]"), "repository,ticket");
    assert.equal(autocomplete?.searchParams.has("types"), false);

    const agentTasks = calls[1];
    assert.equal(agentTasks?.searchParams.get("page[limit]"), "10");
    assert.equal(agentTasks?.searchParams.get("filter[originKind]"), "ticket");
    assert.equal(agentTasks?.searchParams.get("filter[repositoryId]"), "repo-a");
    assert.equal(agentTasks?.searchParams.get("filter[status]"), "running");
    assert.equal(agentTasks?.searchParams.get("filter[ticketId]"), "ISSUE-1");
    assert.equal(agentTasks?.searchParams.has("originKind"), false);
    assert.equal(agentTasks?.searchParams.has("repositoryId"), false);

    const inbox = calls[2];
    assert.equal(inbox?.searchParams.get("filter[userId]"), "ada@example.com");
    assert.equal(inbox?.searchParams.get("filter[repository][in]"), "repo-a,repo-b");
    assert.equal(inbox?.searchParams.get("filter[status]"), "unread");
    assert.equal(inbox?.searchParams.get("page[limit]"), "50");
    assert.equal(inbox?.searchParams.has("userId"), false);
    assert.equal(inbox?.searchParams.has("repositoryIds"), false);

    assert.equal(inboxPage.entries[0]?.itemId, "inbox-1");
    assert.equal(inboxPage.nextCursor, "cursor-2");
    assert.deepEqual(inboxPage.activeSnapshotIds, {
      "repo-a": "snapshot-a",
    });
  });

  it("sends empty JSON payloads for agent task control posts", async () => {
    const calls: Array<{ readonly body?: BodyInit | null; readonly url: string }> = [];
    const storage = new Map<string, string>();

    globalThis.window = {
      location: {
        hash: "",
        protocol: "http:",
        search: "?cycleApiUrl=http://cycle.test&cycleApiToken=test-token",
      },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    } as Window & typeof globalThis;
    globalThis.fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          data: {
            agentId: "agent-a",
            attempt: 0,
            authority: { mode: "read-only" },
            createdAt: "2026-07-02T00:00:00.000Z",
            maxAttempts: 1,
            metadata: {},
            origin: {
              kind: "ticket",
              repositoryId: "repo-a",
              ticketId: "ISSUE-1",
            },
            providerId: "codex",
            request: {
              authority: { mode: "read-only" },
              context: {},
              input: "Run task",
              instructions: "Run task",
              metadata: {},
              requestedBy: "tester",
            },
            rootRunId: null,
            schemaVersion: 1,
            status: "cancelled",
            taskId: "task-a",
            updatedAt: "2026-07-02T00:00:00.000Z",
          },
          meta: { requestId: "req-test" },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    await cycleApiClient.cancelAgentTask("task-a");
    await cycleApiClient.retryAgentTask("task-a");

    assert.deepEqual(
      calls.map((call) => [call.url, call.body]),
      [
        ["http://cycle.test/v1/agent-tasks/task-a/cancel", "{}"],
        ["http://cycle.test/v1/agent-tasks/task-a/retry", "{}"],
      ],
    );
  });

  it("starts ticket implementation through the durable issue task endpoint", async () => {
    installRendererApiWindow();
    let request:
      | { readonly body?: string; readonly method?: string; readonly url: string }
      | undefined;
    globalThis.fetch = async (input, init) => {
      request = {
        body: typeof init?.body === "string" ? init.body : undefined,
        method: init?.method,
        url: String(input),
      };
      return jsonResponse({
        data: {
          ...agentTaskRecord("task-ticket", "queued"),
          authority: { mode: "full-access" },
          metadata: { threadId: "agent_thread_ticket" },
          request: {
            ...agentTaskRecord("task-ticket", "queued").request,
            authority: { mode: "full-access" },
          },
        },
        meta: { requestId: "req-ticket" },
      });
    };

    const task = await cycleApiClient.startIssueAgentTask("repo-a", "ISSUE-1", {
      agentId: "codex",
      commandId: "f80af9f2-c01f-48d9-96bf-7f22511f1eaf",
      instructions: "Include regression coverage",
      providerId: "codex",
    });

    assert.equal(request?.method, "POST");
    assert.equal(
      request?.url,
      "http://cycle.test/v1/repositories/repo-a/issues/ISSUE-1/agent-tasks",
    );
    assert.deepEqual(JSON.parse(request?.body ?? "{}"), {
      agentId: "codex",
      commandId: "f80af9f2-c01f-48d9-96bf-7f22511f1eaf",
      instructions: "Include regression coverage",
      providerId: "codex",
    });
    assert.equal(task?.metadata.threadId, "agent_thread_ticket");
    assert.equal(task?.authority.mode, "full-access");
  });

  it("sends the desktop profile as explicit human actor metadata", async () => {
    const calls: Array<{
      readonly body?: BodyInit | null;
      readonly headers: Readonly<Record<string, string>>;
      readonly method?: string;
      readonly url: string;
    }> = [];

    globalThis.window = {
      cycleDesktop: {
        getApiConnection: async () => ({
          baseUrl: "http://cycle.test",
          profile: {
            displayName: "Desktop User",
            email: "desktop@example.com",
          },
          token: "test-token",
        }),
      },
      location: {
        hash: "",
        protocol: "http:",
        search: "",
      },
    } as Window & typeof globalThis;
    globalThis.fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        method: init?.method,
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          data: archivedIssueRecord("ISSUE-1"),
          meta: { requestId: "req-test" },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    await cycleApiClient.call("ticket.issue.update", {
      input: {
        id: "ISSUE-1",
        patch: {
          frontmatter: {
            status: "done",
          },
        },
      },
      repository: {
        id: "repo-a",
      },
    });

    assert.equal(calls[0]?.url, "http://cycle.test/v1/repositories/repo-a/issues/ISSUE-1");
    assert.equal(calls[0]?.headers["x-cycle-actor-type"], "human");
    assert.equal(calls[0]?.headers["x-cycle-actor-name"], "Desktop User");
    assert.equal(calls[0]?.headers["x-cycle-actor-email"], "desktop@example.com");
    assert.equal(calls[0]?.headers["x-cycle-source"], "desktop");
  });

  it("archives issues through the repository issue archive endpoint", async () => {
    const calls: Array<{
      readonly body?: BodyInit | null;
      readonly method?: string;
      readonly url: string;
    }> = [];
    const storage = new Map<string, string>();

    globalThis.window = {
      location: {
        hash: "",
        protocol: "http:",
        search: "?cycleApiUrl=http://cycle.test&cycleApiToken=test-token",
      },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    } as Window & typeof globalThis;
    globalThis.fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        method: init?.method,
        url: String(input),
      });

      return new Response(
        JSON.stringify({
          data: archivedIssueRecord("ISSUE-1"),
          meta: { requestId: "req-test" },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    const result = await cycleApiClient.call("ticket.issue.archive", {
      input: {
        id: "ISSUE-1",
      },
      repository: {
        id: "repo-a",
      },
    });

    assert.equal(result.archivedAt, "2026-07-03T10:00:00.000Z");
    assert.deepEqual(calls, [
      {
        body: "{}",
        method: "POST",
        url: "http://cycle.test/v1/repositories/repo-a/issues/ISSUE-1/archive",
      },
    ]);
  });

  it("starts ticket draft chats with repository context", async () => {
    const storage = new Map<string, string>();
    const sockets: MockWebSocket[] = [];

    class MockWebSocket {
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      readyState = 1;
      readonly sent: string[] = [];
      readonly url: string;

      constructor(url: string | URL) {
        this.url = String(url);
        sockets.push(this);
        queueMicrotask(() => this.onopen?.({} as Event));
      }

      close() {
        this.readyState = 3;
        this.onclose?.({} as CloseEvent);
      }

      send(raw: string) {
        this.sent.push(raw);
        const message = JSON.parse(raw) as { commandId?: string; payload?: unknown; type: string };

        if (message.type === "connection.authenticate") {
          this.reply({
            type: "connection.ready",
            version: 1,
          });
          return;
        }

        if (message.type === "thread.create") {
          const payload = message.payload as { readonly origin?: { readonly kind?: string } };
          const threadId =
            payload.origin?.kind === "ticket-agent-work" ? "thread-work" : "thread-draft";
          this.reply({
            commandId: message.commandId,
            payload: {
              result: {
                thread: {
                  id: threadId,
                },
              },
              type: "thread.create",
            },
            type: "command.ack",
            version: 1,
          });
          return;
        }

        if (message.type === "turn.send") {
          this.reply({
            commandId: message.commandId,
            payload: {
              result: {},
              type: "turn.send",
            },
            type: "command.ack",
            version: 1,
          });
        }
      }

      private reply(message: unknown) {
        queueMicrotask(() =>
          this.onmessage?.({
            data: JSON.stringify(message),
          } as MessageEvent),
        );
      }
    }

    globalThis.window = {
      clearTimeout,
      location: {
        hash: "",
        origin: "http://renderer.test",
        protocol: "http:",
        search: "?cycleApiUrl=http://cycle.test&cycleApiToken=test-token",
      },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
      setTimeout,
    } as Window & typeof globalThis;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    const result = await cycleApiClient.startTicketDraftChat({
      instructions: "Draft login bug",
      repository: {
        displayName: "Cycle",
        id: "repo-cycle",
        path: "/tmp/cycle",
      },
    });

    assert.deepEqual(result, { threadId: "thread-draft" });
    assert.equal(sockets[0]?.url, "ws://cycle.test/v1/chat/ws");

    const sent = sockets[0]?.sent.map((raw) => JSON.parse(raw) as any) ?? [];
    const createThread = sent.find((message) => message.type === "thread.create");
    const sendTurn = sent.find((message) => message.type === "turn.send");

    assert.deepEqual(sent[0]?.payload, { token: "test-token" });
    assert.equal(createThread?.payload.origin.repositoryId, "repo-cycle");
    assert.equal(createThread?.payload.runtimeMode, "workspace-write");
    assert.equal(sendTurn?.payload.threadId, "thread-draft");
    assert.match(
      sendTurn?.payload.message,
      /Target repository: cycle:\/\/repository\/repo-cycle \(Cycle\)/u,
    );
    assert.match(sendTurn?.payload.message, /Draft login bug/u);
  });
});

const agentTaskRecord = (taskId: string, status: string) => ({
  agentId: "agent-a",
  attempt: 0,
  authority: { mode: "read-only" },
  createdAt: "2026-07-02T00:00:00.000Z",
  maxAttempts: 1,
  metadata: {},
  providerId: "codex",
  request: {
    authority: { mode: "read-only" },
    context: {},
    input: "Run task",
    instructions: "Run task",
    metadata: {},
    requestedBy: "tester",
  },
  rootRunId: null,
  schemaVersion: 1,
  status,
  taskId,
  updatedAt: "2026-07-02T00:00:00.000Z",
});

const inboxEntryRecord = (index: number) => ({
  actor: {
    email: "ada@example.com",
    name: "Ada Lovelace",
  },
  bodyExcerpt: `Excerpt ${index}`,
  createdAt: "2026-07-04T10:00:00.000Z",
  eventPath: `event-${index}`,
  itemId: `inbox-${index}`,
  reason: "mention",
  recordId: `record-${index}`,
  repositoryId: "repo-a",
  sequence: index,
  snapshotId: `snapshot-${index}`,
  sourceState: "active",
  status: "unread",
  ticketId: `ISSUE-${index}`,
  title: `Inbox item ${index}`,
});

const archivedIssueRecord = (id: string) => ({
  archivedAt: "2026-07-03T10:00:00.000Z",
  body: "Test body",
  bodyFormat: "markdown",
  createdBy: "tester",
  frontmatter: {
    archivedAt: "2026-07-03T10:00:00.000Z",
    archivedBy: {
      name: "Tester",
      type: "human",
    },
    createdAt: "2026-07-01T10:00:00.000Z",
    createdBy: {
      name: "Tester",
      type: "human",
    },
    id,
    priority: "medium",
    status: "todo",
    title: "Archive me",
    type: "issue",
    updatedAt: "2026-07-03T10:00:00.000Z",
  },
  id,
  parent: "none",
  priority: "medium",
  repositoryId: "repo-a",
  schemaVersion: 1,
  status: "todo",
  title: "Archive me",
  type: "issue",
  updatedDate: "2026-07-03",
});
