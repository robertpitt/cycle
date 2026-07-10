import { strict as assert } from "node:assert";
import {
  defaultAgentCapabilities,
  type AgentProviderId,
  type AgentProviderProfile,
} from "@cycle/agents";
import { DatabaseService, type DatabaseServiceShape } from "@cycle/database";
import { type TicketDocument } from "@cycle/contracts";
import { Effect, Layer, Tracer } from "effect";
import { NodeServices } from "@effect/platform-node";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { describe, it } from "vitest";
import {
  makeCycleApi,
  makeCycleApiLayer,
  startCycleApiServer,
  startCycleApiServerEffect,
} from "../src/index.ts";

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
    addIssueRelation: (_repositoryId, issueId, relation) =>
      Effect.sync(() => {
        calls.push("IssueRelationAdd");
        const sourceIndex = issues.findIndex((issue) => issue.id === issueId);
        const targetIndex = issues.findIndex((issue) => issue.id === relation.issueId);
        const source = issues[sourceIndex];
        const target = issues[targetIndex];
        if (source === undefined || target === undefined) throw new Error("Missing relation issue");
        const inverseType =
          relation.type === "depends_on"
            ? "blocks"
            : relation.type === "blocks"
              ? "depends_on"
              : relation.type;
        const updatedSource = {
          ...source,
          frontmatter: {
            ...source.frontmatter,
            relations: [...(source.frontmatter.relations ?? []), relation],
          },
        } as TicketDocument;
        issues[sourceIndex] = updatedSource;
        issues[targetIndex] = {
          ...target,
          frontmatter: {
            ...target.frontmatter,
            relations: [...(target.frontmatter.relations ?? []), { issueId, type: inverseType }],
          },
        } as TicketDocument;
        return updatedSource;
      }),
    createTicket: (_repositoryId, input) =>
      Effect.sync(() => {
        calls.push("IssueCreate");
        const issue = makeIssue(`ISSUE-${issues.length + 1}`, input.title, input.body ?? "");
        issues.push(issue);
        return issue;
      }),
    getTicket: (_repositoryId, ticketId) =>
      Effect.sync(() => {
        calls.push("IssueGet");
        return issues.find((issue) => issue.id === ticketId) ?? null;
      }),
    listRepositories: Effect.sync(() => {
      calls.push("RepositoryList");
      return [makeRepositoryStatus()];
    }),
    listIssueRelations: (_repositoryId, issueId) =>
      Effect.sync(() => {
        calls.push("IssueRelationList");
        return issues.find((issue) => issue.id === issueId)?.frontmatter.relations ?? [];
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
    removeIssueRelation: (_repositoryId, issueId, relation) =>
      Effect.sync(() => {
        calls.push("IssueRelationRemove");
        const sourceIndex = issues.findIndex((issue) => issue.id === issueId);
        const source = issues[sourceIndex];
        const target = issues.find((issue) => issue.id === relation.issueId);
        if (source === undefined || target === undefined) throw new Error("Missing relation issue");
        const updatedSource = {
          ...source,
          frontmatter: {
            ...source.frontmatter,
            relations: (source.frontmatter.relations ?? []).filter(
              (entry) => entry.issueId !== relation.issueId || entry.type !== relation.type,
            ),
          },
        } as TicketDocument;
        issues[sourceIndex] = updatedSource;
        return updatedSource;
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
      useCaseLayer: Layer.mergeAll(Layer.succeed(DatabaseService, DatabaseService.of(database))),
    }),
    calls,
    comments,
    issues,
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

      const docs = await api.fetch(new Request("http://cycle.test/"));
      const docsBody = await docs.text();
      assert.equal(docs.status, 200);
      assert.match(docs.headers.get("content-type") ?? "", /^text\/html/);
      assert.match(docsBody, /<redoc spec-url="\/openapi\.json"><\/redoc>/);
      assert.match(
        docsBody,
        /https:\/\/cdn\.redoc\.ly\/redoc\/latest\/bundles\/redoc\.standalone\.js/,
      );

      const spec = await api.fetch(new Request("http://cycle.test/openapi.json"));
      const body = (await spec.json()) as {
        components?: {
          parameters?: Record<string, unknown>;
          schemas?: Record<string, unknown>;
        };
        openapi?: string;
        paths?: Record<string, unknown>;
      };
      const serializedSpec = JSON.stringify(body);
      assert.equal(spec.status, 200);
      assert.equal(body.openapi, "3.1.0");
      assert.doesNotMatch(serializedSpec, /\b(?:Infinity|NaN)\b/);
      assert.doesNotMatch(serializedSpec, /AnyPayload|Schema\.Unknown/);
      assert.ok(body.paths?.["/"]);
      assert.ok(body.paths?.["/openapi.json"]);
      assert.ok(body.paths?.["/spec.json"]);
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
      assert.equal(
        body.paths?.[
          "/v1/repositories/{repositoryId}/issues/{issueId}/comments/{commentId}/archive"
        ],
        undefined,
      );
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/issues/{issueId}/transitions"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/drafts/{draftId}/commit"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/labels/{labelId}"]);
      assert.ok(body.paths?.["/v1/repositories/{repositoryId}/templates/{templateId}/archive"]);

      const autocompletePath = body.paths?.["/v1/autocomplete"];
      assert.equal(isRecord(autocompletePath), true);
      const autocompleteSpec = JSON.stringify(
        (autocompletePath as Readonly<Record<string, unknown>>).get,
      );
      assert.match(serializedSpec, /"page\[limit\]"/);
      assert.match(autocompleteSpec, /"results"/);
      assert.match(autocompleteSpec, /"repositoryId"/);

      const providersPath = body.paths?.["/v1/agents/providers"];
      assert.equal(isRecord(providersPath), true);
      const providersSpec = JSON.stringify(
        (providersPath as Readonly<Record<string, unknown>>).get,
      );
      assert.match(providersSpec, /"providers"/);
      assert.match(serializedSpec, /"supportedJobTypes"/);
      assert.match(serializedSpec, /"capabilities"/);
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
      assert.match(serializedSpec, /"activeGeneration"/);
      assert.match(serializedSpec, /"repositoryId"/);
      assert.match(serializedSpec, /"additionalProperties":false/);

      const openRepositorySpec = JSON.stringify(repositoriesSpec.post);
      assert.match(openRepositorySpec, /"operationId":"openRepository"/);
      assert.match(serializedSpec, /"displayName"/);
      assert.match(serializedSpec, /"syncOnOpen"/);
      assert.doesNotMatch(openRepositorySpec, /"store"/);
      assert.match(serializedSpec, /"activeGeneration"/);

      const pushRepositoryPath = body.paths?.["/v1/repositories/{repositoryId}/push"];
      assert.equal(isRecord(pushRepositoryPath), true);
      assert.match(serializedSpec, /"pointers"/);

      const inboxPath = body.paths?.["/v1/inbox"];
      assert.equal(isRecord(inboxPath), true);
      const inboxListSpec = JSON.stringify((inboxPath as Readonly<Record<string, unknown>>).get);
      assert.match(inboxListSpec, /"operationId":"listInbox"/);
      assert.match(serializedSpec, /"activeSnapshotIds"/);
      assert.match(serializedSpec, /"itemId"/);
      assert.match(serializedSpec, /"filter\[status\]"/);

      const inboxReadPath = body.paths?.["/v1/inbox/read"];
      assert.equal(isRecord(inboxReadPath), true);
      const inboxReadSpec = JSON.stringify(
        (inboxReadPath as Readonly<Record<string, unknown>>).post,
      );
      assert.match(inboxReadSpec, /"operationId":"markInboxRead"/);
      assert.match(serializedSpec, /"itemIds"/);
      assert.match(serializedSpec, /"updatedCount"/);

      assert.match(serializedSpec, /"title"/);
      assert.match(serializedSpec, /"frontmatter"/);
      assert.match(serializedSpec, /"color"/);
      assert.match(serializedSpec, /"displayName"/);
      assert.match(serializedSpec, /"groupBy"/);
      assert.match(serializedSpec, /"bodyTemplate"/);

      const issuesPath = body.paths?.["/v1/repositories/{repositoryId}/issues"];
      assert.equal(isRecord(issuesPath), true);
      const listIssuesSpec = JSON.stringify((issuesPath as Readonly<Record<string, unknown>>).get);
      assert.match(listIssuesSpec, /"operationId":"listIssues"/);
      assert.match(serializedSpec, /"filter\[status\]\[in\]"/);
      assert.match(serializedSpec, /"matchedFields"/);
      assert.match(serializedSpec, /"ticket"/);
      const createIssueSpec = JSON.stringify(
        (issuesPath as Readonly<Record<string, unknown>>).post,
      );
      assert.match(createIssueSpec, /"operationId":"createIssue"/);
      assert.match(serializedSpec, /"title"/);
      assert.match(serializedSpec, /"externalLinks"/);
      assert.match(serializedSpec, /"additionalProperties":false/);
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
      assert.match(serializedSpec, /"frontmatter"/);
      assert.match(serializedSpec, /"status"/);
      assert.match(serializedSpec, /"metadataChanges"/);
      assert.match(serializedSpec, /"snapshotId"/);
      assert.match(serializedSpec, /"issueId"/);
      assert.match(serializedSpec, /"recordType"/);

      const legacySpec = await api.fetch(new Request("http://cycle.test/spec.json"));
      const legacyBody = (await legacySpec.json()) as { openapi?: string };
      assert.equal(legacySpec.status, 200);
      assert.equal(legacyBody.openapi, "3.1.0");
      assert.match(serializedSpec, /"body"/);

      const initiativesPath = body.paths?.["/v1/repositories/{repositoryId}/initiatives"];
      assert.equal(isRecord(initiativesPath), true);
      assert.match(serializedSpec, /"externalLinks"/);
      assert.match(serializedSpec, /"statusCounts"/);
      assert.match(serializedSpec, /"progressNote"/);

      const automationPath = body.paths?.["/v1/repositories/{repositoryId}/automation/evaluations"];
      assert.equal(isRecord(automationPath), true);
      const automationSpec = JSON.stringify(
        (automationPath as Readonly<Record<string, unknown>>).post,
      );
      assert.match(automationSpec, /"operationId":"evaluateAutomation"/);
      assert.match(serializedSpec, /"issueIds"/);
      assert.match(serializedSpec, /"severityThreshold"/);
      assert.match(serializedSpec, /"checkedTicketIds"/);
      assert.match(serializedSpec, /"additionalProperties":false/);
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

  it("adds, lists, removes, and validates dependency relations", async () => {
    const { api, issues } = makeTestApi();
    issues.push(makeIssue("ISSUE-1", "Dependent", ""), makeIssue("ISSUE-2", "Prerequisite", ""));

    try {
      const relationUrl =
        "http://cycle.test/v1/repositories/test-repository/issues/ISSUE-1/relations";
      const added = await api.fetch(
        new Request(relationUrl, {
          ...authed({ issueId: "ISSUE-2", type: "depends_on" }),
          method: "POST",
        }),
      );
      assert.equal(added.status, 200);

      const listed = await api.fetch(new Request(relationUrl, authed()));
      const listedBody = (await listed.json()) as { readonly data: readonly unknown[] };
      assert.equal(listed.status, 200);
      assert.deepEqual(listedBody.data, [{ issueId: "ISSUE-2", type: "depends_on" }]);

      const removed = await api.fetch(
        new Request(`${relationUrl}/remove`, {
          ...authed({ issueId: "ISSUE-2", type: "depends_on" }),
          method: "POST",
        }),
      );
      assert.equal(removed.status, 200);

      const invalid = await api.fetch(
        new Request(relationUrl, {
          ...authed({ issueId: "ISSUE-2", type: "parent" }),
          method: "POST",
        }),
      );
      assert.equal(invalid.status, 400);
    } finally {
      await api.dispose();
    }
  });

  it("rejects agent assignment when unfinished prerequisites block a ticket", async () => {
    const { api } = makeTestApi({
      assignTicketToAgent: async () => {
        throw new Error("Ticket ISSUE-1 is blocked by unfinished prerequisite tickets: ISSUE-2");
      },
    });

    try {
      const response = await api.fetch(
        new Request(
          "http://cycle.test/v1/repositories/test-repository/issues/ISSUE-1/agent-tasks",
          {
            ...authed({ providerId: "codex" }),
            method: "POST",
          },
        ),
      );
      const body = (await response.json()) as {
        readonly error?: { readonly code?: string; readonly retryable?: boolean };
      };

      assert.equal(response.status, 409);
      assert.equal(body.error?.code, "AGENT_TASK_CONFLICT");
      assert.equal(body.error?.retryable, false);
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

  it("passes explicit human actor metadata from HTTP issue updates", async () => {
    const { api, calls } = makeTestApi();

    try {
      await api.fetch(
        new Request(`http://cycle.test/v1/repositories/${repository.id}/issues`, {
          ...authed({
            title: "Complete me",
            type: "task",
          }),
          method: "POST",
        }),
      );

      const response = await api.fetch(
        new Request(`http://cycle.test/v1/repositories/${repository.id}/issues/ISSUE-1`, {
          body: JSON.stringify({
            frontmatter: {
              status: "done",
            },
          }),
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "x-cycle-actor-email": "desktop@example.com",
            "x-cycle-actor-name": "Desktop User",
            "x-cycle-actor-type": "human",
            "x-cycle-source": "desktop",
            "x-request-id": "req_test",
          },
          method: "PATCH",
        }),
      );
      const body = (await response.json()) as {
        data?: { frontmatter?: { status?: string } };
      };

      assert.equal(response.status, 200);
      assert.equal(body.data?.frontmatter?.status, "done");
      assert.deepEqual(calls, ["IssueCreate", "IssueGet", "IssueUpdate"]);
    } finally {
      await api.dispose();
    }
  });
});
