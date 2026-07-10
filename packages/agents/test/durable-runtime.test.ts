import { strict as assert } from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrationsFromRecord } from "@cycle/sqlite";
import { makeInMemorySqliteLayer } from "@cycle/sqlite/testing";
import { DateTime, Effect, Layer, Option, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { describe, it } from "vitest";
import { AgentConfig, AgentRuntimeConfigValue } from "../src/AgentConfig.ts";
import { AgentCommandStoreLive } from "../src/AgentCommandStore.ts";
import { AgentEventJournal, AgentEventJournalLive } from "../src/AgentEventJournal.ts";
import { AgentExecutionStore, AgentExecutionStoreLive } from "../src/AgentExecutionStore.ts";
import { AgentHarnessBinding } from "../src/AgentHarness.ts";
import { AgentQueueStore, AgentQueueStoreLive } from "../src/AgentQueueStore.ts";
import { AgentReadStore, AgentReadStoreLive } from "../src/AgentReadStore.ts";
import {
  AgentRuntimeService,
  AgentRuntimeServiceLive,
  AgentThreadSendInput,
} from "../src/AgentRuntimeService.ts";
import { AgentScheduler } from "../src/AgentScheduler.ts";
import { AgentSupervisor } from "../src/AgentSupervisor.ts";
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
  AgentCommandStoreLive,
  AgentThreadStoreLive,
  AgentQueueStoreLive,
  AgentEventJournalLive,
  AgentExecutionStoreLive,
  AgentReadStoreLive,
).pipe(Layer.provideMerge(Layer.mergeAll(config, database, AgentEventHubLive)));

const runtimeTestLayer = AgentRuntimeServiceLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      testLayer,
      Layer.succeed(AgentScheduler, AgentScheduler.of({ wake: Effect.void })),
      Layer.succeed(
        AgentSupervisor,
        AgentSupervisor.of({
          interrupt: () => Effect.void,
          respond: () => Effect.void,
          run: () => Effect.void,
          steer: () => Effect.void,
        }),
      ),
    ),
  ),
);

const authority = {
  allowedOperations: [] as ReadonlyArray<string>,
  mode: "conversation-read" as const,
};

const harnessCapabilities = {
  approvalRequests: true,
  artifactEvents: true,
  commandEvents: true,
  fileChangeEvents: true,
  historyReplay: true,
  httpMcp: true,
  interruption: true,
  liveReattachment: true,
  modelListing: true,
  nativeSessions: true,
  providerCodeTools: true,
  readOnlySandbox: true,
  reasoningSummaryEvents: true,
  stdioMcp: false,
  steering: false,
  streaming: true,
  structuredOutput: true,
  usageReporting: true,
  userInputRequests: true,
  workspaceWriteSandbox: true,
} as const;

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
  it("preserves implementation context across assignment and repeated follow-up sends", async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), "cycle-implementation-context-"));
    try {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* AgentRuntimeService;
          const implementationAuthority = {
            allowedOperations: ["repository.read", "workspace.write", "command.execute"],
            mode: "implementation-worktree" as const,
            repositoryId: "repository-1",
            ticketId: "UKN-28CT1",
            workspacePath: worktreePath,
            worktreeId: "worktree-1",
          };
          const context = {
            assignedUserId: "reviewer@example.com",
            branchName: "cycle/ukn-28ct1",
            repositoryId: "repository-1",
            ticketId: "UKN-28CT1",
            worktreeId: "worktree-1",
            worktreePath,
          };
          const thread = yield* runtime.createThread(
            new AgentThreadCreateInput({
              agentId: "codex",
              authority: implementationAuthority,
              harnessId: "codex",
              kind: "ticket-implementation",
              metadata: context,
              providerId: "codex",
              repositoryId: "repository-1",
              ticketId: "UKN-28CT1",
              workflowId: "ticket-implementation",
            }),
          );
          const initial = yield* runtime.submit(
            new AgentTaskSubmitInput({
              agentId: "codex",
              authority: implementationAuthority,
              harnessId: "codex",
              idempotencyKey: "implementation-initial",
              input: { message: "Implement the ticket" },
              kind: "ticket-implementation",
              metadata: context,
              priorityLane: "assigned",
              providerId: "codex",
              repositoryId: "repository-1",
              threadId: thread.thread.threadId,
              workflowId: "ticket-implementation",
            }),
          );
          const first = yield* runtime.send(
            new AgentThreadSendInput({
              idempotencyKey: "frontend-message-1",
              message: "Please adjust the tests",
              metadata: { repositoryId: "attempted-overwrite" },
              threadId: thread.thread.threadId,
            }),
          );
          const second = yield* runtime.send(
            new AgentThreadSendInput({
              idempotencyKey: "frontend-message-2",
              message: "One more review round",
              threadId: thread.thread.threadId,
            }),
          );
          const duplicate = yield* runtime.send(
            new AgentThreadSendInput({
              idempotencyKey: "frontend-message-2",
              message: "One more review round",
              threadId: thread.thread.threadId,
            }),
          );
          return { duplicate, first, initial, second, thread };
        }).pipe(Effect.provide(runtimeTestLayer)),
      );

      for (const snapshot of [result.initial, result.first, result.second]) {
        assert.equal(snapshot.task.kind, "ticket-implementation");
        assert.equal(snapshot.task.priorityLane, "assigned");
        assert.equal(snapshot.task.workflowId, "ticket-implementation");
        assert.equal(snapshot.task.authority.mode, "implementation-worktree");
        assert.equal(snapshot.task.authority.workspacePath, worktreePath);
        assert.equal(snapshot.task.repositoryId, "repository-1");
        assert.equal(snapshot.task.metadata.repositoryId, "repository-1");
        assert.equal(snapshot.task.metadata.ticketId, "UKN-28CT1");
        assert.equal(snapshot.task.metadata.worktreeId, "worktree-1");
        assert.equal(snapshot.task.metadata.worktreePath, worktreePath);
        assert.equal(snapshot.task.metadata.branchName, "cycle/ukn-28ct1");
        assert.equal(snapshot.task.metadata.assignedUserId, "reviewer@example.com");
      }
      assert.equal(result.duplicate.task.taskId, result.second.task.taskId);
      assert.equal(result.first.task.providerId, result.thread.thread.providerId);
      assert.equal(result.first.task.harnessId, result.thread.thread.harnessId);
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });

  it("rejects missing, stale, and archived implementation contexts before execution", async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), "cycle-stale-context-"));
    try {
      const missing = await Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* AgentRuntimeService;
          return yield* runtime
            .createThread(
              new AgentThreadCreateInput({
                agentId: "codex",
                authority: {
                  allowedOperations: [],
                  mode: "implementation-worktree",
                  repositoryId: "repository-1",
                  ticketId: "UKN-28CT1",
                  workspacePath: worktreePath,
                  worktreeId: "worktree-1",
                },
                harnessId: "codex",
                kind: "ticket-implementation",
                metadata: {},
                providerId: "codex",
                repositoryId: "repository-1",
                ticketId: "UKN-28CT1",
                workflowId: "ticket-implementation",
              }),
            )
            .pipe(Effect.flip);
        }).pipe(Effect.provide(runtimeTestLayer)),
      );
      assert.equal(missing._tag, "ImplementationContextIncomplete");
      if (missing._tag === "ImplementationContextIncomplete") {
        assert.ok(missing.missingBindings.includes("branchName"));
        assert.ok(missing.missingBindings.includes("assignedUserId"));
      }

      const staleAndArchived = await Effect.runPromise(
        Effect.gen(function* () {
          const runtime = yield* AgentRuntimeService;
          const authority = {
            allowedOperations: [] as ReadonlyArray<string>,
            mode: "implementation-worktree" as const,
            repositoryId: "repository-1",
            ticketId: "UKN-28CT1",
            workspacePath: worktreePath,
            worktreeId: "worktree-1",
          };
          const thread = yield* runtime.createThread(
            new AgentThreadCreateInput({
              agentId: "codex",
              authority,
              harnessId: "codex",
              kind: "ticket-implementation",
              metadata: {
                assignedUserId: "reviewer@example.com",
                branchName: "cycle/ukn-28ct1",
                repositoryId: "repository-1",
                ticketId: "UKN-28CT1",
                worktreeId: "worktree-1",
                worktreePath,
              },
              providerId: "codex",
              repositoryId: "repository-1",
              ticketId: "UKN-28CT1",
              workflowId: "ticket-implementation",
            }),
          );
          yield* Effect.promise(() => rm(worktreePath, { force: true, recursive: true }));
          const stale = yield* runtime
            .send(
              new AgentThreadSendInput({
                message: "resume",
                threadId: thread.thread.threadId,
              }),
            )
            .pipe(Effect.flip);
          yield* runtime.archiveThread(thread.thread.threadId);
          const archived = yield* runtime
            .send(
              new AgentThreadSendInput({
                message: "resume archived",
                threadId: thread.thread.threadId,
              }),
            )
            .pipe(Effect.flip);
          return { archived, stale };
        }).pipe(Effect.provide(runtimeTestLayer)),
      );
      assert.equal(staleAndArchived.stale._tag, "ImplementationContextIncomplete");
      if (staleAndArchived.stale._tag === "ImplementationContextIncomplete") {
        assert.equal(staleAndArchived.stale.reason, "stale");
        assert.match(staleAndArchived.stale.recoveryAction, /Restore the managed worktree/u);
      }
      assert.equal(staleAndArchived.archived._tag, "AgentStateConflictError");
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });
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

  it("refreshes and reloads the latest native provider thread binding", async () => {
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
            idempotencyKey: "provider-binding-task",
            input: { message: "Remember this conversation" },
            kind: "interactive-turn",
            priorityLane: "interactive",
            providerId: "test",
            threadId: thread.threadId,
            workflowId: "interactive-chat",
          }),
        );
        const claim = yield* tasks.claimNext;
        assert.equal(Option.isSome(claim), true);
        if (Option.isNone(claim)) return Option.none();
        const running = yield* executions.markRunning(claim.value);
        const session = yield* executions.bindSession(
          running,
          new AgentHarnessBinding({
            adapterVersion: "1",
            capabilities: harnessCapabilities,
            providerSessionId: "provider-session",
          }),
        );
        yield* executions.refreshSessionBinding(
          running,
          session.sessionId,
          new AgentHarnessBinding({
            adapterVersion: "1",
            capabilities: harnessCapabilities,
            providerSessionId: "provider-session",
            providerThreadId: "native-thread",
          }),
        );
        return yield* reads.latestSessionBinding({
          harnessId: "test",
          threadId: thread.threadId,
        });
      }).pipe(Effect.provide(testLayer)),
    );

    assert.equal(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.equal(result.value.providerSessionId, "provider-session");
      assert.equal(result.value.providerThreadId, "native-thread");
      assert.equal(result.value.status, "closed");
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
