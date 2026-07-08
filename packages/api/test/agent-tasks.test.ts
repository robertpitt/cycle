import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentTaskServiceLive, AgentTaskStore } from "@cycle/agents";
import type { AgentTaskRequest } from "@cycle/contracts/schemas/agents/agent-task-schemas";
import { makeInMemoryAgentTaskStore } from "@cycle/agents/testing";
import { DatabaseService, type DatabaseServiceShape } from "@cycle/database";
import type { TicketDocument } from "@cycle/contracts";
import { Effect, Layer } from "effect";
import { describe, it } from "vitest";
import { makeCycleApi } from "../src/index.ts";

const token = "test-token";
const repositoryId = "repo-1";
const ticketId = "ISSUE-1";

const baseTaskRequest = {
  agentId: "codex",
  authority: {
    mode: "read-only",
  },
  context: {
    summary: "Run the requested task.",
  },
  input: "Summarize the prepared context.",
  instructions: "Work from the provided context and report the result.",
  metadata: {
    source: "test",
  },
  origin: {
    kind: "manual",
  },
  providerId: "codex",
  requestedBy: "tester",
} satisfies AgentTaskRequest;

const makeIssue = (): TicketDocument =>
  ({
    body: "Ticket body",
    bodyFormat: "markdown",
    createdBy: "tester",
    frontmatter: {
      createdAt: "2026-07-02T00:00:00.000Z",
      createdBy: {
        name: "Tester",
        type: "agent",
      },
      id: ticketId,
      priority: "normal",
      status: "todo",
      title: "Ticket title",
      type: "task",
      updatedAt: "2026-07-02T00:00:00.000Z",
    },
    id: ticketId,
    parent: "",
    priority: "normal",
    repositoryId,
    schemaVersion: 1,
    status: "todo",
    title: "Ticket title",
    type: "task",
    updatedDate: "2026-07-02",
  }) as TicketDocument;

const databaseStub = (overrides: Partial<DatabaseServiceShape>): DatabaseServiceShape =>
  new Proxy(overrides, {
    get: (target, property) => {
      if (property in target) return target[property as keyof DatabaseServiceShape];

      return () => Effect.die(new Error(`Unexpected database call: ${String(property)}`));
    },
  }) as DatabaseServiceShape;

const makeApi = () =>
  makeCycleApi({
    staticToken: token,
    useCaseLayer: Layer.mergeAll(
      Layer.succeed(
        DatabaseService,
        DatabaseService.of(
          databaseStub({
            getTicket: (repo, id) =>
              Effect.succeed(repo === repositoryId && id === ticketId ? makeIssue() : null),
          }),
        ),
      ),
      AgentTaskServiceLive().pipe(
        Layer.provide(
          Layer.succeed(AgentTaskStore, AgentTaskStore.of(makeInMemoryAgentTaskStore())),
        ),
      ),
    ),
  });

const authed = (body?: unknown): RequestInit => ({
  body: body === undefined ? undefined : JSON.stringify(body),
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "x-request-id": "req_agent_task",
  },
});

describe("AgentTask API", () => {
  it("creates, polls, replays, and cancels generic tasks", async () => {
    const api = makeApi();

    try {
      const created = await api.fetch(
        new Request("http://cycle.test/v1/agent-tasks", {
          ...authed(baseTaskRequest),
          method: "POST",
        }),
      );
      const createdBody = (await created.json()) as {
        readonly data?: { readonly status?: string; readonly taskId?: string };
      };
      const taskId = createdBody.data?.taskId;

      assert.equal(created.status, 202);
      assert.equal(createdBody.data?.status, "queued");
      assert.equal(typeof taskId, "string");

      const fetched = await api.fetch(
        new Request(`http://cycle.test/v1/agent-tasks/${taskId}`, authed()),
      );
      const fetchedBody = (await fetched.json()) as {
        readonly data?: { readonly taskId?: string };
      };
      assert.equal(fetched.status, 200);
      assert.equal(fetchedBody.data?.taskId, taskId);

      const replay = await api.fetch(
        new Request(`http://cycle.test/v1/agent-tasks/${taskId}/events`, authed()),
      );
      const replayBody = (await replay.json()) as {
        readonly data?: ReadonlyArray<{ readonly type?: string }>;
      };
      assert.equal(replay.status, 200);
      assert.deepEqual(
        replayBody.data?.map((event) => event.type),
        ["task.queued"],
      );

      const cancelled = await api.fetch(
        new Request(`http://cycle.test/v1/agent-tasks/${taskId}/cancel`, {
          ...authed({ reason: "test", requestedBy: "tester" }),
          method: "POST",
        }),
      );
      const cancelledBody = (await cancelled.json()) as {
        readonly data?: { readonly status?: string };
      };
      assert.equal(cancelled.status, 200);
      assert.equal(cancelledBody.data?.status, "cancelled");
    } finally {
      await api.dispose();
    }
  });

  it("creates ticket-scoped tasks through usecase mapping", async () => {
    const api = makeApi();

    try {
      const created = await api.fetch(
        new Request(
          `http://cycle.test/v1/repositories/${repositoryId}/issues/${ticketId}/agent-tasks`,
          {
            ...authed({
              agentId: "codex",
              instructions: "Use the ticket context.",
              requestedBy: "tester",
            }),
            method: "POST",
          },
        ),
      );
      const body = (await created.json()) as {
        readonly data?: {
          readonly origin?: {
            readonly kind?: string;
            readonly repositoryId?: string;
            readonly ticketId?: string;
          };
          readonly request?: {
            readonly context?: { readonly ticket?: { readonly title?: string } };
          };
          readonly status?: string;
        };
      };

      assert.equal(created.status, 202);
      assert.equal(body.data?.status, "queued");
      assert.equal(body.data?.origin?.kind, "ticket");
      assert.equal(body.data?.origin?.repositoryId, repositoryId);
      assert.equal(body.data?.origin?.ticketId, ticketId);
      assert.equal(body.data?.request?.context?.ticket?.title, "Ticket title");
    } finally {
      await api.dispose();
    }
  });

  it("keeps legacy Agent Work production imports deleted", () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const legacyDirectory = join(root, "packages/usecases/src/agent-work");
    const legacyFiles = existsSync(legacyDirectory)
      ? readdirSync(legacyDirectory).filter((entry) => entry.endsWith(".ts"))
      : [];

    assert.deepEqual(legacyFiles, []);

    const offenders = listTypescriptFiles(join(root, "packages"))
      .filter((file) => !file.includes("/test/"))
      .filter((file) => readFileSync(file, "utf8").includes("@cycle/usecases/agent-work"));

    assert.deepEqual(offenders, []);
  });
});

const listTypescriptFiles = (root: string): readonly string[] => {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (["node_modules", "out", "storybook-static"].includes(entry)) continue;
      files.push(...listTypescriptFiles(path));
    } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      files.push(path);
    }
  }

  return files;
};
