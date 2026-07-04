import { strict as assert } from "node:assert";
import { defaultAgentCapabilities } from "@cycle/agents/providers";
import {
  AgentTaskServiceLive,
  AgentTaskStore,
  makeInMemoryAgentTaskStore,
} from "@cycle/agents/task";
import type {
  AgentProviderId,
  AgentProviderProfile,
  AgentService,
  AgentTurnRequest,
} from "@cycle/agents/types";
import { DatabaseService, type DatabaseServiceShape } from "@cycle/database";
import { type TicketDocument } from "@cycle/contracts";
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
  type CycleApiRuntimeShape,
} from "../src/index.ts";
import { prepareChatTurn } from "../src/http/handlers/v1/chat/prepare.ts";
import { chatOriginInstructions } from "../src/http/handlers/v1/chat/ws.ts";

const repository = { id: "test-repository" };
const token = "test-token";

type TestAgentProviderPreference = {
  readonly config: Readonly<Record<string, unknown>>;
  readonly defaultModel: string | null;
  readonly enabled: boolean;
  readonly executablePath: string | null;
  readonly id: AgentProviderId;
  readonly maxConcurrentRuns: number | null;
};

const makeTestAgentTaskLayer = () =>
  AgentTaskServiceLive().pipe(
    Layer.provide(Layer.succeed(AgentTaskStore, AgentTaskStore.of(makeInMemoryAgentTaskStore()))),
  );

const makeRepositoryStatus = () => ({
  activeGeneration: 1,
  activeSnapshotId: null,
  metadata: {
    currentBranch: "main",
    remotes: [],
    worktreePath: "/tmp/cycle-test-repository",
  },
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

const failingAgentStream = (message: string): AsyncIterable<never> => ({
  [Symbol.asyncIterator]: () => ({
    next: async () => {
      throw new Error(message);
    },
  }),
});

const databaseStub = (overrides: Partial<DatabaseServiceShape>): DatabaseServiceShape =>
  new Proxy(overrides, {
    get: (target, property) => {
      if (property in target) return target[property as keyof DatabaseServiceShape];

      return () => Effect.die(new Error(`Unexpected database call: ${String(property)}`));
    },
  }) as DatabaseServiceShape;

const unexpectedDatabaseLayer = Layer.succeed(
  DatabaseService,
  DatabaseService.of(databaseStub({})),
);

const issueCreateDatabaseLayer = (calls: Array<string>) =>
  Layer.succeed(
    DatabaseService,
    DatabaseService.of(
      databaseStub({
        createTicket: (_repositoryId, input) =>
          Effect.sync(() => {
            calls.push("IssueCreate");
            return makeIssue("ISSUE-1", input.title, input.body ?? "");
          }),
      }),
    ),
  );

const makeTestApi = (options: Partial<Parameters<typeof makeCycleApi>[0]> = {}) => {
  const calls: Array<string> = [];
  const issues: Array<TicketDocument> = [];
  const comments: Array<unknown> = [];
  const database = databaseStub({
    addComment: (_repositoryId, issueId, input) =>
      Effect.sync(() => {
        calls.push("CommentAdd");
        const comment = {
          createdAt: "2026-06-12T00:00:00.000Z",
          createdBy: {
            name: "Test",
            type: "agent" as const,
          },
          createdDate: "2026-06-12",
          id: "COMMENT-1",
          issueId,
          payload: { body: input.body },
          recordType: "comment",
          schemaVersion: 1 as const,
        };
        comments.push(comment);
        return comment;
      }),
    addRecord: (_repositoryId, issueId, input) =>
      Effect.sync(() => {
        calls.push("RecordAdd");
        const record = {
          createdAt: "2026-06-12T00:00:00.000Z",
          createdBy: {
            name: "Test",
            type: "agent" as const,
          },
          createdDate: "2026-06-12",
          id: "COMMENT-1",
          issueId,
          payload: input.payload,
          recordType: input.recordType,
          schemaVersion: 1 as const,
        };
        comments.push(record);
        return record;
      }),
    createTicket: (_repositoryId, input) =>
      Effect.sync(() => {
        calls.push("IssueCreate");
        const issue = makeIssue("ISSUE-1", input.title, input.body ?? "");
        issues.push(issue);
        return issue;
      }),
    getTicket: (_repositoryId, ticketId) =>
      Effect.sync(() => {
        calls.push("IssueGet");
        return issues.find((issue) => issue.id === ticketId) ?? null;
      }),
    listRepositories: () =>
      Effect.sync(() => {
        calls.push("RepositoryList");
        return [makeRepositoryStatus()];
      }),
    listTickets: () =>
      Effect.sync(() => {
        calls.push("IssueList");
        return { entries: issues };
      }),
    materializationWarnings: () =>
      Effect.sync(() => {
        calls.push("RepositoryMaterializationWarningsList");
        return [];
      }),
    openRepository: () =>
      Effect.sync(() => {
        calls.push("RepositoryOpen");
        return makeRepositoryStatus();
      }),
    repositoryHistory: () =>
      Effect.sync(() => {
        calls.push("RepositoryHistoryList");
        return { entries: [] };
      }),
    repositoryStatus: () =>
      Effect.sync(() => {
        calls.push("RepositoryStatusGet");
        return makeRepositoryStatus();
      }),
    searchTickets: () =>
      Effect.sync(() => {
        calls.push("IssueSearch");
        return {
          entries: issues.map((issue) => ({
            matchedFields: ["title" as const],
            ticket: issue,
          })),
        };
      }),
    syncRepository: () =>
      Effect.sync(() => {
        calls.push("RepositorySync");
        return makeRepositoryStatus();
      }),
    transitionTicket: (_repositoryId, ticketId, input) =>
      Effect.sync(() => {
        calls.push("IssueTransition");
        const index = issues.findIndex((issue) => issue.id === ticketId);
        if (index < 0) throw new Error(`Missing issue: ${ticketId}`);
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
        return updated;
      }),
    updateTicket: (_repositoryId, ticketId, patch) =>
      Effect.sync(() => {
        calls.push("IssueUpdate");
        const index = issues.findIndex((issue) => issue.id === ticketId);
        if (index < 0) throw new Error(`Missing issue: ${ticketId}`);
        const current = issues[index] as TicketDocument;
        const updated = {
          ...current,
          ...(patch.body === undefined ? undefined : { body: patch.body }),
          frontmatter: {
            ...current.frontmatter,
            ...patch.frontmatter,
          },
          type: typeof patch.frontmatter?.type === "string" ? patch.frontmatter.type : current.type,
        } as TicketDocument;
        issues[index] = updated;
        return updated;
      }),
  });

  return {
    api: makeCycleApi({
      ...options,
      staticToken: token,
      useCaseLayer: Layer.mergeAll(
        Layer.succeed(DatabaseService, DatabaseService.of(database)),
        makeTestAgentTaskLayer(),
      ),
    }),
    calls,
    comments,
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

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const arrayValue = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

type ChatTestMessage = {
  readonly commandId?: string;
  readonly payload?: unknown;
  readonly sequence?: number;
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

  const sendRaw = (message: unknown) => {
    socket.send(JSON.stringify(message));
  };

  send("connection.authenticate", { token });
  await waitFor((message) => message.type === "connection.ready");

  return {
    close: () => socket.close(),
    send,
    sendRaw,
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
      const serializedSpec = JSON.stringify(body);
      assert.equal(spec.status, 200);
      assert.equal(body.openapi, "3.1.0");
      assert.doesNotMatch(serializedSpec, /\b(?:Infinity|NaN)\b/);
      assert.doesNotMatch(serializedSpec, /AnyPayload|Schema\.Unknown/);
      assert.ok(body.paths?.["/v1/autocomplete"]);
      assert.ok(body.paths?.["/v1/agents/providers"]);
      assert.ok(body.paths?.["/v1/agent-tasks"]);
      assert.ok(body.paths?.["/v1/agent-tasks/{taskId}"]);
      assert.ok(body.paths?.["/v1/agent-tasks/{taskId}/events"]);
      assert.ok(body.paths?.["/v1/app-config"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/issues"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/agent-tasks"]);
      assert.equal(body.paths?.["/v1/chat/threads"], undefined);
      assert.equal(body.paths?.["/v1/chat/turns"], undefined);
      assert.equal(body.paths?.["/v1/chat/turns/stream"], undefined);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/transitions"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/drafts/{draftId}/commit"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/labels/{labelId}"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/templates/{templateId}/archive"]);

      const autocompletePath = body.paths?.["/v1/autocomplete"];
      assert.equal(isRecord(autocompletePath), true);
      const autocompleteSpec = JSON.stringify(
        (autocompletePath as Readonly<Record<string, unknown>>).get,
      );
      assert.match(autocompleteSpec, /"limit"/);
      assert.match(autocompleteSpec, /"results"/);
      assert.match(autocompleteSpec, /"repositoryId"/);

      const providersPath = body.paths?.["/v1/agents/providers"];
      assert.equal(isRecord(providersPath), true);
      const providersSpec = JSON.stringify(
        (providersPath as Readonly<Record<string, unknown>>).get,
      );
      assert.match(providersSpec, /"providers"/);
      assert.match(providersSpec, /"supportedJobTypes"/);
      assert.match(providersSpec, /"capabilities"/);
      assert.match(JSON.stringify(body.paths?.["/v1/agent-tasks"]), /"createAgentTask"/);
      assert.match(JSON.stringify(body.paths?.["/v1/agent-tasks/{taskId}"]), /"taskId"/);
      assert.match(JSON.stringify(body.paths?.["/v1/agent-tasks/{taskId}/events"]), /"sequence"/);

      assert.match(JSON.stringify(body.paths?.["/v1/app-config"]), /"schemaVersion"/);
      assert.match(JSON.stringify(body.paths?.["/v1/app-config"]), /"localWorkspace"/);
      assert.match(JSON.stringify(body.paths?.["/v1/profile"]), /"displayName"/);
      assert.match(JSON.stringify(body.paths?.["/v1/profile/onboarding"]), /"themePreference"/);
      assert.match(
        JSON.stringify(body.paths?.["/v1/profile/onboarding"]),
        /"enabledAgentProviderIds"/,
      );
      assert.match(JSON.stringify(body.paths?.["/v1/theme"]), /"preference"/);
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/preferences"]),
        /"commitStyle"/,
      );

      const repositoriesPath = body.paths?.["/v1/repositories"];
      assert.equal(isRecord(repositoriesPath), true);
      const repositoriesSpec = repositoriesPath as Readonly<Record<string, unknown>>;
      const listRepositoriesSpec = JSON.stringify(repositoriesSpec.get);
      assert.match(listRepositoriesSpec, /"operationId":"listRepositories"/);
      assert.match(listRepositoriesSpec, /"activeGeneration"/);
      assert.match(listRepositoriesSpec, /"repositoryId"/);
      assert.match(listRepositoriesSpec, /"additionalProperties":false/);

      const openRepositorySpec = JSON.stringify(repositoriesSpec.post);
      assert.match(openRepositorySpec, /"operationId":"openRepository"/);
      assert.match(openRepositorySpec, /"displayName"/);
      assert.match(openRepositorySpec, /"syncOnOpen"/);
      assert.match(openRepositorySpec, /"activeGeneration"/);

      const pushRepositoryPath = body.paths?.["/v1/repositories/{repositoryId}/push"];
      assert.equal(isRecord(pushRepositoryPath), true);
      assert.match(JSON.stringify(pushRepositoryPath), /"pointers"/);

      const inboxPath = body.paths?.["/v1/inbox"];
      assert.equal(isRecord(inboxPath), true);
      const inboxListSpec = JSON.stringify((inboxPath as Readonly<Record<string, unknown>>).get);
      assert.match(inboxListSpec, /"operationId":"listInbox"/);
      assert.match(inboxListSpec, /"activeSnapshotIds"/);
      assert.match(inboxListSpec, /"itemId"/);
      assert.match(inboxListSpec, /"filter\[status\]"/);

      const inboxReadPath = body.paths?.["/v1/inbox/read"];
      assert.equal(isRecord(inboxReadPath), true);
      const inboxReadSpec = JSON.stringify(
        (inboxReadPath as Readonly<Record<string, unknown>>).post,
      );
      assert.match(inboxReadSpec, /"itemIds"/);
      assert.match(inboxReadSpec, /"updatedCount"/);

      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/drafts"]),
        /"title"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/drafts/{draftId}"]),
        /"frontmatter"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/labels/{labelId}"]),
        /"color"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/users/{userId}"]),
        /"displayName"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/views"]),
        /"groupBy"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/templates"]),
        /"bodyTemplate"/,
      );

      const issuesPath = body.paths?.["/v1/repositories/{repositoryId}/issues"];
      assert.equal(isRecord(issuesPath), true);
      const listIssuesSpec = JSON.stringify((issuesPath as Readonly<Record<string, unknown>>).get);
      assert.match(listIssuesSpec, /"operationId":"listIssues"/);
      assert.match(listIssuesSpec, /"filter\[status\]\[in\]"/);
      assert.match(listIssuesSpec, /"matchedFields"/);
      assert.match(listIssuesSpec, /"ticket"/);
      const createIssueSpec = JSON.stringify(
        (issuesPath as Readonly<Record<string, unknown>>).post,
      );
      assert.match(createIssueSpec, /"title"/);
      assert.match(createIssueSpec, /"externalLinks"/);
      assert.match(createIssueSpec, /"additionalProperties":false/);
      const createIssueOperation = (issuesPath as Readonly<Record<string, unknown>>).post;
      assert.equal(isRecord(createIssueOperation), true);
      const createIssueResponses = (createIssueOperation as Readonly<Record<string, unknown>>)
        .responses;
      assert.equal(isRecord(createIssueResponses), true);
      for (const status of ["400", "401", "403", "404", "409", "422", "500", "503", "504"]) {
        assert.ok((createIssueResponses as Readonly<Record<string, unknown>>)[status]);
      }
      const badRequestSpec = JSON.stringify(
        (createIssueResponses as Readonly<Record<string, unknown>>)["400"],
      );
      assert.match(badRequestSpec, /"error"/);
      assert.match(badRequestSpec, /"requestId"/);
      assert.match(badRequestSpec, /"retryable"/);

      const issuePath = body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}"];
      assert.equal(isRecord(issuePath), true);
      assert.match(
        JSON.stringify((issuePath as Readonly<Record<string, unknown>>).patch),
        /"frontmatter"/,
      );
      assert.match(
        JSON.stringify(
          body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/transitions"],
        ),
        /"status"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/diffs"]),
        /"metadataChanges"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/history"]),
        /"snapshotId"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/relations"]),
        /"issueId"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/records"]),
        /"recordType"/,
      );
      assert.match(
        JSON.stringify(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/comments"]),
        /"body"/,
      );

      const initiativesPath = body.paths?.["/v1/repositories/{repositoryId}/initiatives"];
      assert.equal(isRecord(initiativesPath), true);
      assert.match(
        JSON.stringify((initiativesPath as Readonly<Record<string, unknown>>).post),
        /"externalLinks"/,
      );
      assert.match(
        JSON.stringify(
          body.paths?.["/v1/repositories/{repositoryId}/initiatives/{initiativeId}/progress"],
        ),
        /"statusCounts"/,
      );
      assert.match(
        JSON.stringify(
          body.paths?.["/v1/repositories/{repositoryId}/initiatives/{initiativeId}/updates"],
        ),
        /"progressNote"/,
      );

      const automationPath = body.paths?.["/v1/repositories/{repositoryId}/automation/evaluations"];
      assert.equal(isRecord(automationPath), true);
      const automationSpec = JSON.stringify(
        (automationPath as Readonly<Record<string, unknown>>).post,
      );
      assert.match(automationSpec, /"issueIds"/);
      assert.match(automationSpec, /"severityThreshold"/);
      assert.match(automationSpec, /"checkedTicketIds"/);
      assert.match(automationSpec, /"additionalProperties":false/);
    } finally {
      await api.dispose();
    }
  });

  it("rejects undeclared HTTP body fields before dispatching usecases", async () => {
    const { api, calls } = makeTestApi();

    try {
      const response = await api.fetch(
        new Request("http://cycle.test/v1/repositories/test-repository/issues", {
          ...authed({
            debug: true,
            title: "Strict HTTP payload",
          }),
          method: "POST",
        }),
      );
      const body = (await response.json()) as {
        readonly error?: {
          readonly code?: string;
          readonly message?: string;
          readonly requestId?: string;
          readonly retryable?: boolean;
        };
      };

      assert.equal(response.status, 400);
      assert.equal(response.headers.get("x-request-id"), "req_test");
      assert.equal(body.error?.code, "INVALID_REQUEST");
      assert.equal(body.error?.requestId, "req_test");
      assert.equal(body.error?.retryable, false);
      assert.equal(calls.includes("IssueCreate"), false);
    } finally {
      await api.dispose();
    }
  });

  it("normalizes framework schema failures through the listening server", async () => {
    const calls: Array<string> = [];
    const handle = await startCycleApiServer({
      staticToken: token,
      useCaseLayer: Layer.succeed(
        DatabaseService,
        DatabaseService.of(
          databaseStub({
            createTicket: (_repositoryId, input) =>
              Effect.sync(() => {
                calls.push("IssueCreate");
                return makeIssue("ISSUE-1", input.title, input.body ?? "");
              }),
          }),
        ),
      ),
    });

    try {
      const response = await fetch(`${handle.baseUrl}/v1/repositories/${repository.id}/issues`, {
        ...authed({
          debug: true,
          title: "Strict HTTP payload",
        }),
        method: "POST",
      });
      const body = (await response.json()) as {
        readonly error?: {
          readonly code?: string;
          readonly requestId?: string;
          readonly retryable?: boolean;
        };
      };

      assert.equal(response.status, 400);
      assert.equal(response.headers.get("x-request-id"), "req_test");
      assert.equal(body.error?.code, "INVALID_REQUEST");
      assert.equal(body.error?.requestId, "req_test");
      assert.equal(body.error?.retryable, false);
      assert.deepEqual(calls, []);
    } finally {
      await handle.close();
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
      agentProviders: {
        preferences: [] as TestAgentProviderPreference[],
      },
      api: {
        enabled: true,
        host: "127.0.0.1",
        port: 4738,
        staticToken: token,
      },
      localWorkspace: {
        repositories: [
          {
            addedAt: "2026-06-12T00:00:00.000Z",
            displayName: "Cycle",
            gitDbRootCommitId: "root-commit",
            id: "cycle",
            path: "/tmp/cycle",
            preferences: {
              autoSync: true,
              commitStyle: "descriptive",
              sidebarExpanded: true,
            },
          },
        ],
      },
      onboarding: {
        completed: true,
      },
      profile: {
        displayName: "Desktop User",
        email: "desktop@example.com",
      },
      schemaVersion: 4,
      theme: {
        density: "compact",
        preference: "system",
      },
    };
    const { api } = makeTestApi({
      localSettings: {
        read: async () => appConfig,
        removeRepository: async (repositoryId) => {
          appConfig = {
            ...appConfig,
            localWorkspace: {
              repositories: appConfig.localWorkspace.repositories.filter(
                (repository) => repository.id !== repositoryId,
              ),
            },
          };
          return appConfig;
        },
        setInterfaceDensity: async (density) => {
          appConfig = {
            ...appConfig,
            theme: {
              ...appConfig.theme,
              density,
            },
          };
          return appConfig;
        },
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
        updateAgentProviderPreference: async ({ preference, providerId }) => {
          const currentPreference = appConfig.agentProviders.preferences.find(
            (candidate) => candidate.id === providerId,
          ) ?? {
            config: {},
            defaultModel: null,
            enabled: false,
            executablePath: null,
            id: providerId,
            maxConcurrentRuns: 1,
          };
          const nextPreference = {
            ...currentPreference,
            ...preference,
            config: preference.config ?? currentPreference.config,
            defaultModel:
              preference.defaultModel === undefined
                ? currentPreference.defaultModel
                : preference.defaultModel,
            executablePath:
              preference.executablePath === undefined
                ? currentPreference.executablePath
                : preference.executablePath,
            maxConcurrentRuns:
              preference.maxConcurrentRuns === undefined
                ? currentPreference.maxConcurrentRuns
                : preference.maxConcurrentRuns,
          };
          appConfig = {
            ...appConfig,
            agentProviders: {
              preferences: [
                ...appConfig.agentProviders.preferences.filter(
                  (candidate) => candidate.id !== providerId,
                ),
                nextPreference,
              ],
            },
          };
          return appConfig;
        },
      },
    });

    try {
      const before = await api.fetch(new Request("http://cycle.test/v1/app-config", authed()));
      const beforeBody = (await before.json()) as {
        data?: {
          localWorkspace?: {
            repositories?: ReadonlyArray<{ gitDbRootCommitId?: string }>;
          };
          profile?: { email?: string };
        };
      };
      assert.equal(before.status, 200);
      assert.equal(beforeBody.data?.profile?.email, "desktop@example.com");
      assert.equal(
        beforeBody.data?.localWorkspace?.repositories?.[0]?.gitDbRootCommitId,
        "root-commit",
      );

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

      const density = await api.fetch(
        new Request("http://cycle.test/v1/appearance/density", {
          ...authed({ density: "spacious" }),
          method: "PATCH",
        }),
      );
      const densityBody = (await density.json()) as {
        data?: { theme?: { density?: string } };
      };
      assert.equal(density.status, 200);
      assert.equal(densityBody.data?.theme?.density, "spacious");

      const providerPreference = await api.fetch(
        new Request("http://cycle.test/v1/agents/providers/claude-code/preferences", {
          ...authed({
            preference: {
              config: {
                permissionMode: "default",
              },
              defaultModel: "claude-sonnet-4-20250514",
              enabled: true,
              executablePath: "/usr/local/bin/claude",
              maxConcurrentRuns: 2,
            },
          }),
          method: "PATCH",
        }),
      );
      const providerPreferenceBody = (await providerPreference.json()) as {
        data?: {
          agentProviders?: {
            preferences?: ReadonlyArray<{
              defaultModel?: string | null;
              enabled?: boolean;
              executablePath?: string | null;
              id?: string;
              maxConcurrentRuns?: number | null;
            }>;
          };
        };
      };
      const claudePreference = providerPreferenceBody.data?.agentProviders?.preferences?.find(
        (preference) => preference.id === "claude-code",
      );
      assert.equal(providerPreference.status, 200);
      assert.equal(claudePreference?.enabled, true);
      assert.equal(claudePreference?.defaultModel, "claude-sonnet-4-20250514");
      assert.equal(claudePreference?.executablePath, "/usr/local/bin/claude");
      assert.equal(claudePreference?.maxConcurrentRuns, 2);

      const removed = await api.fetch(
        new Request("http://cycle.test/v1/repositories/cycle", {
          ...authed(),
          method: "DELETE",
        }),
      );
      const removedBody = (await removed.json()) as {
        data?: { localWorkspace?: { repositories?: readonly unknown[] } };
      };
      assert.equal(removed.status, 200);
      assert.equal(removedBody.data?.localWorkspace?.repositories?.length, 0);

      const after = await api.fetch(new Request("http://cycle.test/v1/app-config", authed()));
      const afterBody = (await after.json()) as {
        data?: {
          localWorkspace?: { repositories?: readonly unknown[] };
          profile?: { email?: string };
          theme?: { density?: string };
        };
      };
      assert.equal(afterBody.data?.profile?.email, "web@example.com");
      assert.equal(afterBody.data?.theme?.density, "spacious");
      assert.equal(afterBody.data?.localWorkspace?.repositories?.length, 0);
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
            type: "task",
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
      useCaseLayer: unexpectedDatabaseLayer,
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
      assert.equal(body.data?.providers?.length, 1);
    } finally {
      await api.dispose();
    }
  });

  it("uses the runtime MCP URL instead of a portless request origin for chat turns", () => {
    const prepared = prepareChatTurn({
      origin: "http://127.0.0.1",
      payload: {
        message: "hello",
      },
      requestId: "req_mcp_origin",
      runtime: {
        mcpPath: "/mcp",
        mcpUrl: "http://127.0.0.1:4738/mcp",
        staticToken: token,
      } as CycleApiRuntimeShape,
    });

    assert.equal(prepared.agentRequest.mcp?.mode, "http");
    if (prepared.agentRequest.mcp?.mode === "http") {
      assert.equal(prepared.agentRequest.mcp.url, "http://127.0.0.1:4738/mcp");
      assert.equal(prepared.agentRequest.mcp.headers?.authorization, `Bearer ${token}`);
    }
    assert.match(prepared.agentRequest.instructions ?? "", /cycle-repository:<repositoryId>/u);
    assert.match(
      prepared.agentRequest.instructions ?? "",
      /Assigned ticket implementation workflow/u,
    );
    assert.match(prepared.agentRequest.instructions ?? "", /Do not create a pull request/u);
  });

  it("adds assigned ticket workflow instructions for ticket work chat origins", () => {
    const instructions = chatOriginInstructions({
      createdAt: "2026-06-16T00:00:01.000Z",
      id: "thread-ticket-work",
      origin: {
        issueId: "ISSUE-1",
        kind: "ticket-agent-work",
        repositoryId: repository.id,
        ticketId: "ISSUE-1",
        trigger: "ticket-view",
      },
      status: "active",
      summary: "Implement ISSUE-1",
      title: "Work on ISSUE-1",
      updatedAt: "2026-06-16T00:00:01.000Z",
    });

    assert.match(
      instructions ?? "",
      /This chat thread was started for Cycle ticket implementation/u,
    );
    assert.match(instructions ?? "", /Assigned ticket implementation workflow/u);
    assert.match(instructions ?? "", /dedicated git worktree/u);
    assert.match(instructions ?? "", /cycle:\/\/repository\/test-repository\/tickets\/ISSUE-1/u);
  });

  it("starts issue mention chat threads for tagged Codex and Claude providers", async () => {
    const agentChatStore = makeInMemoryAgentChatStore();
    const timestamp = new Date("2026-06-16T00:00:01.000Z");
    const captured: Array<{
      readonly provider: AgentProviderId;
      readonly request: AgentTurnRequest;
      readonly sessionId: string;
    }> = [];
    const fakeAgent = (provider: AgentProviderId): AgentService => ({
      abortTurn: async () => ({ accepted: false, reason: "not_supported" }),
      capabilities: () => defaultAgentCapabilities(provider),
      listModels: async () => ({
        defaultModelId: null,
        fetchedAt: timestamp.toISOString(),
        models: [],
        provider,
        source: "unsupported",
      }),
      close: async () => undefined,
      createSession: async () => ({
        createdAt: timestamp,
        harnessId: provider,
        id: `session_${provider}`,
        provider,
        updatedAt: timestamp,
      }),
      provider,
      resumeSession: async (sessionId) => ({
        createdAt: timestamp,
        harnessId: provider,
        id: sessionId,
        provider,
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
      run: async (sessionId, request) => {
        captured.push({ provider, request, sessionId });
        return {
          artifacts: [],
          completedAt: timestamp,
          createdAt: timestamp,
          finishReason: "stop",
          id: `message_${provider}`,
          provider,
          sessionId,
          status: "completed",
          text: `${provider} inspected the ticket.`,
        };
      },
      stream: () => failingAgentStream("Issue mention test should not stream the provider."),
    });
    const { api } = makeTestApi({
      agentChatStore,
      agentProviderProfiles: async () => [
        {
          activeRunCount: 0,
          capabilities: defaultAgentCapabilities("codex"),
          checkedAt: timestamp.toISOString(),
          configuration: {},
          defaultModel: "gpt-5-codex",
          displayName: "Codex",
          enabled: true,
          executableName: "codex",
          executablePath: "/usr/local/bin/codex",
          maxConcurrentRuns: 2,
          models: ["gpt-5-codex"],
          provider: "codex",
          status: "available",
        },
        {
          activeRunCount: 0,
          capabilities: defaultAgentCapabilities("claude-code"),
          checkedAt: timestamp.toISOString(),
          configuration: {},
          defaultModel: "claude-sonnet-4-5",
          displayName: "Claude Code",
          enabled: true,
          executableName: "claude",
          executablePath: "/usr/local/bin/claude",
          maxConcurrentRuns: 2,
          models: ["claude-sonnet-4-5"],
          provider: "claude-code",
          status: "available",
        },
      ],
      agentServices: {
        serviceFor: (provider) => Effect.succeed(fakeAgent(provider)),
      },
      mcp: {
        enabled: true,
        path: "/mcp",
      },
      now: () => timestamp,
    });

    try {
      const response = await api.fetch(
        new Request(`http://cycle.test/v1/repositories/${repository.id}/issues/ISSUE-1/records`, {
          ...authed({
            payload: {
              body: "Please inspect [Codex](cycle-agent:codex) and [Claude Code](cycle-agent:claude-code).",
            },
            recordType: "comment",
          }),
          method: "POST",
        }),
      );
      assert.equal(response.status, 201);

      let threads = await agentChatStore.listThreads();
      for (let attempt = 0; attempt < 20 && threads.length < 2; attempt++) {
        await delay(10);
        threads = await agentChatStore.listThreads();
      }

      const codexThread = threads.find((thread) => thread.agentId === "codex");
      const claudeThread = threads.find((thread) => thread.agentId === "claude-code");
      assert.equal(codexThread?.origin?.kind, "issue-comment");
      assert.equal(codexThread?.origin?.commentId, "COMMENT-1");
      assert.equal(claudeThread?.origin?.kind, "issue-comment");
      assert.equal(claudeThread?.origin?.commentId, "COMMENT-1");
      assert.equal(codexThread?.model, "gpt-5-codex");
      assert.equal(claudeThread?.model, "claude-sonnet-4-5");

      const codexMessages = await agentChatStore.listMessages(codexThread?.id ?? "");
      const claudeMessages = await agentChatStore.listMessages(claudeThread?.id ?? "");
      assert.ok(
        codexMessages.some(
          (message) =>
            message.actor === "user" &&
            message.body.includes("cycle-agent:codex") &&
            message.body.includes("cycle://repository/test-repository/tickets/ISSUE-1"),
        ),
      );
      assert.ok(
        claudeMessages.some(
          (message) =>
            message.actor === "user" &&
            message.body.includes("cycle-agent:claude-code") &&
            message.body.includes("cycle://repository/test-repository/tickets/ISSUE-1"),
        ),
      );
      assert.deepEqual(captured.map((entry) => entry.provider).sort(), ["claude-code", "codex"]);
      assert.ok(
        captured.every((entry) =>
          String(entry.request.input).includes(
            "cycle://repository/test-repository/tickets/ISSUE-1",
          ),
        ),
      );
    } finally {
      await api.dispose();
    }
  });

  it("cancels stale active chat turns over the WebSocket endpoint", async () => {
    const agentChatStore = makeInMemoryAgentChatStore();
    const timestamp = "2026-06-16T00:00:01.000Z";
    const threadId = "thread_stale_cancel";
    const turnId = "turn_stale_cancel";
    const fakeAgent: AgentService = {
      abortTurn: async () => ({ accepted: false, reason: "not_found" }),
      capabilities: () => defaultAgentCapabilities("codex"),
      listModels: async () => ({
        defaultModelId: null,
        fetchedAt: timestamp,
        models: [],
        provider: "codex",
        source: "unsupported",
      }),
      close: async () => undefined,
      createSession: async () => {
        throw new Error("Stale cancel test should not create a provider session.");
      },
      provider: "codex",
      resumeSession: async () => {
        throw new Error("Stale cancel test should not resume a provider session.");
      },
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
        throw new Error("Stale cancel test should not run the provider.");
      },
      stream: () => failingAgentStream("Stale cancel test should not stream the provider."),
    };

    await agentChatStore.upsertThread({
      activeTurnId: turnId,
      agentId: "codex",
      createdAt: timestamp,
      id: threadId,
      status: "active",
      summary: "Stale active turn",
      title: "Stale active turn",
      updatedAt: timestamp,
    });
    await agentChatStore.upsertTurn?.({
      createdAt: timestamp,
      id: turnId,
      inputMessageId: "message_stale_cancel",
      providerId: "codex",
      status: "running",
      threadId,
      updatedAt: timestamp,
    });

    const handle = await startCycleApiServer({
      agentChatStore,
      agentServices: {
        serviceFor: () => Effect.succeed(fakeAgent),
      },
      useCaseLayer: unexpectedDatabaseLayer,
      staticToken: token,
    });
    const client = await connectChatSocket(handle.baseUrl);

    try {
      const cancelCommandId = client.send("turn.cancel", { threadId, turnId });
      const cancelAck = await client.waitFor(
        (message) => message.type === "command.ack" && message.commandId === cancelCommandId,
      );
      assert.deepEqual(commandPayloadResult(cancelAck), {
        accepted: true,
        reason: "stale_cleared",
        staleCleared: true,
      });

      const thread = await agentChatStore.getThread?.(threadId);
      const turns = (await agentChatStore.listTurns?.(threadId)) ?? [];
      assert.equal(thread?.activeTurnId, null);
      assert.equal(turns.find((turn) => turn.id === turnId)?.status, "cancelled");
    } finally {
      client.close();
      await handle.close();
    }
  });

  it("rejects invalid chat WebSocket command payloads at the schema boundary", async () => {
    const agentChatStore = makeInMemoryAgentChatStore();
    const handle = await startCycleApiServer({
      agentChatStore,
      useCaseLayer: unexpectedDatabaseLayer,
      staticToken: token,
    });
    const client = await connectChatSocket(handle.baseUrl);

    try {
      client.sendRaw({
        commandId: "cmd_invalid_payload",
        payload: {
          debug: true,
          providerId: "codex",
        },
        type: "thread.create",
        version: 1,
      });
      const error = await client.waitFor(
        (message) =>
          message.type === "command.error" &&
          isRecord(message.payload) &&
          message.payload.code === "INVALID_MESSAGE",
      );

      assert.equal(isRecord(error.payload), true);
      assert.match(
        String(isRecord(error.payload) ? error.payload.message : ""),
        /invalid message/u,
      );
      assert.deepEqual(await agentChatStore.listThreads(), []);
    } finally {
      client.close();
      await handle.close();
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
      listModels: async () => ({
        defaultModelId: null,
        fetchedAt: timestamp.toISOString(),
        models: [],
        provider: "codex",
        source: "unsupported",
      }),
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
          item: {
            command: "pnpm --filter @cycle/ui typecheck",
            id: "item_command",
            type: "commandExecution",
          },
          itemId: "item_command",
          itemType: "commandExecution",
          sessionId,
          turnId: "turn_ws_provider",
          type: "item.started",
        };
        yield {
          artifact: {
            input: {
              command: "pnpm --filter @cycle/ui typecheck",
            },
            metadata: {
              itemId: "item_command",
            },
            name: "command_execution",
            output: "No type errors.",
            status: "completed",
            type: "tool",
          },
          at: timestamp,
          sessionId,
          turnId: "turn_ws_provider",
          type: "artifact",
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
          request: {
            createdAt: timestamp.toISOString(),
            prompt: "Choose how much command output to show.",
            questions: [
              {
                header: "Output",
                id: "output",
                multiSelect: false,
                options: [
                  {
                    description: "Keep the activity group compact unless opened.",
                    label: "Compact",
                    value: "compact",
                  },
                  {
                    description: "Show all captured command output inline.",
                    label: "Verbose",
                    value: "verbose",
                  },
                ],
                question: "How much command output should the chat show?",
                type: "single_select",
              },
            ],
            requestId: "question_output_mode",
            sessionId,
            turnId: "turn_ws_provider",
          },
          sessionId,
          turnId: "turn_ws_provider",
          type: "user-input.requested",
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
      useCaseLayer: unexpectedDatabaseLayer,
      staticToken: token,
    });
    const client = await connectChatSocket(handle.baseUrl);

    try {
      const createCommandId = client.send("thread.create", {
        origin: {
          commentId: "comment-1",
          issueId: "ROB-10001",
          kind: "issue-comment",
          repositoryId: "cycle",
        },
        providerId: "codex",
        runtimeMode: "workspace-write",
        thinkingLevel: "high",
      });
      const createAck = await client.waitFor(
        (message) => message.type === "command.ack" && message.commandId === createCommandId,
      );
      const createdThread = commandPayloadResult(createAck).thread;
      assert.equal(isRecord(createdThread), true);
      const threadId = isRecord(createdThread) ? String(createdThread.id) : "";
      assert.match(threadId, /^thread_/u);
      assert.equal(
        isRecord(createdThread) ? createdThread.runtimeMode : undefined,
        "workspace-write",
      );
      assert.deepEqual(isRecord(createdThread) ? createdThread.origin : undefined, {
        commentId: "comment-1",
        issueId: "ROB-10001",
        kind: "issue-comment",
        repositoryId: "cycle",
      });

      client.send("thread.subscribe", { threadId });
      await client.waitFor(
        (message) => message.type === "thread.snapshot" && message.threadId === threadId,
      );

      const turnCommandId = client.send("turn.send", {
        message: "Stream a reply",
        providerId: "codex",
        runtimeMode: "workspace-write",
        thinkingLevel: "high",
        threadId,
      });
      const turnAck = await client.waitFor(
        (message) => message.type === "command.ack" && message.commandId === turnCommandId,
      );
      const ackTurn = commandPayloadResult(turnAck).turn;
      assert.equal(isRecord(ackTurn) ? ackTurn.runtimeMode : undefined, "workspace-write");

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
      const commandActivityEvent = await client.waitFor(
        (message) =>
          message.type === "activity.upserted" &&
          message.threadId === threadId &&
          isRecord(message.payload) &&
          isRecord(message.payload.activity) &&
          message.payload.activity.id === "activity-command_item_command" &&
          message.payload.activity.status === "completed",
      );
      const questionEvent = await client.waitFor(
        (message) =>
          message.type === "question.created" &&
          message.threadId === threadId &&
          isRecord(message.payload) &&
          isRecord(message.payload.question) &&
          message.payload.question.id === "question_output_mode",
      );
      await client.waitFor(
        (message) => message.type === "turn.completed" && message.threadId === threadId,
      );

      const persistedMessages = await agentChatStore.listMessages(threadId);
      const persistedActivities = (await agentChatStore.listActivities?.(threadId)) ?? [];
      const persistedEvents = (await agentChatStore.listEventsAfter?.(threadId, 0)) ?? [];
      const persistedQuestions = (await agentChatStore.listQuestions?.(threadId)) ?? [];
      const persistedTurns = (await agentChatStore.listTurns?.(threadId)) ?? [];

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
      const commandActivity = persistedActivities.find(
        (activity) => activity.id === "activity-command_item_command",
      );
      assert.equal(commandActivity?.title, "Command");
      assert.equal(commandActivity?.detail, "pnpm --filter @cycle/ui typecheck");
      assert.equal(commandActivity?.payload?.command, "pnpm --filter @cycle/ui typecheck");
      const commandActivityFirstSequence = persistedEvents.find(
        (event) =>
          event.type === "activity.upserted" &&
          isRecord(event.payload.activity) &&
          event.payload.activity.id === "activity-command_item_command",
      )?.sequence;
      const thinkingActivity = persistedActivities.find(
        (activity) => activity.id === "activity-thinking",
      );
      assert.equal(thinkingActivity?.kind, "thinking");
      assert.equal(thinkingActivity?.status, "completed");
      assert.equal(thinkingActivity?.detail, undefined);
      assert.equal(thinkingActivity?.payload, undefined);
      assert.equal(persistedQuestions[0]?.id, "question_output_mode");
      assert.equal(persistedTurns[0]?.runtimeMode, "workspace-write");
      assert.equal((await agentChatStore.getThread?.(threadId))?.runtimeMode, "workspace-write");
      assert.equal(
        typeof commandActivityEvent.sequence === "number" &&
          typeof questionEvent.sequence === "number" &&
          commandActivityEvent.sequence < questionEvent.sequence,
        true,
      );
      assert.equal(captured?.sessionId, threadId);
      assert.match(String(captured?.request.input), /Current user message/u);
      assert.match(captured?.request.instructions ?? "", /Cycle MCP: attached as agent tools/u);
      assert.match(
        captured?.request.instructions ?? "",
        /cycle:\/\/repository\/cycle\/tickets\/ROB-10001/u,
      );
      {
        const repositories = isRecord(captured?.request.context)
          ? arrayValue(captured.request.context.repositories)
          : [];
        const repository = repositories[0];
        assert.equal(isRecord(repository) ? repository.id : undefined, "cycle");
      }
      assert.equal((captured?.request.instructions ?? "").includes(handle.baseUrl), false);
      assert.equal(captured?.request.model, undefined);
      assert.equal(captured?.request.runtimeMode, "workspace-write");
      assert.equal(captured?.request.metadata?.thinkingLevel, "high");
      assert.equal(captured?.request.signal instanceof AbortSignal, true);
      assert.equal(captured?.request.signal?.aborted, false);
      assert.equal(captured?.request.mcp?.mode, "http");
      if (captured?.request.mcp?.mode === "http") {
        assert.equal(captured.request.mcp.url, `${handle.baseUrl}/mcp`);
        assert.equal(captured.request.mcp.headers?.authorization, `Bearer ${token}`);
      }
      const snapshotCommandId = client.send("thread.subscribe", { threadId });
      const resumedSnapshot = await client.waitFor(
        (message) =>
          message.type === "thread.snapshot" &&
          message.threadId === threadId &&
          message.commandId === snapshotCommandId,
      );
      const snapshotPayload = isRecord(resumedSnapshot.payload) ? resumedSnapshot.payload : {};
      const snapshotActivities = arrayValue(snapshotPayload.activities).filter(isRecord);
      const snapshotQuestions = arrayValue(snapshotPayload.questions).filter(isRecord);
      const snapshotCommandActivity = snapshotActivities.find(
        (activity) => activity.id === "activity-command_item_command",
      );
      const snapshotQuestion = snapshotQuestions.find(
        (question) => question.id === "question_output_mode",
      );
      assert.equal(
        isRecord(snapshotPayload.thread) ? snapshotPayload.thread.runtimeMode : undefined,
        "workspace-write",
      );
      assert.equal(snapshotCommandActivity?.timelineSequence, commandActivityFirstSequence);
      assert.equal(snapshotQuestion?.timelineSequence, questionEvent.sequence);
    } finally {
      client.close();
      await handle.close();
    }
  });

  it("keeps item-scoped assistant messages in timeline order around command activity", async () => {
    const timestamp = new Date("2026-06-16T00:00:01.000Z");
    const agentChatStore = makeInMemoryAgentChatStore();
    const fakeAgent: AgentService = {
      abortTurn: async () => ({ accepted: false, reason: "not_supported" }),
      capabilities: () => defaultAgentCapabilities("codex"),
      listModels: async () => ({
        defaultModelId: null,
        fetchedAt: timestamp.toISOString(),
        models: [],
        provider: "codex",
        source: "unsupported",
      }),
      close: async () => undefined,
      createSession: async () => ({
        createdAt: timestamp,
        harnessId: "codex",
        id: "session_split_test",
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
      stream: async function* (sessionId) {
        yield {
          at: timestamp,
          provider: "codex",
          sessionId,
          turnId: "turn_split_provider",
          type: "turn.started",
        };
        yield {
          at: new Date("2026-06-16T00:00:02.000Z"),
          delta: "I will run the focused check.",
          itemId: "agent_item_1",
          sessionId,
          snapshot: "I will run the focused check.",
          streamKind: "assistant_text",
          turnId: "turn_split_provider",
          type: "content.delta",
        };
        yield {
          at: new Date("2026-06-16T00:00:02.000Z"),
          delta: "I will run the focused check.",
          sessionId,
          snapshot: "I will run the focused check.",
          turnId: "turn_split_provider",
          type: "text.delta",
        };
        yield {
          at: new Date("2026-06-16T00:00:03.000Z"),
          item: {
            command: "pnpm --filter @cycle/ui typecheck",
            id: "item_command",
            type: "commandExecution",
          },
          itemId: "item_command",
          itemType: "commandExecution",
          sessionId,
          turnId: "turn_split_provider",
          type: "item.started",
        };
        yield {
          at: new Date("2026-06-16T00:00:04.000Z"),
          item: {
            command: "pnpm --filter @cycle/ui typecheck",
            id: "item_command",
            type: "commandExecution",
          },
          itemId: "item_command",
          itemType: "commandExecution",
          sessionId,
          turnId: "turn_split_provider",
          type: "item.completed",
        };
        yield {
          at: new Date("2026-06-16T00:00:05.000Z"),
          delta: "The check passed; I am summarizing the result.",
          itemId: "agent_item_2",
          sessionId,
          snapshot: "I will run the focused check.The check passed; I am summarizing the result.",
          streamKind: "assistant_text",
          turnId: "turn_split_provider",
          type: "content.delta",
        };
        yield {
          at: new Date("2026-06-16T00:00:05.000Z"),
          delta: "The check passed; I am summarizing the result.",
          sessionId,
          snapshot: "I will run the focused check.The check passed; I am summarizing the result.",
          turnId: "turn_split_provider",
          type: "text.delta",
        };
        yield {
          at: new Date("2026-06-16T00:00:06.000Z"),
          result: {
            artifacts: [],
            createdAt: timestamp,
            finishReason: "stop",
            id: "turn_split_provider",
            metadata: {},
            provider: "codex",
            sessionId,
            status: "completed",
            text: "I will run the focused check.The check passed; I am summarizing the result.",
          },
          sessionId,
          turnId: "turn_split_provider",
          type: "turn.completed",
        };
      },
    };
    const handle = await startCycleApiServer({
      agentChatStore,
      agentServices: {
        serviceFor: () => Effect.succeed(fakeAgent),
      },
      useCaseLayer: unexpectedDatabaseLayer,
      staticToken: token,
    });
    const client = await connectChatSocket(handle.baseUrl);

    try {
      const createCommandId = client.send("thread.create", { providerId: "codex" });
      const createAck = await client.waitFor(
        (message) => message.type === "command.ack" && message.commandId === createCommandId,
      );
      const createdThread = commandPayloadResult(createAck).thread;
      const threadId = isRecord(createdThread) ? String(createdThread.id) : "";
      client.send("thread.subscribe", { threadId });
      await client.waitFor(
        (message) => message.type === "thread.snapshot" && message.threadId === threadId,
      );

      client.send("turn.send", {
        message: "Run the focused check",
        providerId: "codex",
        threadId,
      });
      await client.waitFor(
        (message) => message.type === "turn.completed" && message.threadId === threadId,
      );

      const persistedMessages = await agentChatStore.listMessages(threadId);
      const assistantMessages = persistedMessages.filter((message) => message.actor === "agent");
      assert.equal(assistantMessages.length, 2);
      assert.equal(assistantMessages[0]?.body, "I will run the focused check.");
      assert.equal(assistantMessages[1]?.body, "The check passed; I am summarizing the result.");
      assert.equal(
        assistantMessages.every((message) => message.streaming === false),
        true,
      );

      const persistedEvents = (await agentChatStore.listEventsAfter?.(threadId, 0)) ?? [];
      const messageCreatedSequence = (messageId: string | undefined) =>
        persistedEvents.find(
          (event) =>
            event.type === "message.created" &&
            isRecord(event.payload.message) &&
            event.payload.message.id === messageId,
        )?.sequence;
      const commandActivitySequence = persistedEvents.find(
        (event) =>
          event.type === "activity.upserted" &&
          isRecord(event.payload.activity) &&
          event.payload.activity.id === "activity-command_item_command",
      )?.sequence;

      assert.equal(
        typeof messageCreatedSequence(assistantMessages[0]?.id) === "number" &&
          typeof commandActivitySequence === "number" &&
          typeof messageCreatedSequence(assistantMessages[1]?.id) === "number" &&
          messageCreatedSequence(assistantMessages[0]?.id)! < commandActivitySequence &&
          commandActivitySequence < messageCreatedSequence(assistantMessages[1]?.id)!,
        true,
      );
    } finally {
      client.close();
      await handle.close();
    }
  });

  it("deletes chat threads over the WebSocket endpoint", async () => {
    const agentChatStore = makeInMemoryAgentChatStore();
    const handle = await startCycleApiServer({
      agentChatStore,
      staticToken: token,
      useCaseLayer: unexpectedDatabaseLayer,
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
            type: "task",
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
    const appLayer = (
      makeCycleApiLayer({
        staticToken: token,
        useCaseLayer: issueCreateDatabaseLayer(calls),
      }) as Layer.Layer<never, unknown, any>
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
            type: "task",
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
    const handle = await Effect.runPromise(
      startCycleApiServerEffect({
        host: "127.0.0.1",
        logging: {
          console: false,
          file: { enabled: false },
        },
        staticToken: token,
        useCaseLayer: issueCreateDatabaseLayer(calls),
      }).pipe(Effect.provide([NodeServices.layer, Layer.succeed(Tracer.Tracer, tracer)])),
    );

    try {
      const response = await fetch(`${handle.baseUrl}/v1/repositories/${repository.id}/issues`, {
        body: JSON.stringify({
          title: "Server traced issue",
          type: "task",
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
            type: "task",
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
      assert.deepEqual(calls, ["IssueCreate", "IssueGet", "IssueTransition"]);
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
