import { strict as assert } from "node:assert";
import { Effect, Layer, Schema, Stream } from "effect";
import { describe, it } from "vitest";
import {
  AgentTaskService,
  AgentTaskServiceLive,
  AgentTaskStoreInMemory,
  AgentTask,
  AgentTaskRequest,
} from "../src/index.ts";

const makeIds = () => {
  let id = 0;
  return (prefix: string) => `${prefix}_${++id}`;
};

const fixedNow = () => new Date("2026-07-02T12:00:00.000Z");

const baseRequest = {
  agentId: "codex",
  authority: {
    mode: "workspace-write",
    allowedTools: ["cycle"],
  },
  context: {
    summary: "Implement the requested change.",
  },
  idempotencyKey: "ticket:repo:test-1:agent:codex",
  input: "Implement TST-1.",
  instructions: "Work through the task and report the result.",
  metadata: {
    priority: "normal",
  },
  origin: {
    kind: "ticket",
    repositoryId: "repo_test",
    ticketId: "TST-1",
  },
  providerId: "codex",
  requestedBy: "test",
  workspace: {
    branchName: "codex/test-1",
    path: "/tmp/cycle-agent-task",
  },
} satisfies AgentTaskRequest;

const makeLayer = () =>
  AgentTaskServiceLive({ makeId: makeIds(), now: fixedNow }).pipe(
    Layer.provide(AgentTaskStoreInMemory),
  );

const runTaskEffect = <A, E>(effect: Effect.Effect<A, E, AgentTaskService>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(makeLayer())));

describe("@cycle/agents AgentTask", () => {
  it("schema-decodes provider-neutral task requests", () => {
    const decoded = Schema.decodeUnknownSync(AgentTaskRequest)(baseRequest);

    assert.equal(decoded.agentId, "codex");
    assert.equal(decoded.authority.mode, "workspace-write");
    assert.equal(decoded.origin?.kind, "ticket");
    assert.equal("ticketId" in decoded, false);
  });

  it("creates queued tasks and persists lifecycle events", async () => {
    const { events, task } = await runTaskEffect(
      Effect.gen(function* () {
        const service = yield* AgentTaskService;
        const task = yield* service.createTask(baseRequest);
        const events = yield* service.listEvents({ taskId: task.taskId });
        return { events, task };
      }),
    );
    const decoded = Schema.decodeUnknownSync(AgentTask)(task);

    assert.equal(decoded.taskId, "task_1");
    assert.equal(decoded.status, "queued");
    assert.equal(decoded.rootRunId, null);
    assert.equal(decoded.idempotencyKey, baseRequest.idempotencyKey);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, "task.queued");
    assert.equal(events[0]?.sequence, 1);
  });

  it("returns an active task for duplicate idempotency keys", async () => {
    const { first, second, tasks } = await runTaskEffect(
      Effect.gen(function* () {
        const service = yield* AgentTaskService;
        const first = yield* service.createTask(baseRequest);
        const second = yield* service.createTask({
          ...baseRequest,
          input: "Duplicate request.",
        });
        const tasks = yield* service.listTasks();
        return { first, second, tasks };
      }),
    );

    assert.equal(second.taskId, first.taskId);
    assert.equal(tasks.entries.length, 1);
  });

  it("cancels active tasks and appends terminal events", async () => {
    const { cancelled, events } = await runTaskEffect(
      Effect.gen(function* () {
        const service = yield* AgentTaskService;
        const task = yield* service.createTask(baseRequest);
        const cancelled = yield* service.cancelTask(task.taskId, {
          reason: "No longer needed.",
          requestedBy: "test",
        });
        const events = yield* service.listEvents({ taskId: task.taskId });
        return { cancelled, events };
      }),
    );

    assert.equal(cancelled?.status, "cancelled");
    assert.equal(cancelled?.completedAt, "2026-07-02T12:00:00.000Z");
    assert.deepEqual(
      events.map((event) => event.type),
      ["task.queued", "task.cancelling", "task.cancelled"],
    );
  });

  it("subscribes to replayed and live task events", async () => {
    const events = await runTaskEffect(
      Effect.gen(function* () {
        const service = yield* AgentTaskService;
        const task = yield* service.createTask(baseRequest);
        const iterable = yield* Stream.toAsyncIterableEffect(
          service.subscribe({ taskId: task.taskId }),
        );
        const iterator = iterable[Symbol.asyncIterator]();
        const queued = yield* Effect.promise(() => iterator.next());
        yield* service.cancelTask(task.taskId);
        const cancelling = yield* Effect.promise(() => iterator.next());
        const cancelled = yield* Effect.promise(() => iterator.next());
        if (iterator.return !== undefined) {
          yield* Effect.promise(() => iterator.return!());
        }
        return [queued.value, cancelling.value, cancelled.value];
      }),
    );

    assert.deepEqual(
      events.map((event) => event.type),
      ["task.queued", "task.cancelling", "task.cancelled"],
    );
  });
});
