import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "vitest";
import { parseAgentTask, statusLabel, taskStatusTone } from "../src/renderer/lib/agentTasks.ts";
import { cycleApiClient, decodeRepositoryIssueCursor } from "../src/renderer/lib/cycleApiClient.ts";

const originalFetch = globalThis.fetch;
const originalWebSocket = globalThis.WebSocket;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalWebSocket;
  globalThis.window = originalWindow;
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

    const workResult = await cycleApiClient.startIssueAgentChat({
      instructions: "Implement this with tests",
      issue: {
        id: "CYC-123",
        status: "todo",
        title: "Fix login redirect",
        type: "bug",
      },
      model: "gpt-test",
      providerId: "codex",
      repository: {
        displayName: "Cycle",
        id: "repo-cycle",
        path: "/tmp/cycle",
      },
    });

    assert.deepEqual(workResult, { threadId: "thread-work" });

    const workSent = sockets[1]?.sent.map((raw) => JSON.parse(raw) as any) ?? [];
    const workCreateThread = workSent.find((message) => message.type === "thread.create");
    const workSendTurn = workSent.find((message) => message.type === "turn.send");

    assert.equal(workCreateThread?.payload.origin.kind, "ticket-agent-work");
    assert.equal(workCreateThread?.payload.origin.repositoryId, "repo-cycle");
    assert.equal(workCreateThread?.payload.origin.issueId, "CYC-123");
    assert.equal(workCreateThread?.payload.runtimeMode, "workspace-write");
    assert.equal(workCreateThread?.payload.model, "gpt-test");
    assert.equal(workSendTurn?.payload.threadId, "thread-work");
    assert.match(
      workSendTurn?.payload.message,
      /Ticket: cycle:\/\/repository\/repo-cycle\/tickets\/CYC-123/u,
    );
    assert.match(workSendTurn?.payload.message, /Implement this with tests/u);
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
