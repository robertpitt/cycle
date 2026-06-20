import { strict as assert } from "node:assert";
import { makeCodexAppServerClient, type CodexAppServerClient } from "@cycle/codex-app-server";
import { Schema } from "effect";
import { describe, it } from "vitest";
import { makeCodexAgentService } from "../src/codex.ts";
import { parseStructured } from "../src/providers/codex/client.ts";
import type { AgentEvent, AgentSessionBinding, AgentSessionStore } from "../src/types.ts";

class Pushable<T> implements AsyncIterable<T> {
  private ended = false;
  private readonly items: T[] = [];
  private readonly waiters: Array<(value: IteratorResult<T>) => void> = [];

  push(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter === undefined) {
      this.items.push(item);
      return;
    }
    waiter({ done: false, value: item });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ done: false, value: item });
        if (this.ended) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

type ClientMessage = {
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
};

const makeMockPeer = (): {
  readonly client: CodexAppServerClient;
  readonly expectNotification: (method: string) => Promise<ClientMessage>;
  readonly expectRequest: (
    method: string,
  ) => Promise<ClientMessage & { readonly id: number | string }>;
  readonly notify: (method: string, params: unknown) => void;
  readonly respond: (id: string | number, result: unknown) => void;
  readonly serverRequest: (method: string, params: unknown) => Promise<ClientMessage>;
} => {
  const input = new Pushable<string>();
  const output = new Pushable<ClientMessage>();
  let serverRequestId = 1000;
  const client = makeCodexAppServerClient({
    transport: {
      input,
      send: (line) => output.push(JSON.parse(line.trim()) as ClientMessage),
    },
  });

  const nextMatching = async (
    predicate: (message: ClientMessage) => boolean,
  ): Promise<ClientMessage> => {
    for await (const message of output) {
      if (predicate(message)) return message;
    }
    throw new Error("Mock peer output ended.");
  };

  return {
    client,
    expectNotification: (method) =>
      nextMatching((message) => message.id === undefined && message.method === method),
    expectRequest: async (method) => {
      const message = await nextMatching(
        (candidate) => candidate.id !== undefined && candidate.method === method,
      );
      assert.ok(message.id !== undefined);
      return message as ClientMessage & { readonly id: number | string };
    },
    notify: (method, params) => {
      input.push(JSON.stringify({ method, params }) + "\n");
    },
    respond: (id, result) => {
      input.push(JSON.stringify({ id, result }) + "\n");
    },
    serverRequest: async (method, params) => {
      const id = `server_req_${++serverRequestId}`;
      input.push(JSON.stringify({ id, method, params }) + "\n");
      return nextMatching((message) => message.id === id);
    },
  };
};

const completeStartup = async (
  peer: ReturnType<typeof makeMockPeer>,
  options: {
    readonly approvalPolicy?: string;
    readonly sandbox?: string;
  } = {},
) => {
  const initialize = await peer.expectRequest("initialize");
  peer.respond(initialize.id, {
    platformFamily: "unix",
    platformOs: "macos",
    userAgent: "mock-codex",
  });
  await peer.expectNotification("initialized");
  const threadStart = await peer.expectRequest("thread/start");
  const params = threadStart.params as Record<string, unknown>;
  if (options.approvalPolicy !== undefined)
    assert.equal(params.approvalPolicy, options.approvalPolicy);
  if (options.sandbox !== undefined) assert.equal(params.sandbox, options.sandbox);
  peer.respond(threadStart.id, {
    approvalPolicy: params.approvalPolicy,
    cwd: params.cwd ?? "/tmp/cycle",
    model: params.model ?? "gpt-test",
    thread: {
      id: "native_thread",
      turns: [],
    },
  });
};

const startTurn = async (peer: ReturnType<typeof makeMockPeer>) => {
  const turnStart = await peer.expectRequest("turn/start");
  peer.respond(turnStart.id, {
    turn: {
      id: "native_turn",
      status: "inProgress",
    },
  });
  peer.notify("turn/started", {
    threadId: "native_thread",
    turn: {
      id: "native_turn",
      status: "inProgress",
    },
  });
};

describe("@cycle/agents codex app-server adapter", () => {
  it("schema-decodes structured output strictly", () => {
    const StructuredOutput = Schema.Struct({
      title: Schema.String,
    });
    const format = {
      effectSchema: StructuredOutput,
      schema: {
        additionalProperties: false,
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        type: "object",
      },
      type: "json_schema",
    } as const;

    assert.deepEqual(parseStructured(format, JSON.stringify({ title: "Plan" })), {
      title: "Plan",
    });
    assert.throws(() => parseStructured(format, JSON.stringify({ debug: true, title: "Plan" })));
  });

  it("streams normalized events and persists app-server session binding state", async () => {
    const peer = makeMockPeer();
    const bindings = new Map<string, AgentSessionBinding>();
    const sessionStore: AgentSessionStore = {
      get: async (sessionId) => bindings.get(sessionId),
      upsert: async (binding) => {
        bindings.set(binding.sessionId, binding);
      },
    };
    const service = makeCodexAgentService({
      appServerClient: peer.client,
      sessionStore,
    });
    const session = await service.createSession({
      runtimeMode: "workspace-write",
      title: "App server chat",
    });
    const eventsPromise = collect(
      service.stream(session.id, {
        context: {
          cwd: "/tmp/cycle",
          threadId: "thread_ui",
        },
        input: "Stream a response",
        model: {
          id: "gpt-test",
        },
      }),
    );

    await completeStartup(peer, {
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
    });
    await startTurn(peer);
    peer.notify("item/agentMessage/delta", {
      delta: "Hello",
      itemId: "message_1",
      threadId: "native_thread",
      turnId: "native_turn",
    });
    peer.notify("turn/plan/updated", {
      plan: [{ status: "pending", step: "Check the repo" }],
      threadId: "native_thread",
      turnId: "native_turn",
    });
    peer.notify("turn/completed", {
      threadId: "native_thread",
      turn: {
        id: "native_turn",
        status: "completed",
      },
      usage: {
        input_tokens: 3,
        output_tokens: 2,
      },
    });

    const events = await eventsPromise;
    assert.deepEqual(
      events.map((event) => event.type),
      [
        "turn.started",
        "content.delta",
        "text.delta",
        "turn.plan.updated",
        "usage",
        "turn.completed",
      ],
    );
    const completed = events.find((event) => event.type === "turn.completed");
    assert.equal(completed?.type, "turn.completed");
    assert.equal(completed?.result.text, "Hello");
    assert.equal(completed?.result.usage?.totalTokens, 5);

    const stored = bindings.get(session.id);
    assert.equal(stored?.native?.threadId, "native_thread");
    assert.deepEqual(stored?.native?.resumeCursor, { threadId: "native_thread" });
    assert.equal(stored?.native?.runtimeMode, "workspace-write");
    assert.equal(stored?.status, "idle");
  });

  it("schema-decodes structured app-server stream results", async () => {
    const peer = makeMockPeer();
    const service = makeCodexAgentService({ appServerClient: peer.client });
    const session = await service.createSession();
    const StructuredOutput = Schema.Struct({
      title: Schema.String,
    });
    const eventsPromise = collect(
      service.stream(session.id, {
        input: "Return JSON",
        responseFormat: {
          effectSchema: StructuredOutput,
          schema: {
            additionalProperties: false,
            properties: {
              title: { type: "string" },
            },
            required: ["title"],
            type: "object",
          },
          type: "json_schema",
        },
      }),
    );

    await completeStartup(peer);
    await startTurn(peer);
    peer.notify("item/agentMessage/delta", {
      delta: JSON.stringify({ title: "Plan" }),
      itemId: "message_1",
      threadId: "native_thread",
      turnId: "native_turn",
    });
    peer.notify("turn/completed", {
      threadId: "native_thread",
      turn: {
        id: "native_turn",
        status: "completed",
      },
    });

    const events = await eventsPromise;
    const completed = events.find((event) => event.type === "turn.completed");
    assert.equal(completed?.type, "turn.completed");
    assert.deepEqual(completed.result.structured, { title: "Plan" });
  });

  it("preloads Cycle MCP before starting an app-server turn", async () => {
    const peer = makeMockPeer();
    const service = makeCodexAgentService({ appServerClient: peer.client });
    const session = await service.createSession();
    const eventsPromise = collect(
      service.stream(session.id, {
        context: {
          cwd: "/tmp/cycle",
        },
        input: "List MCPs",
        mcp: {
          headers: {
            authorization: "Bearer test-token",
          },
          mode: "http",
          url: "http://127.0.0.1:4738/mcp",
        },
      }),
    );

    const initialize = await peer.expectRequest("initialize");
    peer.respond(initialize.id, {
      platformFamily: "unix",
      platformOs: "macos",
      userAgent: "mock-codex",
    });
    await peer.expectNotification("initialized");
    const threadStart = await peer.expectRequest("thread/start");
    assert.deepEqual((threadStart.params as Record<string, unknown>).config, {
      mcp_servers: {
        cycle: {
          bearer_token_env_var: "CYCLE_AGENT_MCP_TOKEN",
          enabled: true,
          url: "http://127.0.0.1:4738/mcp",
        },
      },
    });
    peer.respond(threadStart.id, {
      cwd: "/tmp/cycle",
      model: "gpt-test",
      thread: {
        id: "native_thread",
        turns: [],
      },
    });

    const reload = await peer.expectRequest("config/mcpServer/reload");
    assert.equal(reload.params, undefined);
    peer.respond(reload.id, {});
    const status = await peer.expectRequest("mcpServerStatus/list");
    assert.deepEqual(status.params, {
      detail: "full",
      threadId: "native_thread",
    });
    peer.respond(status.id, {
      data: [
        {
          authStatus: "bearerToken",
          name: "cycle",
          resourceTemplates: [],
          resources: [],
          serverInfo: {
            name: "cycle",
            version: "0.0.0",
          },
          tools: {
            cycle_issue_list: {
              description: "List Cycle issues.",
              inputSchema: {
                type: "object",
              },
              name: "cycle_issue_list",
            },
          },
        },
      ],
      nextCursor: null,
    });

    await startTurn(peer);
    peer.notify("turn/completed", {
      threadId: "native_thread",
      turn: {
        id: "native_turn",
        status: "completed",
      },
    });

    const events = await eventsPromise;
    assert.equal(events.at(-1)?.type, "turn.completed");
  });

  it("warns when Cycle MCP warm-up reports no tools", async () => {
    const peer = makeMockPeer();
    const service = makeCodexAgentService({ appServerClient: peer.client });
    const session = await service.createSession();
    const eventsPromise = collect(
      service.stream(session.id, {
        input: "List MCPs",
        mcp: {
          headers: {
            authorization: "Bearer test-token",
          },
          mode: "http",
          url: "http://127.0.0.1:4738/mcp",
        },
      }),
    );

    const initialize = await peer.expectRequest("initialize");
    peer.respond(initialize.id, {
      platformFamily: "unix",
      platformOs: "macos",
      userAgent: "mock-codex",
    });
    await peer.expectNotification("initialized");
    const threadStart = await peer.expectRequest("thread/start");
    peer.respond(threadStart.id, {
      model: "gpt-test",
      thread: {
        id: "native_thread",
        turns: [],
      },
    });
    const reload = await peer.expectRequest("config/mcpServer/reload");
    peer.respond(reload.id, {});
    for (const _ of [0, 1, 2]) {
      const status = await peer.expectRequest("mcpServerStatus/list");
      peer.respond(status.id, {
        data: [
          {
            authStatus: "bearerToken",
            name: "cycle",
            resourceTemplates: [],
            resources: [],
            serverInfo: {
              name: "cycle",
              version: "0.0.0",
            },
            tools: {},
          },
        ],
        nextCursor: null,
      });
    }

    await startTurn(peer);
    peer.notify("turn/completed", {
      threadId: "native_thread",
      turn: {
        id: "native_turn",
        status: "completed",
      },
    });

    const events = await eventsPromise;
    const warning = events.find((event) => event.type === "runtime.warning");
    assert.match(warning?.message ?? "", /reported no tools/u);
  });

  it("roundtrips command approvals through AgentService", async () => {
    const peer = makeMockPeer();
    const service = makeCodexAgentService({ appServerClient: peer.client });
    const session = await service.createSession();
    const iterator = service.stream(session.id, { input: "Run a command" })[Symbol.asyncIterator]();
    const started = iterator.next();

    await completeStartup(peer);
    await startTurn(peer);
    assert.equal((await started).value?.type, "turn.started");
    const approvalResponse = peer.serverRequest("item/commandExecution/requestApproval", {
      command: "pnpm test",
      itemId: "command_1",
      threadId: "native_thread",
      turnId: "native_turn",
    });
    const requested = await nextEvent(iterator, "approval.requested");
    assert.equal(requested.request.kind, "command");
    assert.equal(requested.request.details?.command, "pnpm test");

    const result = await service.respondToApproval(
      session.id,
      requested.request.requestId,
      "accept",
    );
    assert.equal(result.status, "accepted");
    assert.deepEqual((await approvalResponse).result, { decision: "accept" });

    peer.notify("turn/completed", {
      threadId: "native_thread",
      turn: {
        id: "native_turn",
        status: "completed",
      },
    });
    await nextEvent(iterator, "turn.completed");
  });

  it("roundtrips user-input requests through AgentService", async () => {
    const peer = makeMockPeer();
    const service = makeCodexAgentService({ appServerClient: peer.client });
    const session = await service.createSession();
    const iterator = service.stream(session.id, { input: "Ask me" })[Symbol.asyncIterator]();
    const started = iterator.next();

    await completeStartup(peer);
    await startTurn(peer);
    assert.equal((await started).value?.type, "turn.started");
    const userInputResponse = peer.serverRequest("item/tool/requestUserInput", {
      itemId: "tool_1",
      questions: [
        {
          id: "choice",
          options: [{ label: "Yes", value: "yes" }],
          question: "Continue?",
        },
      ],
      threadId: "native_thread",
      turnId: "native_turn",
    });
    const requested = await nextEvent(iterator, "user-input.requested");
    assert.equal(requested.request.questions[0]?.id, "choice");

    const result = await service.respondToUserInput(session.id, requested.request.requestId, [
      {
        questionId: "choice",
        value: "yes",
      },
    ]);
    assert.equal(result.status, "accepted");
    assert.deepEqual((await userInputResponse).result, {
      answers: {
        choice: {
          answers: ["yes"],
        },
      },
    });

    peer.notify("turn/completed", {
      threadId: "native_thread",
      turn: {
        id: "native_turn",
        status: "completed",
      },
    });
    await nextEvent(iterator, "turn.completed");
  });
});

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
};

const nextEvent = async <TType extends AgentEvent["type"]>(
  iterator: AsyncIterator<AgentEvent>,
  type: TType,
): Promise<Extract<AgentEvent, { readonly type: TType }>> => {
  while (true) {
    const next = await iterator.next();
    if (next.done === true) throw new Error(`Expected event ${type}`);
    if (next.value.type === type) {
      return next.value as Extract<AgentEvent, { readonly type: TType }>;
    }
  }
};
