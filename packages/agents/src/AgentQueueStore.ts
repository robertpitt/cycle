import { createHash } from "node:crypto";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentAttempt } from "./AgentAttempt.ts";
import { AgentConfig } from "./AgentConfig.ts";
import {
  AgentIdempotencyConflictError,
  AgentNotFoundError,
  AgentStateConflictError,
  AgentStorageError,
  agentStorageError,
} from "./AgentErrors.ts";
import type {
  AgentAttemptId,
  AgentMessageId,
  AgentRunId,
  AgentTaskId,
  AgentThreadId,
  AgentTurnId,
} from "./AgentIds.ts";
import { AgentMessage, AgentMessagePart } from "./AgentMessage.ts";
import { AgentRun } from "./AgentRun.ts";
import { AgentTask, AgentTaskStatus, AgentTaskSubmitInput } from "./AgentTask.ts";
import { AgentThread } from "./AgentThread.ts";
import { AgentTurn } from "./AgentTurn.ts";
import { AgentEventHub } from "./internal/AgentEventHub.ts";
import {
  appendEventTransaction,
  decodeRecord,
  encodeRecord,
  makeAgentId,
  makeEventAppend,
  now,
} from "./internal/persistence.ts";

type RecordRow = { readonly record_json: string };
type CountRow = { readonly value: number };
type RunResult = { readonly lastInsertRowid?: bigint | number };

export type AgentClaim = {
  readonly attempt: AgentAttempt;
  readonly run: AgentRun;
  readonly task: AgentTask;
};

export type AgentQueueStoreShape = {
  readonly claimNext: Effect.Effect<Option.Option<AgentClaim>, AgentStorageError>;
  readonly get: (taskId: AgentTaskId) => Effect.Effect<Option.Option<AgentTask>, AgentStorageError>;
  readonly getRun: (runId: AgentRunId) => Effect.Effect<Option.Option<AgentRun>, AgentStorageError>;
  readonly heartbeat: (input: {
    readonly attemptId: AgentAttemptId;
    readonly fencingToken: number;
  }) => Effect.Effect<AgentAttempt, AgentStorageError | AgentStateConflictError>;
  readonly list: (input?: {
    readonly limit?: number;
    readonly status?: typeof AgentTaskStatus.Type;
    readonly threadId?: AgentThreadId;
  }) => Effect.Effect<ReadonlyArray<AgentTask>, AgentStorageError>;
  readonly reconcile: Effect.Effect<ReadonlyArray<AgentTask>, AgentStorageError>;
  readonly requestCancel: (
    taskId: AgentTaskId,
    reason?: string,
  ) => Effect.Effect<AgentTask, AgentStorageError | AgentNotFoundError>;
  readonly submit: (
    input: AgentTaskSubmitInput,
  ) => Effect.Effect<
    AgentTask,
    AgentStorageError | AgentNotFoundError | AgentStateConflictError | AgentIdempotencyConflictError
  >;
};

export class AgentQueueStore extends Context.Service<AgentQueueStore, AgentQueueStoreShape>()(
  "@cycle/agents/AgentQueueStore",
) {}

const activeTaskStatuses = [
  "queued",
  "claimed",
  "preparing",
  "running",
  "suspending",
  "suspended",
  "resuming",
  "retry-wait",
  "cancelling",
] as const;

const requestHash = Effect.fn("AgentQueueStore.requestHash")(function* (
  input: AgentTaskSubmitInput,
) {
  const encoded = yield* Schema.encodeUnknownEffect(Schema.toCodecJson(AgentTaskSubmitInput))(
    input,
  );
  return yield* Effect.sync(() =>
    createHash("sha256").update(JSON.stringify(encoded)).digest("hex"),
  );
});

export const AgentQueueStoreLive = Layer.effect(
  AgentQueueStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const hub = yield* AgentEventHub;
    const config = yield* AgentConfig;

    const get = Effect.fn("AgentQueueStore.get")(function* (taskId: AgentTaskId) {
      const rows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_tasks WHERE task_id = ${taskId}
      `.pipe(Effect.mapError((cause) => agentStorageError("task.get", cause)));
      return rows[0] === undefined
        ? Option.none()
        : Option.some(yield* decodeRecord("task.decode", AgentTask, rows[0].record_json));
    });

    const getRun = Effect.fn("AgentQueueStore.getRun")(function* (runId: AgentRunId) {
      const rows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_runs WHERE run_id = ${runId}
      `.pipe(Effect.mapError((cause) => agentStorageError("run.get", cause)));
      return rows[0] === undefined
        ? Option.none()
        : Option.some(yield* decodeRecord("run.decode", AgentRun, rows[0].record_json));
    });

    const submit = Effect.fn("AgentQueueStore.submit")(function* (input: AgentTaskSubmitInput) {
      const hash = yield* requestHash(input).pipe(
        Effect.mapError((cause) => agentStorageError("task.hash", cause)),
      );
      const existingRows = yield* sql<
        RecordRow & { readonly request_hash: string }
      >`SELECT request_hash, record_json FROM agent_tasks WHERE idempotency_key = ${input.idempotencyKey}`.pipe(
        Effect.mapError((cause) => agentStorageError("task.idempotency", cause)),
      );
      const existing = existingRows[0];
      if (existing !== undefined) {
        if (existing.request_hash !== hash) {
          return yield* new AgentIdempotencyConflictError({
            code: "agent_task_idempotency_conflict",
            idempotencyKey: input.idempotencyKey,
            message: "The idempotency key was already used with different task input.",
            retryable: false,
          });
        }
        return yield* decodeRecord("task.decode", AgentTask, existing.record_json);
      }

      const threadRows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_threads WHERE thread_id = ${input.threadId}
      `.pipe(Effect.mapError((cause) => agentStorageError("task.thread", cause)));
      if (threadRows[0] === undefined) {
        return yield* new AgentNotFoundError({
          code: "agent_thread_not_found",
          entityId: input.threadId,
          entityType: "thread",
          message: `Agent thread not found: ${input.threadId}`,
          retryable: false,
        });
      }
      const thread = yield* decodeRecord("thread.decode", AgentThread, threadRows[0].record_json);
      if (thread.status !== "open") {
        return yield* new AgentStateConflictError({
          actualState: thread.status,
          code: "agent_thread_closed",
          entityId: input.threadId,
          expectedState: "open",
          message: "Cannot submit work to an archived thread.",
          retryable: false,
        });
      }

      if (input.kind === "interactive-turn") {
        const active = yield* sql<CountRow>`
          SELECT count(*) AS value FROM agent_tasks
          WHERE thread_id = ${input.threadId}
            AND kind = 'interactive-turn'
            AND status IN ${sql.in(activeTaskStatuses)}
        `.pipe(Effect.mapError((cause) => agentStorageError("task.active-thread", cause)));
        if ((active[0]?.value ?? 0) > 0) {
          return yield* new AgentStateConflictError({
            actualState: "active-task",
            code: "agent_thread_busy",
            entityId: input.threadId,
            expectedState: "idle",
            message: "The interactive thread already has an active turn.",
            retryable: true,
          });
        }
      }

      const timestamp = yield* now;
      const sequenceResult = yield* sql`
        INSERT INTO agent_enqueue_sequence DEFAULT VALUES
      `.raw.pipe(Effect.mapError((cause) => agentStorageError("task.enqueue-sequence", cause)));
      const enqueueSequence = Number((sequenceResult as RunResult).lastInsertRowid ?? 0);
      const taskId = yield* makeAgentId<AgentTaskId>("agent_task");
      const runId = input.rootRunId ?? (yield* makeAgentId<AgentRunId>("agent_run"));
      const turnId = yield* makeAgentId<AgentTurnId>("agent_turn");
      const messageId = yield* makeAgentId<AgentMessageId>("agent_message");
      const task = new AgentTask({
        agentId: input.agentId,
        authority: input.authority,
        createdAt: timestamp,
        currentAttempt: 0,
        currentRunId: runId,
        enqueueSequence,
        harnessId: input.harnessId,
        idempotencyKey: input.idempotencyKey,
        input: input.input,
        kind: input.kind,
        maxAttempts: input.maxAttempts ?? config.maxAttempts,
        metadata: input.metadata ?? {},
        priorityLane: input.priorityLane,
        providerId: input.providerId,
        queuedAt: timestamp,
        requestHash: hash,
        schemaVersion: 1,
        status: "queued",
        taskId,
        threadId: input.threadId,
        updatedAt: timestamp,
        workflowId: input.workflowId,
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.notBefore === undefined ? {} : { notBefore: input.notBefore }),
        ...(input.parentRunId === undefined ? {} : { parentRunId: input.parentRunId }),
        ...(input.repositoryId === undefined ? {} : { repositoryId: input.repositoryId }),
      });
      const run = new AgentRun({
        agentId: input.agentId,
        authority: input.authority,
        childBudget: config.maxTotalChildrenPerTask,
        createdAt: timestamp,
        depth: input.parentRunId === undefined ? 0 : 1,
        harnessId: input.harnessId,
        metadata: input.metadata ?? {},
        providerId: input.providerId,
        rootRunId: runId,
        runId,
        status: "queued",
        taskId,
        threadId: input.threadId,
        updatedAt: timestamp,
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.parentRunId === undefined ? {} : { parentRunId: input.parentRunId }),
      });
      const turn = new AgentTurn({
        createdAt: timestamp,
        input: input.input,
        rootRunId: runId,
        runId,
        status: "queued",
        taskId,
        threadId: input.threadId,
        turnId,
        updatedAt: timestamp,
      });
      const inputText =
        typeof input.input.message === "string" ? input.input.message : JSON.stringify(input.input);
      const message = new AgentMessage({
        completedAt: timestamp,
        createdAt: timestamp,
        messageId,
        parts: [{ _tag: "text", text: inputText }],
        role: "user",
        runId,
        status: "completed",
        taskId,
        threadId: input.threadId,
        turnId,
        updatedAt: timestamp,
        visibility: "public",
      });
      const taskJson = yield* encodeRecord("task.encode", AgentTask, task);
      const runJson = yield* encodeRecord("run.encode", AgentRun, run);
      const turnJson = yield* encodeRecord("turn.encode", AgentTurn, turn);
      const messageJson = yield* encodeRecord("message.encode", AgentMessage, message);
      const messagePartJson = yield* encodeRecord(
        "message-part.encode",
        AgentMessagePart,
        message.parts[0],
      );
      const submittedInput = yield* makeEventAppend({
        eventType: "task.submitted",
        payload: {},
        retention: "permanent",
        rootRunId: runId,
        runId,
        taskId,
        threadId: input.threadId,
        visibility: "public",
      });
      const queuedInput = yield* makeEventAppend({
        eventType: "task.queued",
        payload: {},
        retention: "permanent",
        rootRunId: runId,
        runId,
        taskId,
        threadId: input.threadId,
        visibility: "public",
      });
      const messageInput = yield* makeEventAppend({
        eventType: "message.completed",
        payload: { messageId },
        retention: "permanent",
        rootRunId: runId,
        runId,
        taskId,
        threadId: input.threadId,
        turnId,
        visibility: "public",
      });

      const events = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`
              INSERT INTO agent_tasks(
                task_id, thread_id, kind, status, priority_lane, provider_id, harness_id,
                repository_id, parent_run_id, idempotency_key, request_hash, enqueue_sequence,
                not_before, current_run_id, current_attempt, max_attempts, queued_at, created_at,
                updated_at, record_json
              ) VALUES (
                ${taskId}, ${input.threadId}, ${task.kind}, ${task.status}, ${task.priorityLane},
                ${task.providerId}, ${task.harnessId}, ${task.repositoryId ?? null},
                ${task.parentRunId ?? null}, ${task.idempotencyKey}, ${task.requestHash},
                ${task.enqueueSequence},
                ${task.notBefore === undefined ? null : DateTime.formatIso(task.notBefore)},
                ${runId}, 0, ${task.maxAttempts}, ${DateTime.formatIso(timestamp)},
                ${DateTime.formatIso(timestamp)}, ${DateTime.formatIso(timestamp)}, ${taskJson}
              )
            `;
            yield* sql`
              INSERT INTO agent_runs(
                run_id, root_run_id, parent_run_id, task_id, thread_id, status, depth,
                provider_id, harness_id, created_at, updated_at, record_json
              ) VALUES (
                ${runId}, ${runId}, ${run.parentRunId ?? null}, ${taskId}, ${input.threadId},
                ${run.status}, ${run.depth}, ${run.providerId}, ${run.harnessId},
                ${DateTime.formatIso(timestamp)}, ${DateTime.formatIso(timestamp)}, ${runJson}
              )
            `;
            yield* sql`
              INSERT INTO agent_turns(
                turn_id, thread_id, task_id, run_id, status, created_at, updated_at, record_json
              ) VALUES (
                ${turnId}, ${input.threadId}, ${taskId}, ${runId}, ${turn.status},
                ${DateTime.formatIso(timestamp)}, ${DateTime.formatIso(timestamp)}, ${turnJson}
              )
            `;
            yield* sql`
              INSERT INTO agent_messages(
                message_id, thread_id, task_id, turn_id, run_id, role, status, visibility,
                created_at, updated_at, completed_at, record_json
              ) VALUES (
                ${messageId}, ${input.threadId}, ${taskId}, ${turnId}, ${runId}, ${message.role},
                ${message.status}, ${message.visibility}, ${DateTime.formatIso(timestamp)},
                ${DateTime.formatIso(timestamp)}, ${DateTime.formatIso(timestamp)}, ${messageJson}
              )
            `;
            yield* sql`
              INSERT INTO agent_message_parts(message_id, part_index, part_type, record_json)
              VALUES (${messageId}, 0, 'text', ${messagePartJson})
            `;
            const submitted = yield* appendEventTransaction(sql, submittedInput);
            const queued = yield* appendEventTransaction(sql, queuedInput);
            const messageEvent = yield* appendEventTransaction(sql, messageInput);
            const projectedThread = new AgentThread({
              ...thread,
              activeTaskId: taskId,
              lastSequence: messageEvent.sequence,
              lastTaskId: taskId,
              updatedAt: messageEvent.persistedAt,
            });
            const threadJson = yield* encodeRecord("thread.encode", AgentThread, projectedThread);
            yield* sql`
              UPDATE agent_threads SET active_task_id = ${taskId}, record_json = ${threadJson}
              WHERE thread_id = ${input.threadId}
            `;
            return [submitted, queued, messageEvent] as const;
          }),
        )
        .pipe(Effect.mapError((cause) => agentStorageError("task.submit.transaction", cause)));
      yield* Effect.forEach(events, (event) =>
        hub.publish({ sequence: event.sequence, threadId: input.threadId }),
      );
      return task;
    });

    const claimNext: Effect.Effect<Option.Option<AgentClaim>, AgentStorageError> = Effect.gen(
      function* () {
        const timestamp = yield* now;
        const candidates = yield* sql<RecordRow>`
        SELECT record_json FROM agent_tasks
        WHERE status IN ('queued', 'resuming')
          AND (not_before IS NULL OR not_before <= ${DateTime.formatIso(timestamp)})
        ORDER BY
          CASE priority_lane
            WHEN 'control' THEN 0 WHEN 'interactive' THEN 1
            WHEN 'assigned' THEN 2 ELSE 3
          END ASC,
          enqueue_sequence ASC
        LIMIT 32
      `.pipe(Effect.mapError((cause) => agentStorageError("scheduler.candidates", cause)));
        const tasks = yield* Effect.forEach(candidates, (row) =>
          decodeRecord("task.decode", AgentTask, row.record_json),
        );
        if (tasks.length === 0) return Option.none();

        const running = yield* sql<
          CountRow & {
            readonly parent_run_id: string | null;
            readonly provider_id: string;
            readonly repository_id: string | null;
          }
        >`
        SELECT t.provider_id, t.repository_id, t.parent_run_id, count(*) AS value
        FROM agent_attempts a
        JOIN agent_runs r ON r.run_id = a.run_id
        JOIN agent_tasks t ON t.task_id = r.task_id
        WHERE a.status IN ('claimed','preparing','running','suspending')
        GROUP BY t.provider_id, t.repository_id, t.parent_run_id
      `.pipe(Effect.mapError((cause) => agentStorageError("scheduler.capacity", cause)));
        const totalRunning = running.reduce((total, row) => total + row.value, 0);
        if (totalRunning >= config.globalConcurrency) return Option.none();
        const task = tasks.find((candidate) => {
          const provider = running
            .filter((row) => row.provider_id === candidate.providerId)
            .reduce((total, row) => total + row.value, 0);
          const repository = running
            .filter(
              (row) =>
                candidate.repositoryId !== undefined &&
                row.repository_id === candidate.repositoryId,
            )
            .reduce((total, row) => total + row.value, 0);
          const parent = running
            .filter(
              (row) =>
                candidate.parentRunId !== undefined && row.parent_run_id === candidate.parentRunId,
            )
            .reduce((total, row) => total + row.value, 0);
          return (
            provider < config.perProviderConcurrency &&
            (candidate.repositoryId === undefined ||
              repository < config.perRepositoryConcurrency) &&
            (candidate.parentRunId === undefined || parent < config.maxRunningChildrenPerParent)
          );
        });
        if (task === undefined || task.currentRunId === undefined) return Option.none();

        const runOption = yield* getRun(task.currentRunId);
        if (Option.isNone(runOption)) {
          return yield* agentStorageError(
            "scheduler.claim",
            new Error("Task root run is missing."),
          );
        }
        const run = runOption.value;
        const attemptId = yield* makeAgentId<AgentAttemptId>("agent_attempt");
        const ordinal = task.currentAttempt + 1;
        const leaseExpiresAt = DateTime.add(timestamp, { milliseconds: config.leaseDurationMs });
        const attempt = new AgentAttempt({
          attemptId,
          authorityHash: task.requestHash,
          fencingToken: ordinal,
          leaseExpiresAt,
          ordinal,
          ownerId: config.ownerId,
          promptHash: task.requestHash,
          providerState: {},
          runId: run.runId,
          startedAt: timestamp,
          status: "claimed",
        });
        const claimedTask = new AgentTask({
          ...task,
          currentAttempt: ordinal,
          startedAt: task.startedAt ?? timestamp,
          status: "claimed",
          updatedAt: timestamp,
        });
        const runningRun = new AgentRun({
          ...run,
          currentAttemptId: attemptId,
          status: "running",
          updatedAt: timestamp,
        });
        const attemptJson = yield* encodeRecord("attempt.encode", AgentAttempt, attempt);
        const taskJson = yield* encodeRecord("task.encode", AgentTask, claimedTask);
        const runJson = yield* encodeRecord("run.encode", AgentRun, runningRun);
        const eventInput = yield* makeEventAppend({
          attemptId,
          eventType: "attempt.claimed",
          payload: {},
          retention: "permanent",
          rootRunId: run.rootRunId,
          runId: run.runId,
          taskId: task.taskId,
          threadId: task.threadId,
          visibility: "internal",
        });

        const event = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`
              UPDATE agent_tasks SET status = 'claimed', current_attempt = ${ordinal},
                started_at = coalesce(started_at, ${DateTime.formatIso(timestamp)}),
                updated_at = ${DateTime.formatIso(timestamp)}, record_json = ${taskJson}
              WHERE task_id = ${task.taskId} AND status IN ('queued','resuming')
            `;
              yield* sql`
              UPDATE agent_runs SET status = 'running', current_attempt_id = ${attemptId},
                updated_at = ${DateTime.formatIso(timestamp)}, record_json = ${runJson}
              WHERE run_id = ${run.runId} AND status IN ('queued','running','suspended')
            `;
              yield* sql`
              INSERT INTO agent_attempts(
                attempt_id, run_id, ordinal, status, owner_id, fencing_token, lease_expires_at,
                started_at, record_json
              ) VALUES (
                ${attemptId}, ${run.runId}, ${ordinal}, 'claimed', ${config.ownerId}, ${ordinal},
                ${DateTime.formatIso(leaseExpiresAt)}, ${DateTime.formatIso(timestamp)}, ${attemptJson}
              )
            `;
              return yield* appendEventTransaction(sql, eventInput);
            }),
          )
          .pipe(
            Effect.mapError((cause) => agentStorageError("scheduler.claim.transaction", cause)),
          );
        yield* hub.publish({ sequence: event.sequence, threadId: task.threadId });
        return Option.some({ attempt, run: runningRun, task: claimedTask });
      },
    );

    const heartbeat = Effect.fn("AgentQueueStore.heartbeat")(function* (input: {
      readonly attemptId: AgentAttemptId;
      readonly fencingToken: number;
    }) {
      const rows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_attempts WHERE attempt_id = ${input.attemptId}
      `.pipe(Effect.mapError((cause) => agentStorageError("attempt.get", cause)));
      if (rows[0] === undefined) {
        return yield* new AgentStateConflictError({
          code: "agent_attempt_lease_lost",
          entityId: input.attemptId,
          message: "The attempt lease no longer exists.",
          retryable: true,
        });
      }
      const attempt = yield* decodeRecord("attempt.decode", AgentAttempt, rows[0].record_json);
      if (attempt.fencingToken !== input.fencingToken) {
        return yield* new AgentStateConflictError({
          actualState: String(input.fencingToken),
          code: "agent_attempt_fencing_conflict",
          entityId: input.attemptId,
          expectedState: String(attempt.fencingToken),
          message: "The attempt fencing token is stale.",
          retryable: false,
        });
      }
      const heartbeatAt = yield* now;
      const leaseExpiresAt = DateTime.add(heartbeatAt, {
        milliseconds: config.leaseDurationMs,
      });
      const updated = new AgentAttempt({ ...attempt, heartbeatAt, leaseExpiresAt });
      const recordJson = yield* encodeRecord("attempt.encode", AgentAttempt, updated);
      yield* sql`
        UPDATE agent_attempts SET heartbeat_at = ${DateTime.formatIso(
          heartbeatAt,
        )}, lease_expires_at = ${DateTime.formatIso(leaseExpiresAt)}, record_json = ${recordJson}
        WHERE attempt_id = ${input.attemptId} AND fencing_token = ${input.fencingToken}
      `.pipe(Effect.mapError((cause) => agentStorageError("attempt.heartbeat", cause)));
      return updated;
    });

    const list = Effect.fn("AgentQueueStore.list")(function* (
      input: Parameters<AgentQueueStoreShape["list"]>[0] = {},
    ) {
      const rows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_tasks
        WHERE (${input.status ?? null} IS NULL OR status = ${input.status ?? null})
          AND (${input.threadId ?? null} IS NULL OR thread_id = ${input.threadId ?? null})
        ORDER BY enqueue_sequence DESC
        LIMIT ${input.limit ?? 100}
      `.pipe(Effect.mapError((cause) => agentStorageError("task.list", cause)));
      return yield* Effect.forEach(rows, (row) =>
        decodeRecord("task.decode", AgentTask, row.record_json),
      );
    });

    const reconcile: Effect.Effect<ReadonlyArray<AgentTask>, AgentStorageError> = Effect.gen(
      function* () {
        const rows = yield* sql<{
          readonly attempt_json: string;
          readonly run_json: string;
          readonly task_json: string;
        }>`
          SELECT a.record_json AS attempt_json, r.record_json AS run_json,
            t.record_json AS task_json
          FROM agent_attempts a
          JOIN agent_runs r ON r.run_id = a.run_id
          JOIN agent_tasks t ON t.task_id = r.task_id
          WHERE a.status IN ('claimed','preparing','running','suspending')
        `.pipe(Effect.mapError((cause) => agentStorageError("reconcile.list", cause)));

        return yield* Effect.forEach(rows, (row) =>
          Effect.gen(function* () {
            const attempt = yield* decodeRecord("attempt.decode", AgentAttempt, row.attempt_json);
            const run = yield* decodeRecord("run.decode", AgentRun, row.run_json);
            const task = yield* decodeRecord("task.decode", AgentTask, row.task_json);
            const timestamp = yield* now;
            const interrupted = new AgentAttempt({
              ...attempt,
              completedAt: timestamp,
              lastError: {
                code: "process_restarted",
                message: "The owning process stopped before the attempt reached a terminal state.",
                retryable: true,
              },
              status: "interrupted",
            });
            const retry = task.currentAttempt < task.maxAttempts;
            const reconciledTask = new AgentTask({
              ...task,
              ...(retry
                ? { notBefore: timestamp, status: "queued" as const }
                : {
                    completedAt: timestamp,
                    status: "failed" as const,
                    terminal: {
                      error: {
                        code: "attempts_exhausted",
                        message: "The task exhausted its attempt budget during reconciliation.",
                        retryable: false,
                      },
                      status: "failed" as const,
                    },
                  }),
              updatedAt: timestamp,
            });
            const reconciledRun = new AgentRun({
              ...run,
              status: retry ? "queued" : "failed",
              ...(retry ? {} : { terminal: reconciledTask.terminal }),
              updatedAt: timestamp,
            });
            const attemptJson = yield* encodeRecord("attempt.encode", AgentAttempt, interrupted);
            const taskJson = yield* encodeRecord("task.encode", AgentTask, reconciledTask);
            const runJson = yield* encodeRecord("run.encode", AgentRun, reconciledRun);
            const eventInput = yield* makeEventAppend({
              attemptId: attempt.attemptId,
              eventType: retry ? "reconciliation.retried" : "reconciliation.failed",
              payload: { reason: "process-restart" },
              retention: "permanent",
              rootRunId: run.rootRunId,
              runId: run.runId,
              taskId: task.taskId,
              threadId: task.threadId,
              visibility: "internal",
            });
            const event = yield* sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* sql`
                    UPDATE agent_attempts SET status = 'interrupted',
                      completed_at = ${DateTime.formatIso(timestamp)}, record_json = ${attemptJson}
                    WHERE attempt_id = ${attempt.attemptId}
                      AND status IN ('claimed','preparing','running','suspending')
                  `;
                  yield* sql`
                    UPDATE agent_runs SET status = ${reconciledRun.status},
                      updated_at = ${DateTime.formatIso(timestamp)}, record_json = ${runJson}
                    WHERE run_id = ${run.runId}
                  `;
                  yield* sql`
                    UPDATE agent_tasks SET status = ${reconciledTask.status},
                      not_before = ${retry ? DateTime.formatIso(timestamp) : null},
                      completed_at = ${retry ? null : DateTime.formatIso(timestamp)},
                      updated_at = ${DateTime.formatIso(timestamp)}, record_json = ${taskJson}
                    WHERE task_id = ${task.taskId}
                  `;
                  return yield* appendEventTransaction(sql, eventInput);
                }),
              )
              .pipe(Effect.mapError((cause) => agentStorageError("reconcile.transaction", cause)));
            yield* hub.publish({ sequence: event.sequence, threadId: task.threadId });
            return reconciledTask;
          }),
        );
      },
    );

    const requestCancel = Effect.fn("AgentQueueStore.requestCancel")(function* (
      taskId: AgentTaskId,
      reason?: string,
    ) {
      const current = yield* get(taskId);
      if (Option.isNone(current)) {
        return yield* new AgentNotFoundError({
          code: "agent_task_not_found",
          entityId: taskId,
          entityType: "task",
          message: `Agent task not found: ${taskId}`,
          retryable: false,
        });
      }
      if (
        current.value.status === "completed" ||
        current.value.status === "failed" ||
        current.value.status === "cancelled"
      ) {
        return current.value;
      }
      const terminalImmediately =
        current.value.status === "queued" ||
        current.value.status === "retry-wait" ||
        current.value.status === "resuming";
      const timestamp = yield* now;
      const task = new AgentTask({
        ...current.value,
        ...(terminalImmediately
          ? {
              completedAt: timestamp,
              status: "cancelled" as const,
              terminal: {
                reason: reason ?? "Cancellation requested.",
                status: "cancelled" as const,
              },
            }
          : { status: "cancelling" as const }),
        updatedAt: timestamp,
      });
      const taskJson = yield* encodeRecord("task.encode", AgentTask, task);
      const cancelledRun =
        terminalImmediately && task.currentRunId !== undefined
          ? yield* getRun(task.currentRunId).pipe(
              Effect.map(
                Option.map(
                  (run) =>
                    new AgentRun({
                      ...run,
                      status: "cancelled",
                      terminal: task.terminal,
                      updatedAt: timestamp,
                    }),
                ),
              ),
            )
          : Option.none<AgentRun>();
      const runJson = Option.isSome(cancelledRun)
        ? yield* encodeRecord("run.encode", AgentRun, cancelledRun.value)
        : undefined;
      const threadRows = terminalImmediately
        ? yield* sql<RecordRow>`
            SELECT record_json FROM agent_threads WHERE thread_id = ${task.threadId}
          `.pipe(Effect.mapError((cause) => agentStorageError("task.cancel.thread", cause)))
        : [];
      const threadJson =
        threadRows[0] === undefined
          ? undefined
          : yield* decodeRecord("thread.decode", AgentThread, threadRows[0].record_json).pipe(
              Effect.flatMap((thread) =>
                encodeRecord(
                  "thread.encode",
                  AgentThread,
                  new AgentThread({ ...thread, activeTaskId: undefined, updatedAt: timestamp }),
                ),
              ),
            );
      const eventInput = yield* makeEventAppend({
        eventType: terminalImmediately ? "task.cancelled" : "task.cancelling",
        payload: { reason: reason ?? "Cancellation requested." },
        retention: "permanent",
        runId: task.currentRunId,
        taskId,
        threadId: task.threadId,
        visibility: "public",
      });
      const event = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`
              UPDATE agent_tasks SET status = ${task.status},
                completed_at = ${terminalImmediately ? DateTime.formatIso(timestamp) : null},
                updated_at = ${DateTime.formatIso(timestamp)}, record_json = ${taskJson}
              WHERE task_id = ${taskId}
            `;
            if (terminalImmediately && task.currentRunId !== undefined && runJson !== undefined) {
              yield* sql`
                UPDATE agent_runs SET status = 'cancelled', updated_at = ${DateTime.formatIso(
                  timestamp,
                )}, record_json = ${runJson} WHERE run_id = ${task.currentRunId}
              `;
              yield* sql`
                UPDATE agent_threads SET active_task_id = NULL,
                  record_json = coalesce(${threadJson ?? null}, record_json)
                WHERE thread_id = ${task.threadId} AND active_task_id = ${taskId}
              `;
            }
            return yield* appendEventTransaction(sql, eventInput);
          }),
        )
        .pipe(Effect.mapError((cause) => agentStorageError("task.cancel.transaction", cause)));
      yield* hub.publish({ sequence: event.sequence, threadId: task.threadId });
      return task;
    });

    return AgentQueueStore.of({
      claimNext,
      get,
      getRun,
      heartbeat,
      list,
      reconcile,
      requestCancel,
      submit,
    });
  }),
);
