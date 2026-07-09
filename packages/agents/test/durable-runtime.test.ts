import { strict as assert } from "node:assert";
import { migrationsFromRecord } from "@cycle/sqlite";
import { makeInMemorySqliteLayer } from "@cycle/sqlite/testing";
import { DateTime, Effect, Layer, Option, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { describe, it } from "vitest";
import { AgentConfig, AgentRuntimeConfigValue } from "../src/AgentConfig.ts";
import { AgentEventJournal, AgentEventJournalLive } from "../src/AgentEventJournal.ts";
import { AgentExecutionStore, AgentExecutionStoreLive } from "../src/AgentExecutionStore.ts";
import { AgentQueueStore, AgentQueueStoreLive } from "../src/AgentQueueStore.ts";
import { AgentReadStore, AgentReadStoreLive } from "../src/AgentReadStore.ts";
import { AgentTaskSubmitInput } from "../src/AgentTask.ts";
import { AgentThreadCreateInput } from "../src/AgentThread.ts";
import { AgentThreadStore, AgentThreadStoreLive } from "../src/AgentThreadStore.ts";
import { AgentEventHubLive } from "../src/internal/AgentEventHub.ts";
import { agentMigrations } from "../src/migrations/AgentMigrations.ts";

const config = Layer.succeed(
  AgentConfig,
  AgentConfig.of(
    new AgentRuntimeConfigValue({
      busyTimeoutMs: 5_000,
      databasePath: ":memory:",
      defaultAgentId: "default",
      defaultHarnessId: "test",
      defaultProviderId: "test",
      deltaFlushBytes: 32 * 1024,
      deltaFlushMs: 50,
      globalConcurrency: 4,
      heartbeatMs: 10_000,
      leaseDurationMs: 30_000,
      maintenanceIntervalMs: 30_000,
      maxAttempts: 3,
      maxDelegationDepth: 3,
      maxRunningChildrenPerParent: 4,
      maxTotalChildrenPerTask: 16,
      ownerId: "test-owner",
      perProviderConcurrency: 2,
      perRepositoryConcurrency: 2,
      shutdownDrainMs: 10_000,
    }),
  ),
);

const database = makeInMemorySqliteLayer({
  disableWAL: true,
  migrations: {
    loader: migrationsFromRecord(agentMigrations),
    table: "agent_schema_migrations",
  },
});

const testLayer = Layer.mergeAll(
  AgentThreadStoreLive,
  AgentQueueStoreLive,
  AgentEventJournalLive,
  AgentExecutionStoreLive,
  AgentReadStoreLive,
).pipe(Layer.provideMerge(Layer.mergeAll(config, database, AgentEventHubLive)));

const authority = {
  allowedOperations: [] as ReadonlyArray<string>,
  mode: "conversation-read" as const,
};

const makeThread = () =>
  new AgentThreadCreateInput({
    agentId: "default",
    authority,
    harnessId: "test",
    idempotencyKey: "thread-key",
    kind: "interactive",
    providerId: "test",
    title: "Durable thread",
  });

describe("durable agent runtime store", () => {
  it("repairs databases that recorded migration 0001 without the enqueue allocator", async () => {
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        yield* agentMigrations["0002_repair_enqueue_sequence"];
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly name: string }>`
          SELECT name FROM sqlite_master
          WHERE type = 'table' AND name = 'agent_enqueue_sequence'
        `;
      }).pipe(Effect.provide(makeInMemorySqliteLayer({ disableWAL: true }))),
    );

    assert.equal(rows[0]?.name, "agent_enqueue_sequence");
  });

  it("creates idempotent threads and replays their journal", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const threads = yield* AgentThreadStore;
        const journal = yield* AgentEventJournal;
        const first = yield* threads.create(makeThread());
        const second = yield* threads.create(makeThread());
        const events = yield* journal
          .observe({ tail: false, threadId: first.threadId })
          .pipe(Stream.runCollect);
        return { events, first, second };
      }).pipe(Effect.provide(testLayer)),
    );

    assert.equal(result.first.threadId, result.second.threadId);
    assert.equal(result.first.lastSequence, 1);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0]?.eventType, "thread.opened");
  });

  it("submits an idempotent task with a materialized user message", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const threads = yield* AgentThreadStore;
        const tasks = yield* AgentQueueStore;
        const journal = yield* AgentEventJournal;
        const thread = yield* threads.create(makeThread());
        const input = new AgentTaskSubmitInput({
          agentId: "default",
          authority,
          harnessId: "test",
          idempotencyKey: "task-key",
          input: { message: "Implement the ticket" },
          kind: "interactive-turn",
          priorityLane: "interactive",
          providerId: "test",
          threadId: thread.threadId,
          workflowId: "interactive-chat",
        });
        const first = yield* tasks.submit(input);
        const second = yield* tasks.submit(input);
        const events = yield* journal
          .observe({ pageSize: 1, tail: false, threadId: thread.threadId })
          .pipe(Stream.runCollect);
        const claim = yield* tasks.claimNext;
        return { claim, events, first, second };
      }).pipe(Effect.provide(testLayer)),
    );

    assert.equal(result.first.taskId, result.second.taskId);
    assert.equal(result.first.status, "queued");
    assert.equal(result.events.length, 4);
    assert.equal(Option.isSome(result.claim), true);
    if (Option.isSome(result.claim)) {
      assert.equal(result.claim.value.task.taskId, result.first.taskId);
      assert.equal(result.claim.value.attempt.ordinal, 1);
      assert.equal(
        DateTime.isGreaterThan(
          result.claim.value.attempt.leaseExpiresAt,
          result.claim.value.attempt.startedAt,
        ),
        true,
      );
    }
  });

  it("durably suspends and resumes provider interactions", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const threads = yield* AgentThreadStore;
        const tasks = yield* AgentQueueStore;
        const executions = yield* AgentExecutionStore;
        const reads = yield* AgentReadStore;
        const thread = yield* threads.create(makeThread());
        yield* tasks.submit(
          new AgentTaskSubmitInput({
            agentId: "default",
            authority,
            harnessId: "test",
            idempotencyKey: "interaction-task",
            input: { message: "Ask before writing" },
            kind: "interactive-turn",
            priorityLane: "interactive",
            providerId: "test",
            threadId: thread.threadId,
            workflowId: "interactive-chat",
          }),
        );
        const claim = yield* tasks.claimNext;
        assert.equal(Option.isSome(claim), true);
        if (Option.isNone(claim)) return undefined;
        const running = yield* executions.markRunning(claim.value);
        const interaction = yield* executions.suspendForInteraction({
          fields: { kind: "command" },
          lease: running,
          prompt: "Allow the command?",
          providerRequestId: "provider-request-1",
          type: "approval",
        });
        const suspended = yield* reads.taskSnapshot(running.task.taskId);
        yield* executions.resolveInteraction({
          interactionId: interaction.interactionId,
          responderId: "user",
          response: "accept",
        });
        const resumed = yield* reads.taskSnapshot(running.task.taskId);
        return { resumed, suspended };
      }).pipe(Effect.provide(testLayer)),
    );

    assert.ok(result !== undefined);
    if (result === undefined) return;
    assert.equal(Option.isSome(result.suspended), true);
    assert.equal(Option.isSome(result.resumed), true);
    if (Option.isSome(result.suspended)) {
      assert.equal(result.suspended.value.task.status, "suspended");
      assert.equal(result.suspended.value.interactions[0]?.status, "open");
    }
    if (Option.isSome(result.resumed)) {
      assert.equal(result.resumed.value.task.status, "running");
      assert.equal(result.resumed.value.interactions[0]?.status, "answered");
    }
  });

  it("cancels queued work atomically and releases the interactive thread", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const threads = yield* AgentThreadStore;
        const tasks = yield* AgentQueueStore;
        const reads = yield* AgentReadStore;
        const thread = yield* threads.create(makeThread());
        const task = yield* tasks.submit(
          new AgentTaskSubmitInput({
            agentId: "default",
            authority,
            harnessId: "test",
            idempotencyKey: "cancel-task",
            input: { message: "Cancel me" },
            kind: "interactive-turn",
            priorityLane: "interactive",
            providerId: "test",
            threadId: thread.threadId,
            workflowId: "interactive-chat",
          }),
        );
        yield* tasks.requestCancel(task.taskId, "test cancellation");
        return yield* reads.threadSnapshot(thread.threadId);
      }).pipe(Effect.provide(testLayer)),
    );

    assert.equal(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.equal(result.value.thread.activeTaskId, undefined);
      assert.equal(result.value.tasks[0]?.status, "cancelled");
    }
  });
});
