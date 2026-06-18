import { strict as assert } from "node:assert";
import { defaultAgentCapabilities } from "@cycle/agents/providers";
import type { AgentProviderProfile, AgentService, AgentTurnRequest } from "@cycle/agents/types";
import { type CycleUseCase, type TicketDocument } from "@cycle/contracts";
import { type UseCaseRunnerShape } from "@cycle/usecases";
import { Effect, Layer, Tracer } from "effect";
import { NodeServices } from "@effect/platform-node";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { describe, it } from "vitest";
import { makeAgentActiveTurnDirectory } from "../src/agents/services/AgentActiveTurnDirectory.ts";
import {
  makeCycleApi,
  makeCycleApiLayer,
  startCycleApiServer,
  startCycleApiServerEffect,
  type AgentChatStoreShape,
} from "../src/index.ts";

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
    repositoryId: repository.id,
    schemaVersion: 1,
    status: "todo",
    title,
    type: "task",
    updatedDate: "2026-06-12",
  }) as TicketDocument;

const makeTestApi = (options: Partial<Parameters<typeof makeCycleApi>[0]> = {}) => {
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
          case "IssueSearch":
            return {
              entries: issues.map((issue) => ({
                matchedFields: ["title"],
                ticket: issue,
              })),
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
      ...options,
      runner,
      staticToken: token,
    }),
    calls,
  };
};

const makeCapturingTracer = () => {
  const spans: Array<Tracer.Span> = [];
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });

  return { spans, tracer };
};

const authed = (body?: unknown): RequestInit => ({
  body: body === undefined ? undefined : JSON.stringify(body),
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-request-id": "req_test",
  },
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type ChatTestMessage = {
  readonly commandId?: string;
  readonly payload?: unknown;
  readonly threadId?: string;
  readonly type?: string;
};

type TestThreadRecord = Parameters<AgentChatStoreShape["upsertThread"]>[0];
type TestMessageRecord = Parameters<AgentChatStoreShape["upsertMessage"]>[0];
type TestTurnRecord = Parameters<NonNullable<AgentChatStoreShape["upsertTurn"]>>[0];
type TestActivityRecord = Parameters<NonNullable<AgentChatStoreShape["upsertActivity"]>>[0];
type TestQuestionRecord = Parameters<NonNullable<AgentChatStoreShape["upsertQuestion"]>>[0];
type TestEventInput = Parameters<NonNullable<AgentChatStoreShape["appendEvent"]>>[0];

const makeInMemoryAgentChatStore = (): AgentChatStoreShape => {
  const threads = new Map<string, TestThreadRecord>();
  const messages = new Map<string, TestMessageRecord>();
  const turns = new Map<string, TestTurnRecord>();
  const activities = new Map<string, TestActivityRecord>();
  const questions = new Map<string, TestQuestionRecord>();
  const events = new Map<string, TestEventInput & { readonly sequence: number }>();

  const listMessages = async (threadId: string) =>
    [...messages.values()]
      .filter((message) => message.threadId === threadId)
      .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));

  const nextMessageSequence = (threadId: string): number =>
    Math.max(
      -1,
      ...[...messages.values()]
        .filter((message) => message.threadId === threadId)
        .map((message) => message.sequence ?? -1),
    ) + 1;

  const nextEventSequence = (threadId: string): number =>
    Math.max(
      0,
      ...[...events.values()]
        .filter((event) => event.threadId === threadId)
        .map((event) => event.sequence),
    ) + 1;

  return {
    appendEvent: async (input) => {
      const event = {
        ...input,
        sequence: nextEventSequence(input.threadId),
      };
      events.set(`${event.threadId}:${event.eventId}`, event);
      return event;
    },
    deleteThread: async (threadId) => {
      const deleted = threads.delete(threadId);
      if (!deleted) return false;

      for (const [key, message] of messages) {
        if (message.threadId === threadId) messages.delete(key);
      }
      for (const [key, turn] of turns) {
        if (turn.threadId === threadId) turns.delete(key);
      }
      for (const [key, activity] of activities) {
        if (activity.threadId === threadId) activities.delete(key);
      }
      for (const [key, question] of questions) {
        if (question.threadId === threadId) questions.delete(key);
      }
      for (const [key, event] of events) {
        if (event.threadId === threadId) events.delete(key);
      }

      return true;
    },
    getThread: async (threadId) => {
      const thread = threads.get(threadId);
      if (thread === undefined) return undefined;
      return {
        ...thread,
        messages: await listMessages(threadId),
      };
    },
    listActivities: async (threadId) =>
      [...activities.values()].filter((activity) => activity.threadId === threadId),
    listEventsAfter: async (threadId, sequence) =>
      [...events.values()]
        .filter((event) => event.threadId === threadId && event.sequence > sequence)
        .sort((left, right) => left.sequence - right.sequence),
    listMessages,
    listQuestions: async (threadId) =>
      [...questions.values()].filter((question) => question.threadId === threadId),
    listThreads: async () =>
      Promise.all(
        [...threads.values()].map(async (thread) => ({
          ...thread,
          messages: await listMessages(thread.id),
        })),
      ),
    listTurns: async (threadId) => [...turns.values()].filter((turn) => turn.threadId === threadId),
    upsertActivity: async (activity) => {
      activities.set(`${activity.threadId}:${activity.id}`, activity);
      return activity;
    },
    upsertMessage: async (message) => {
      const key = `${message.threadId}:${message.id}`;
      const existing = messages.get(key);
      const next = {
        ...message,
        sequence: message.sequence ?? existing?.sequence ?? nextMessageSequence(message.threadId),
      };
      messages.set(key, next);
      return next;
    },
    upsertQuestion: async (question) => {
      questions.set(`${question.threadId}:${question.id}`, question);
      return question;
    },
    upsertThread: async (thread) => {
      threads.set(thread.id, thread);
      return thread;
    },
    upsertTurn: async (turn) => {
      turns.set(`${turn.threadId}:${turn.id}`, turn);
      return turn;
    },
  };
};

const connectChatSocket = async (baseUrl: string) => {
  const socket = new WebSocket(`${baseUrl.replace(/^http/u, "ws")}/v1/chat/ws`);
  const messages: ChatTestMessage[] = [];
  const waiters: Array<{
    readonly predicate: (message: ChatTestMessage) => boolean;
    readonly reject: (error: Error) => void;
    readonly resolve: (message: ChatTestMessage) => void;
    readonly timer: ReturnType<typeof setTimeout>;
  }> = [];
  let commandSequence = 0;

  const drainWaiters = (message: ChatTestMessage) => {
    const pendingWaiters = waiters.slice();
    for (const waiter of pendingWaiters) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    }
  };

  socket.addEventListener("message", (event) => {
    const parsed = JSON.parse(String(event.data)) as unknown;
    if (!isRecord(parsed)) return;
    const message = parsed as ChatTestMessage;
    messages.push(message);
    drainWaiters(message);
  });

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Chat WebSocket failed to open.")), {
      once: true,
    });
  });

  const waitFor = (
    predicate: (message: ChatTestMessage) => boolean,
    timeoutMs = 3000,
  ): Promise<ChatTestMessage> => {
    const existing = messages.find(predicate);
    if (existing !== undefined) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("Timed out waiting for chat socket message."));
      }, timeoutMs);
      waiters.push({ predicate, reject, resolve, timer });
    });
  };

  const send = (type: string, payload: Readonly<Record<string, unknown>> = {}) => {
    const commandId = `cmd_${++commandSequence}`;
    socket.send(
      JSON.stringify({
        commandId,
        payload,
        type,
        version: 1,
      }),
    );
    return commandId;
  };

  send("connection.authenticate", { token });
  await waitFor((message) => message.type === "connection.ready");

  return {
    close: () => socket.close(),
    send,
    waitFor,
  };
};

const commandPayloadResult = (message: ChatTestMessage): Readonly<Record<string, unknown>> => {
  const payload = isRecord(message.payload) ? message.payload : {};
  return isRecord(payload.result) ? payload.result : {};
};

describe("@cycle/api", () => {
  it("cleans up completed active turns without aborting the provider signal", () => {
    const directory = makeAgentActiveTurnDirectory();
    const started = directory.begin({
      provider: "codex",
      sessionId: "session_completed",
    });

    assert.equal(started.active, true);
    assert.equal(started.record.abortController.signal.aborted, false);
    directory.finish("codex", "session_completed", "completed");

    assert.equal(started.record.abortController.signal.aborted, false);
    assert.equal(directory.get("codex", "session_completed"), undefined);
  });

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

      const docs = await api.fetch(new Request("http://cycle.test/"));
      const docsBody = await docs.text();
      assert.equal(docs.status, 200);
      assert.match(docs.headers.get("content-type") ?? "", /^text\/html/);
      assert.match(docsBody, /<redoc spec-url="\/spec\.json"><\/redoc>/);
      assert.match(
        docsBody,
        /https:\/\/cdn\.redoc\.ly\/redoc\/latest\/bundles\/redoc\.standalone\.js/,
      );

      const spec = await api.fetch(new Request("http://cycle.test/spec.json"));
      const body = (await spec.json()) as { openapi?: string; paths?: Record<string, unknown> };
      assert.equal(spec.status, 200);
      assert.equal(body.openapi, "3.1.0");
      assert.ok(body.paths?.["/v1/autocomplete"]);
      assert.ok(body.paths?.["/v1/agents/providers"]);
      assert.ok(body.paths?.["/v1/app-config"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/issues"]);
      assert.equal(body.paths?.["/v1/chat/threads"], undefined);
      assert.equal(body.paths?.["/v1/chat/turns"], undefined);
      assert.equal(body.paths?.["/v1/chat/turns/stream"], undefined);
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

  it("serves local app config and profile updates through the authenticated API", async () => {
    let appConfig = {
      localWorkspace: {
        repositories: [],
      },
      onboarding: {
        completed: true,
      },
      profile: {
        displayName: "Desktop User",
        email: "desktop@example.com",
      },
      theme: {
        preference: "system",
      },
    };
    const { api } = makeTestApi({
      localSettings: {
        read: async () => appConfig,
        updateProfile: async (input) => {
          appConfig = {
            ...appConfig,
            profile: {
              displayName: input.displayName ?? appConfig.profile.displayName,
              email: input.email ?? appConfig.profile.email,
            },
          };
          return appConfig.profile;
        },
      },
    });

    try {
      const before = await api.fetch(new Request("http://cycle.test/v1/app-config", authed()));
      const beforeBody = (await before.json()) as {
        data?: { profile?: { email?: string } };
      };
      assert.equal(before.status, 200);
      assert.equal(beforeBody.data?.profile?.email, "desktop@example.com");

      const updated = await api.fetch(
        new Request("http://cycle.test/v1/profile", {
          ...authed({
            email: "web@example.com",
          }),
          method: "PATCH",
        }),
      );
      const updatedBody = (await updated.json()) as {
        data?: { displayName?: string; email?: string };
      };
      assert.equal(updated.status, 200);
      assert.deepEqual(updatedBody.data, {
        displayName: "Desktop User",
        email: "web@example.com",
      });

      const after = await api.fetch(new Request("http://cycle.test/v1/app-config", authed()));
      const afterBody = (await after.json()) as {
        data?: { profile?: { email?: string } };
      };
      assert.equal(afterBody.data?.profile?.email, "web@example.com");
    } finally {
      await api.dispose();
    }
  });

  it("returns generic autocomplete results for repositories and tickets", async () => {
    const { api, calls } = makeTestApi();

    try {
      await api.fetch(
        new Request(`http://cycle.test/v1/repositories/${repository.id}/issues`, {
          ...authed({
            body: "Initial body",
            title: "Build autocomplete",
          }),
          method: "POST",
        }),
      );

      const response = await api.fetch(
        new Request(
          "http://cycle.test/v1/autocomplete?q=Build&types=repository,ticket&limit=8",
          authed(),
        ),
      );
      const body = (await response.json()) as {
        data?: {
          readonly results?: ReadonlyArray<{
            readonly id?: string;
            readonly name?: string;
            readonly type?: string;
            readonly uri?: string;
          }>;
        };
      };
      const results = body.data?.results ?? [];

      assert.equal(response.status, 200);
      assert.equal(
        results.some((result) => result.type === "ticket"),
        true,
      );
      assert.equal(
        results.find((result) => result.type === "ticket")?.uri,
        "cycle://repository/test-repository/tickets/ISSUE-1",
      );
      assert.deepEqual(calls, ["IssueCreate", "RepositoryList", "IssueSearch"]);
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
      assert.equal(toolsBody.result?.tools?.[0]?.name, "cycle_repository_list");
    } finally {
      await handle.close();
    }
  });

  it("returns agent provider runtime profiles", async () => {
    const providerProfiles: readonly AgentProviderProfile[] = [
      {
        capabilities: defaultAgentCapabilities("codex"),
        checkedAt: "2026-06-16T00:00:00.000Z",
        configuration: {
          execution: "local",
        },
        displayName: "Codex",
        executableName: "codex",
        executablePath: "/usr/local/bin/codex",
        models: [],
        provider: "codex",
        status: "available",
      },
      {
        capabilities: defaultAgentCapabilities("claude"),
        checkedAt: "2026-06-16T00:00:00.000Z",
        configuration: {
          execution: "local",
          unsupported: true,
        },
        displayName: "Claude Code",
        executableName: "claude",
        message: "Claude Code execution is not supported yet.",
        models: [],
        provider: "claude",
        status: "unsupported",
      },
    ];
    const { api } = makeTestApi({
      agentProviderProfiles: async () => providerProfiles,
    });

    try {
      const response = await api.fetch(
        new Request("http://cycle.test/v1/agents/providers", authed()),
      );
      const body = (await response.json()) as {
        data?: {
          readonly providers?: ReadonlyArray<{
            readonly provider?: string;
            readonly status?: string;
          }>;
        };
      };

      assert.equal(response.status, 200);
      assert.equal(body.data?.providers?.[0]?.provider, "codex");
      assert.equal(body.data?.providers?.[0]?.status, "available");
      assert.equal(body.data?.providers?.[1]?.provider, "claude");
      assert.equal(body.data?.providers?.[1]?.status, "unsupported");
    } finally {
      await api.dispose();
    }
  });

  it("streams chat turns over the WebSocket endpoint and persists resumable state", async () => {
    let captured:
      | {
          readonly request: AgentTurnRequest;
          readonly sessionId: string;
        }
      | undefined;
    const timestamp = new Date("2026-06-16T00:00:01.000Z");
    const agentChatStore = makeInMemoryAgentChatStore();
    const fakeAgent: AgentService = {
      abortTurn: async () => ({ accepted: false, reason: "not_supported" }),
      capabilities: () => defaultAgentCapabilities("codex"),
      close: async () => undefined,
      createSession: async () => ({
        createdAt: timestamp,
        harnessId: "codex",
        id: "session_ws_test",
        provider: "codex",
        updatedAt: timestamp,
      }),
      provider: "codex",
      resumeSession: async (sessionId) => ({
        createdAt: timestamp,
        harnessId: "codex",
        id: sessionId,
        provider: "codex",
        updatedAt: timestamp,
      }),
      respondToApproval: async (sessionId, requestId) => ({
        requestId,
        sessionId,
        status: "not_found",
      }),
      respondToUserInput: async (sessionId, requestId) => ({
        requestId,
        sessionId,
        status: "not_found",
      }),
      run: async () => {
        throw new Error("WebSocket chat test should not call run");
      },
      stream: async function* (sessionId, request) {
        captured = { request, sessionId };
        yield {
          at: timestamp,
          provider: "codex",
          sessionId,
          turnId: "turn_ws_provider",
          type: "turn.started",
        };
        yield {
          at: timestamp,
          delta: "Inspecting the current chat UI event mapping.",
          itemId: "item_reasoning_stream",
          sessionId,
          streamKind: "reasoning_summary",
          turnId: "turn_ws_provider",
          type: "content.delta",
        };
        yield {
          at: timestamp,
          delta: "Streaming",
          sessionId,
          snapshot: "Streaming",
          turnId: "turn_ws_provider",
          type: "text.delta",
        };
        yield {
          at: timestamp,
          delta: " response",
          sessionId,
          snapshot: "Streaming response",
          turnId: "turn_ws_provider",
          type: "text.delta",
        };
        yield {
          at: timestamp,
          item: { id: "item_user", type: "userMessage" },
          itemId: "item_user",
          itemType: "userMessage",
          sessionId,
          turnId: "turn_ws_provider",
          type: "item.completed",
        };
        yield {
          at: timestamp,
          item: { id: "item_reasoning", type: "reasoning" },
          itemId: "item_reasoning",
          itemType: "reasoning",
          sessionId,
          turnId: "turn_ws_provider",
          type: "item.completed",
        };
        yield {
          at: timestamp,
          item: { id: "item_agent", type: "agentMessage" },
          itemId: "item_agent",
          itemType: "agentMessage",
          sessionId,
          turnId: "turn_ws_provider",
          type: "item.completed",
        };
        yield {
          at: timestamp,
          result: {
            artifacts: [],
            completedAt: timestamp,
            createdAt: timestamp,
            finishReason: "stop",
            id: "turn_ws_provider",
            provider: "codex",
            sessionId,
            status: "completed",
            text: "Streaming response",
          },
          sessionId,
          turnId: "turn_ws_provider",
          type: "turn.completed",
        };
      },
    };
    const handle = await startCycleApiServer({
      agentChatStore,
      agentServices: {
        serviceFor: () => Effect.succeed(fakeAgent),
      },
      mcp: {
        enabled: true,
        path: "/mcp",
      },
      runner: {
        run: (useCase: CycleUseCase) =>
          Effect.die(new Error(`Unexpected usecase: ${useCase.name}`)),
      },
      staticToken: token,
    });
    const client = await connectChatSocket(handle.baseUrl);

    try {
      const createCommandId = client.send("thread.create", {
        providerId: "codex",
        thinkingLevel: "high",
      });
      const createAck = await client.waitFor(
        (message) => message.type === "command.ack" && message.commandId === createCommandId,
      );
      const createdThread = commandPayloadResult(createAck).thread;
      assert.equal(isRecord(createdThread), true);
      const threadId = isRecord(createdThread) ? String(createdThread.id) : "";
      assert.match(threadId, /^thread_/u);

      client.send("thread.subscribe", { threadId });
      await client.waitFor(
        (message) => message.type === "thread.snapshot" && message.threadId === threadId,
      );

      client.send("turn.send", {
        message: "Stream a reply",
        providerId: "codex",
        thinkingLevel: "high",
        threadId,
      });

      await client.waitFor(
        (message) =>
          message.type === "message.created" &&
          message.threadId === threadId &&
          isRecord(message.payload) &&
          isRecord(message.payload.message) &&
          message.payload.message.role === "user",
      );
      await client.waitFor(
        (message) =>
          message.type === "message.delta" &&
          message.threadId === threadId &&
          isRecord(message.payload) &&
          message.payload.snapshot === "Streaming",
      );
      await client.waitFor(
        (message) =>
          message.type === "message.completed" &&
          message.threadId === threadId &&
          isRecord(message.payload) &&
          isRecord(message.payload.message) &&
          message.payload.message.text === "Streaming response",
      );
      await client.waitFor(
        (message) => message.type === "turn.completed" && message.threadId === threadId,
      );

      const persistedMessages = await agentChatStore.listMessages(threadId);
      const persistedActivities = (await agentChatStore.listActivities?.(threadId)) ?? [];
      const persistedEvents = (await agentChatStore.listEventsAfter?.(threadId, 0)) ?? [];

      assert.equal(persistedMessages.length, 2);
      assert.equal(persistedMessages[0]?.actor, "user");
      assert.equal(persistedMessages[0]?.body, "Stream a reply");
      assert.equal(persistedMessages[1]?.actor, "agent");
      assert.equal(persistedMessages[1]?.body, "Streaming response");
      assert.equal(persistedMessages[1]?.streaming, false);
      assert.equal(persistedEvents[0]?.sequence, 1);
      assert.equal(
        persistedEvents.some((event) => event.type === "message.delta"),
        true,
      );
      assert.equal(
        persistedActivities.some((activity) => activity.id.startsWith("activity-item_")),
        false,
      );
      assert.equal(
        persistedActivities.some((activity) => activity.payload?.itemType === "agentMessage"),
        false,
      );
      const thinkingActivity = persistedActivities.find(
        (activity) => activity.id === "activity-thinking",
      );
      assert.equal(thinkingActivity?.kind, "thinking");
      assert.equal(thinkingActivity?.status, "completed");
      assert.equal(thinkingActivity?.detail, undefined);
      assert.equal(thinkingActivity?.payload, undefined);
      assert.equal(captured?.sessionId, threadId);
      assert.match(String(captured?.request.input), /Current user message/u);
      assert.match(captured?.request.instructions ?? "", /Cycle MCP: attached as agent tools/u);
      assert.equal((captured?.request.instructions ?? "").includes(handle.baseUrl), false);
      assert.equal(captured?.request.model, undefined);
      assert.equal(captured?.request.metadata?.thinkingLevel, "high");
      assert.equal(captured?.request.signal instanceof AbortSignal, true);
      assert.equal(captured?.request.signal?.aborted, false);
      assert.equal(captured?.request.mcp?.mode, "http");
      if (captured?.request.mcp?.mode === "http") {
        assert.equal(captured.request.mcp.url, `${handle.baseUrl}/mcp`);
        assert.equal(captured.request.mcp.headers?.authorization, `Bearer ${token}`);
      }
    } finally {
      client.close();
      await handle.close();
    }
  });

  it("deletes chat threads over the WebSocket endpoint", async () => {
    const agentChatStore = makeInMemoryAgentChatStore();
    const handle = await startCycleApiServer({
      agentChatStore,
      runner: {
        run: (useCase: CycleUseCase) =>
          Effect.die(new Error(`Unexpected usecase: ${useCase.name}`)),
      },
      staticToken: token,
    });
    const client = await connectChatSocket(handle.baseUrl);

    try {
      const createCommandId = client.send("thread.create", {
        providerId: "codex",
      });
      const createAck = await client.waitFor(
        (message) => message.type === "command.ack" && message.commandId === createCommandId,
      );
      const createdThread = commandPayloadResult(createAck).thread;
      assert.equal(isRecord(createdThread), true);
      const threadId = isRecord(createdThread) ? String(createdThread.id) : "";
      assert.match(threadId, /^thread_/u);

      await agentChatStore.upsertMessage({
        actor: "user",
        body: "Delete this conversation",
        createdAt: "2026-06-16T10:00:00.000Z",
        id: "message-delete-test",
        threadId,
      });

      client.send("thread.subscribe", { threadId });
      await client.waitFor(
        (message) => message.type === "thread.snapshot" && message.threadId === threadId,
      );

      const deleteCommandId = client.send("thread.delete", { threadId });
      const deleteAck = await client.waitFor(
        (message) => message.type === "command.ack" && message.commandId === deleteCommandId,
      );
      assert.equal(commandPayloadResult(deleteAck).threadId, threadId);
      await client.waitFor(
        (message) => message.type === "thread.deleted" && message.threadId === threadId,
      );

      assert.equal(await agentChatStore.getThread?.(threadId), undefined);
      assert.equal((await agentChatStore.listMessages(threadId)).length, 0);

      const listCommandId = client.send("thread.list");
      const listSnapshot = await client.waitFor(
        (message) => message.type === "thread.list.snapshot" && message.commandId === listCommandId,
      );
      const listedThreads = isRecord(listSnapshot.payload)
        ? Array.isArray(listSnapshot.payload.threads)
          ? listSnapshot.payload.threads
          : []
        : [];
      assert.equal(
        listedThreads.some((thread) => isRecord(thread) && thread.id === threadId),
        false,
      );
    } finally {
      client.close();
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

  it("creates an HTTP root span for issue creation requests", async () => {
    const { spans, tracer } = makeCapturingTracer();
    const calls: Array<string> = [];
    const runner: UseCaseRunnerShape = {
      run: (useCase: CycleUseCase) =>
        Effect.sync(() => {
          calls.push(useCase.name);
          return makeIssue("ISSUE-1", "Traced issue", "") as never;
        }).pipe(Effect.withSpan(`api.usecase.${useCase.name}`)),
    };
    const appLayer = (
      makeCycleApiLayer({ runner, staticToken: token }) as Layer.Layer<never, unknown, any>
    ).pipe(
      Layer.provide([HttpServer.layerServices, NodeServices.layer]),
      Layer.provide(Layer.succeed(Tracer.Tracer, tracer)),
    );
    const { dispose, handler: rawHandler } = HttpRouter.toWebHandler(appLayer as any, {
      disableLogger: true,
    });
    const handler = rawHandler as (request: Request) => Promise<Response>;

    try {
      const response = await handler(
        new Request(`http://cycle.test/v1/repositories/${repository.id}/issues`, {
          body: JSON.stringify({
            title: "Traced issue",
          }),
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
            "x-request-id": "req_test",
          },
          method: "POST",
        }),
      );

      assert.equal(response.status, 201);
      assert.deepEqual(calls, ["IssueCreate"]);
    } finally {
      await dispose();
    }

    const httpSpan = spans.find(
      (span) => span.name === "api.http.POST /v1/repositories/:repositoryId/issues",
    );
    const useCaseSpan = spans.find((span) => span.name === "api.usecase.IssueCreate");
    const httpParentSpan = httpSpan?.parent._tag === "Some" ? httpSpan.parent.value : undefined;
    const parentSpan = useCaseSpan?.parent._tag === "Some" ? useCaseSpan.parent.value : undefined;

    assert.notEqual(httpSpan, undefined);
    assert.equal(httpParentSpan, undefined);
    assert.notEqual(useCaseSpan, undefined);
    assert.equal(parentSpan, httpSpan);
  });

  it("creates request spans through the listening server runtime", async () => {
    const { spans, tracer } = makeCapturingTracer();
    const calls: Array<string> = [];
    const runner: UseCaseRunnerShape = {
      run: (useCase: CycleUseCase) =>
        Effect.sync(() => {
          calls.push(useCase.name);
          return makeIssue("ISSUE-1", "Server traced issue", "") as never;
        }).pipe(Effect.withSpan(`api.usecase.${useCase.name}`)),
    };
    const handle = await Effect.runPromise(
      startCycleApiServerEffect({
        host: "127.0.0.1",
        logging: {
          console: false,
          file: { enabled: false },
        },
        runner,
        staticToken: token,
      }).pipe(Effect.provide([NodeServices.layer, Layer.succeed(Tracer.Tracer, tracer)])),
    );

    try {
      const response = await fetch(`${handle.baseUrl}/v1/repositories/${repository.id}/issues`, {
        body: JSON.stringify({
          title: "Server traced issue",
        }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
          "x-request-id": "req_test",
        },
        method: "POST",
      });

      assert.equal(response.status, 201);
      assert.deepEqual(calls, ["IssueCreate"]);
    } finally {
      await handle.close();
    }

    const httpSpan = spans.find(
      (span) => span.name === "api.http.POST /v1/repositories/:repositoryId/issues",
    );
    const useCaseSpan = spans.find((span) => span.name === "api.usecase.IssueCreate");
    const httpParentSpan = httpSpan?.parent._tag === "Some" ? httpSpan.parent.value : undefined;
    const parentSpan = useCaseSpan?.parent._tag === "Some" ? useCaseSpan.parent.value : undefined;

    assert.notEqual(httpSpan, undefined);
    assert.equal(httpParentSpan, undefined);
    assert.notEqual(useCaseSpan, undefined);
    assert.equal(parentSpan, httpSpan);
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
