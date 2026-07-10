import { Context, DateTime, Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { AgentAttempt } from "./AgentAttempt.ts";
import { AgentJson, AgentTerminalResult } from "./AgentCommon.ts";
import { AgentStorageError, AgentStateConflictError, agentStorageError } from "./AgentErrors.ts";
import { AgentEventAppend, AgentRuntimeEvent } from "./AgentEvents.ts";
import type { AgentHarnessBinding } from "./AgentHarness.ts";
import type {
  AgentAttemptId,
  AgentInteractionId,
  AgentMessageId,
  AgentSessionId,
} from "./AgentIds.ts";
import { AgentInteraction } from "./AgentInteraction.ts";
import { AgentMessage } from "./AgentMessage.ts";
import { AgentRun } from "./AgentRun.ts";
import { AgentSessionBinding } from "./AgentSessionBinding.ts";
import { AgentTask } from "./AgentTask.ts";
import { AgentThread } from "./AgentThread.ts";
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

export type AgentExecutionLease = {
  readonly attempt: AgentAttempt;
  readonly run: AgentRun;
  readonly task: AgentTask;
};

export type AgentExecutionStoreShape = {
  readonly bindSession: (
    lease: AgentExecutionLease,
    binding: AgentHarnessBinding,
  ) => Effect.Effect<AgentSessionBinding, AgentStorageError | AgentStateConflictError>;
  readonly append: (
    lease: AgentExecutionLease,
    event: Omit<
      AgentEventAppend,
      "attemptId" | "eventId" | "occurredAt" | "rootRunId" | "runId" | "taskId" | "threadId"
    >,
  ) => Effect.Effect<AgentRuntimeEvent, AgentStorageError | AgentStateConflictError>;
  readonly finish: (
    lease: AgentExecutionLease,
    terminal: typeof AgentTerminalResult.Type,
  ) => Effect.Effect<AgentTask, AgentStorageError | AgentStateConflictError>;
  readonly markRunning: (
    lease: AgentExecutionLease,
  ) => Effect.Effect<AgentExecutionLease, AgentStorageError | AgentStateConflictError>;
  readonly refreshSessionBinding: (
    lease: AgentExecutionLease,
    sessionId: AgentSessionId,
    binding: AgentHarnessBinding,
  ) => Effect.Effect<AgentSessionBinding, AgentStorageError | AgentStateConflictError>;
  readonly resolveInteraction: (input: {
    readonly interactionId: AgentInteractionId;
    readonly responderId: string;
    readonly response: typeof AgentJson.Type;
  }) => Effect.Effect<AgentInteraction, AgentStorageError | AgentStateConflictError>;
  readonly scheduleRetry: (
    lease: AgentExecutionLease,
    error: { readonly code: string; readonly message: string; readonly retryable: boolean },
  ) => Effect.Effect<AgentTask, AgentStorageError | AgentStateConflictError>;
  readonly suspendForInteraction: (input: {
    readonly fields: Readonly<Record<string, typeof AgentJson.Type>>;
    readonly lease: AgentExecutionLease;
    readonly prompt: string;
    readonly providerRequestId: string;
    readonly safeDefault?: typeof AgentJson.Type;
    readonly type: "approval" | "user-input";
  }) => Effect.Effect<AgentInteraction, AgentStorageError | AgentStateConflictError>;
};

export class AgentExecutionStore extends Context.Service<
  AgentExecutionStore,
  AgentExecutionStoreShape
>()("@cycle/agents/AgentExecutionStore") {}

export const AgentExecutionStoreLive = Layer.effect(
  AgentExecutionStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const hub = yield* AgentEventHub;

    const verifyLease = Effect.fn("AgentExecutionStore.verifyLease")(function* (
      attemptId: AgentAttemptId,
      fencingToken: number,
    ) {
      const rows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_attempts WHERE attempt_id = ${attemptId}
      `.pipe(Effect.mapError((cause) => agentStorageError("execution.verify-lease", cause)));
      if (rows[0] === undefined) {
        return yield* new AgentStateConflictError({
          code: "agent_attempt_lease_lost",
          entityId: attemptId,
          message: "The active attempt no longer exists.",
          retryable: false,
        });
      }
      const attempt = yield* decodeRecord("attempt.decode", AgentAttempt, rows[0].record_json);
      if (attempt.fencingToken !== fencingToken) {
        return yield* new AgentStateConflictError({
          actualState: String(fencingToken),
          code: "agent_attempt_fencing_conflict",
          entityId: attemptId,
          expectedState: String(attempt.fencingToken),
          message: "A stale attempt tried to mutate durable state.",
          retryable: false,
        });
      }
      return attempt;
    });

    const bindSession = Effect.fn("AgentExecutionStore.bindSession")(function* (
      lease: AgentExecutionLease,
      binding: AgentHarnessBinding,
    ) {
      const timestamp = yield* now;
      const sessionId = yield* makeAgentId<AgentSessionId>("agent_session");
      const session = new AgentSessionBinding({
        adapterVersion: binding.adapterVersion,
        capabilities: binding.capabilities,
        createdAt: timestamp,
        harnessId: lease.task.harnessId,
        providerId: lease.task.providerId,
        runId: lease.run.runId,
        sessionId,
        status: "active",
        threadId: lease.task.threadId,
        updatedAt: timestamp,
        ...(binding.providerSessionId === undefined
          ? {}
          : { providerSessionId: binding.providerSessionId }),
        ...(binding.providerThreadId === undefined
          ? {}
          : { providerThreadId: binding.providerThreadId }),
        ...(binding.replayCursor === undefined ? {} : { replayCursor: binding.replayCursor }),
      });
      const sessionJson = yield* encodeRecord(
        "session-binding.encode",
        AgentSessionBinding,
        session,
      );
      const eventInput = yield* makeEventAppend({
        attemptId: lease.attempt.attemptId,
        eventType: "attempt.provider-attached",
        payload: { sessionId },
        retention: "permanent",
        rootRunId: lease.run.rootRunId,
        runId: lease.run.runId,
        taskId: lease.task.taskId,
        threadId: lease.task.threadId,
        visibility: "internal",
      });
      const event = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* verifyLease(lease.attempt.attemptId, lease.attempt.fencingToken);
            yield* sql`
              INSERT INTO agent_session_bindings(
                session_id, thread_id, run_id, harness_id, provider_id, provider_session_id,
                provider_thread_id, status, created_at, updated_at, record_json
              ) VALUES (
                ${sessionId}, ${session.threadId}, ${session.runId}, ${session.harnessId},
                ${session.providerId}, ${session.providerSessionId ?? null},
                ${session.providerThreadId ?? null}, ${session.status},
                ${DateTime.formatIso(timestamp)}, ${DateTime.formatIso(timestamp)}, ${sessionJson}
              )
            `;
            return yield* appendEventTransaction(sql, eventInput);
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof AgentStateConflictError
              ? cause
              : agentStorageError("session-binding.transaction", cause),
          ),
        );
      yield* hub.publish({ sequence: event.sequence, threadId: lease.task.threadId });
      return session;
    });

    const refreshSessionBinding = Effect.fn("AgentExecutionStore.refreshSessionBinding")(function* (
      lease: AgentExecutionLease,
      sessionId: AgentSessionId,
      binding: AgentHarnessBinding,
    ) {
      const rows = yield* sql<RecordRow>`
          SELECT record_json FROM agent_session_bindings WHERE session_id = ${sessionId}
        `.pipe(
        Effect.mapError((cause) => agentStorageError("session-binding.refresh.read", cause)),
      );
      if (rows[0] === undefined) {
        return yield* new AgentStateConflictError({
          code: "agent_session_binding_not_found",
          entityId: sessionId,
          message: `Agent session binding not found: ${sessionId}`,
          retryable: false,
        });
      }
      const current = yield* decodeRecord(
        "session-binding.decode",
        AgentSessionBinding,
        rows[0].record_json,
      );
      const timestamp = yield* now;
      const updated = new AgentSessionBinding({
        ...current,
        status: "closed",
        updatedAt: timestamp,
        ...(binding.providerSessionId === undefined
          ? {}
          : { providerSessionId: binding.providerSessionId }),
        ...(binding.providerThreadId === undefined
          ? {}
          : { providerThreadId: binding.providerThreadId }),
        ...(binding.replayCursor === undefined ? {} : { replayCursor: binding.replayCursor }),
      });
      const encoded = yield* encodeRecord("session-binding.encode", AgentSessionBinding, updated);
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* verifyLease(lease.attempt.attemptId, lease.attempt.fencingToken);
            yield* sql`
                UPDATE agent_session_bindings
                SET provider_session_id = ${updated.providerSessionId ?? null},
                    provider_thread_id = ${updated.providerThreadId ?? null},
                    status = ${updated.status}, updated_at = ${DateTime.formatIso(timestamp)},
                    record_json = ${encoded}
                WHERE session_id = ${sessionId}
              `;
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof AgentStateConflictError
              ? cause
              : agentStorageError("session-binding.refresh.transaction", cause),
          ),
        );
      return updated;
    });

    const append = Effect.fn("AgentExecutionStore.append")(function* (
      lease: AgentExecutionLease,
      input: Omit<
        AgentEventAppend,
        "attemptId" | "eventId" | "occurredAt" | "rootRunId" | "runId" | "taskId" | "threadId"
      >,
    ) {
      const event = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* verifyLease(lease.attempt.attemptId, lease.attempt.fencingToken);
            let payload = input.payload;
            if (
              input.eventType === "message.delta" ||
              input.eventType === "message.completed" ||
              input.eventType === "message.failed"
            ) {
              const messageRows = yield* sql<RecordRow>`
                SELECT record_json FROM agent_messages
                WHERE task_id = ${lease.task.taskId} AND role = 'assistant'
                ORDER BY created_at DESC LIMIT 1
              `;
              const timestamp = yield* now;
              const existing =
                messageRows[0] === undefined
                  ? undefined
                  : yield* decodeRecord("message.decode", AgentMessage, messageRows[0].record_json);
              const messageId =
                existing?.messageId ?? (yield* makeAgentId<AgentMessageId>("agent_message"));
              const previousText =
                existing?.parts.find((part) => part._tag === "text")?._tag === "text"
                  ? existing.parts.find((part) => part._tag === "text")?.text
                  : undefined;
              const delta = typeof input.payload.delta === "string" ? input.payload.delta : "";
              const snapshot =
                typeof input.payload.snapshot === "string"
                  ? input.payload.snapshot
                  : `${previousText ?? ""}${delta}`;
              const status =
                input.eventType === "message.completed"
                  ? "completed"
                  : input.eventType === "message.failed"
                    ? "failed"
                    : "streaming";
              const message = new AgentMessage({
                attemptId: lease.attempt.attemptId,
                createdAt: existing?.createdAt ?? timestamp,
                messageId,
                parts: [{ _tag: "text", text: snapshot }],
                providerMessageId: existing?.providerMessageId,
                role: "assistant",
                runId: lease.run.runId,
                status,
                taskId: lease.task.taskId,
                threadId: lease.task.threadId,
                turnId: existing?.turnId,
                updatedAt: timestamp,
                visibility: "public",
                ...(status === "streaming" ? {} : { completedAt: timestamp }),
              });
              const messageJson = yield* encodeRecord("message.encode", AgentMessage, message);
              if (existing === undefined) {
                yield* sql`
                  INSERT INTO agent_messages(
                    message_id, thread_id, task_id, turn_id, run_id, attempt_id, role, status,
                    visibility, provider_message_id, created_at, updated_at, completed_at, record_json
                  ) VALUES (
                    ${messageId}, ${lease.task.threadId}, ${lease.task.taskId}, NULL,
                    ${lease.run.runId}, ${lease.attempt.attemptId}, 'assistant', ${status}, 'public',
                    NULL, ${DateTime.formatIso(timestamp)}, ${DateTime.formatIso(timestamp)},
                    ${status === "streaming" ? null : DateTime.formatIso(timestamp)}, ${messageJson}
                  )
                `;
              } else {
                yield* sql`
                  UPDATE agent_messages SET status = ${status}, updated_at = ${DateTime.formatIso(
                    timestamp,
                  )}, completed_at = ${status === "streaming" ? null : DateTime.formatIso(timestamp)},
                    record_json = ${messageJson}
                  WHERE message_id = ${messageId}
                `;
              }
              payload = { ...input.payload, messageId };
            }
            const eventInput = yield* makeEventAppend({
              ...input,
              attemptId: lease.attempt.attemptId,
              payload,
              rootRunId: lease.run.rootRunId,
              runId: lease.run.runId,
              taskId: lease.task.taskId,
              threadId: lease.task.threadId,
            });
            return yield* appendEventTransaction(sql, eventInput);
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof AgentStateConflictError
              ? cause
              : agentStorageError("execution.append.transaction", cause),
          ),
        );
      yield* hub.publish({ sequence: event.sequence, threadId: lease.task.threadId });
      return event;
    });

    const markRunning = Effect.fn("AgentExecutionStore.markRunning")(function* (
      lease: AgentExecutionLease,
    ) {
      const timestamp = yield* now;
      const attempt = new AgentAttempt({
        ...lease.attempt,
        heartbeatAt: timestamp,
        status: "running",
      });
      const task = new AgentTask({ ...lease.task, status: "running", updatedAt: timestamp });
      const run = new AgentRun({ ...lease.run, status: "running", updatedAt: timestamp });
      const attemptJson = yield* encodeRecord("attempt.encode", AgentAttempt, attempt);
      const taskJson = yield* encodeRecord("task.encode", AgentTask, task);
      const runJson = yield* encodeRecord("run.encode", AgentRun, run);
      const eventInput = yield* makeEventAppend({
        attemptId: attempt.attemptId,
        eventType: "task.started",
        payload: {},
        retention: "permanent",
        rootRunId: run.rootRunId,
        runId: run.runId,
        taskId: task.taskId,
        threadId: task.threadId,
        visibility: "public",
      });
      const event = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* verifyLease(attempt.attemptId, attempt.fencingToken);
            yield* sql`
              UPDATE agent_attempts SET status = 'running', heartbeat_at = ${DateTime.formatIso(
                timestamp,
              )}, record_json = ${attemptJson}
              WHERE attempt_id = ${attempt.attemptId} AND status IN ('claimed','preparing')
            `;
            yield* sql`
              UPDATE agent_tasks SET status = 'running', updated_at = ${DateTime.formatIso(
                timestamp,
              )}, record_json = ${taskJson}
              WHERE task_id = ${task.taskId} AND status IN ('claimed','preparing')
            `;
            yield* sql`
              UPDATE agent_runs SET status = 'running', updated_at = ${DateTime.formatIso(
                timestamp,
              )}, record_json = ${runJson}
              WHERE run_id = ${run.runId}
            `;
            return yield* appendEventTransaction(sql, eventInput);
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof AgentStateConflictError
              ? cause
              : agentStorageError("execution.start.transaction", cause),
          ),
        );
      yield* hub.publish({ sequence: event.sequence, threadId: task.threadId });
      return { attempt, run, task };
    });

    const finish = Effect.fn("AgentExecutionStore.finish")(function* (
      lease: AgentExecutionLease,
      terminal: typeof AgentTerminalResult.Type,
    ) {
      const timestamp = yield* now;
      const status = terminal.status;
      const attempt = new AgentAttempt({
        ...lease.attempt,
        completedAt: timestamp,
        status,
        ...(terminal.status === "failed" ? { lastError: terminal.error } : {}),
      });
      const task = new AgentTask({
        ...lease.task,
        completedAt: timestamp,
        status,
        terminal,
        updatedAt: timestamp,
      });
      const run = new AgentRun({
        ...lease.run,
        status,
        terminal,
        updatedAt: timestamp,
      });
      const attemptJson = yield* encodeRecord("attempt.encode", AgentAttempt, attempt);
      const taskJson = yield* encodeRecord("task.encode", AgentTask, task);
      const runJson = yield* encodeRecord("run.encode", AgentRun, run);
      const eventType = `task.${status}` as "task.completed" | "task.failed" | "task.cancelled";
      const eventInput = yield* makeEventAppend({
        attemptId: attempt.attemptId,
        eventType,
        payload:
          terminal.status === "completed"
            ? { summary: terminal.summary }
            : terminal.status === "failed"
              ? { code: terminal.error.code, message: terminal.error.message }
              : { reason: terminal.reason },
        retention: "permanent",
        rootRunId: run.rootRunId,
        runId: run.runId,
        taskId: task.taskId,
        threadId: task.threadId,
        visibility: "public",
      });

      const event = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* verifyLease(attempt.attemptId, attempt.fencingToken);
            yield* sql`
              UPDATE agent_attempts SET status = ${status}, completed_at = ${DateTime.formatIso(
                timestamp,
              )}, record_json = ${attemptJson}
              WHERE attempt_id = ${attempt.attemptId}
            `;
            yield* sql`
              UPDATE agent_runs SET status = ${status}, updated_at = ${DateTime.formatIso(
                timestamp,
              )}, record_json = ${runJson}
              WHERE run_id = ${run.runId}
            `;
            yield* sql`
              UPDATE agent_tasks SET status = ${status}, completed_at = ${DateTime.formatIso(
                timestamp,
              )}, updated_at = ${DateTime.formatIso(timestamp)}, record_json = ${taskJson}
              WHERE task_id = ${task.taskId}
            `;

            const threadRows = yield* sql<RecordRow>`
              SELECT record_json FROM agent_threads WHERE thread_id = ${task.threadId}
            `;
            if (threadRows[0] !== undefined) {
              const thread = yield* decodeRecord(
                "thread.decode",
                AgentThread,
                threadRows[0].record_json,
              );
              const projected = new AgentThread({
                ...thread,
                activeTaskId: undefined,
                updatedAt: timestamp,
              });
              const threadJson = yield* encodeRecord("thread.encode", AgentThread, projected);
              yield* sql`
                UPDATE agent_threads SET active_task_id = NULL, record_json = ${threadJson}
                WHERE thread_id = ${task.threadId} AND active_task_id = ${task.taskId}
              `;
            }
            return yield* appendEventTransaction(sql, eventInput);
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof AgentStateConflictError
              ? cause
              : agentStorageError("execution.finish.transaction", cause),
          ),
        );
      yield* hub.publish({ sequence: event.sequence, threadId: task.threadId });
      return task;
    });

    const suspendForInteraction = Effect.fn("AgentExecutionStore.suspendForInteraction")(
      function* (input: {
        readonly fields: Readonly<Record<string, typeof AgentJson.Type>>;
        readonly lease: AgentExecutionLease;
        readonly prompt: string;
        readonly providerRequestId: string;
        readonly safeDefault?: typeof AgentJson.Type;
        readonly type: "approval" | "user-input";
      }) {
        const timestamp = yield* now;
        const interactionId = yield* makeAgentId<AgentInteractionId>("agent_interaction");
        const interaction = new AgentInteraction({
          attemptId: input.lease.attempt.attemptId,
          authority: input.lease.task.authority,
          createdAt: timestamp,
          fields: input.fields,
          idempotencyKey: `${input.lease.attempt.attemptId}:${input.providerRequestId}`,
          interactionId,
          prompt: input.prompt,
          providerRequestId: input.providerRequestId,
          runId: input.lease.run.runId,
          status: "open",
          taskId: input.lease.task.taskId,
          threadId: input.lease.task.threadId,
          type: input.type,
          ...(input.safeDefault === undefined ? {} : { safeDefault: input.safeDefault }),
        });
        const attempt = new AgentAttempt({ ...input.lease.attempt, status: "suspended" });
        const task = new AgentTask({
          ...input.lease.task,
          activeInteractionId: interactionId,
          status: "suspended",
          updatedAt: timestamp,
        });
        const run = new AgentRun({ ...input.lease.run, status: "suspended", updatedAt: timestamp });
        const interactionJson = yield* encodeRecord(
          "interaction.encode",
          AgentInteraction,
          interaction,
        );
        const attemptJson = yield* encodeRecord("attempt.encode", AgentAttempt, attempt);
        const taskJson = yield* encodeRecord("task.encode", AgentTask, task);
        const runJson = yield* encodeRecord("run.encode", AgentRun, run);
        const eventInput = yield* makeEventAppend({
          attemptId: attempt.attemptId,
          eventType: input.type === "approval" ? "approval.requested" : "user-input.requested",
          payload: { interactionId, prompt: input.prompt },
          retention: "permanent",
          rootRunId: run.rootRunId,
          runId: run.runId,
          taskId: task.taskId,
          threadId: task.threadId,
          visibility: "public",
        });
        const event = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* verifyLease(attempt.attemptId, attempt.fencingToken);
              yield* sql`
                INSERT INTO agent_interactions(
                  interaction_id, thread_id, task_id, run_id, attempt_id, type, status,
                  provider_request_id, idempotency_key, created_at, record_json
                ) VALUES (
                  ${interactionId}, ${task.threadId}, ${task.taskId}, ${run.runId},
                  ${attempt.attemptId}, ${interaction.type}, 'open', ${interaction.providerRequestId},
                  ${interaction.idempotencyKey}, ${DateTime.formatIso(timestamp)}, ${interactionJson}
                )
              `;
              yield* sql`
                UPDATE agent_attempts SET status = 'suspended', record_json = ${attemptJson}
                WHERE attempt_id = ${attempt.attemptId}
              `;
              yield* sql`
                UPDATE agent_runs SET status = 'suspended', record_json = ${runJson}
                WHERE run_id = ${run.runId}
              `;
              yield* sql`
                UPDATE agent_tasks SET status = 'suspended', updated_at = ${DateTime.formatIso(
                  timestamp,
                )}, record_json = ${taskJson} WHERE task_id = ${task.taskId}
              `;
              return yield* appendEventTransaction(sql, eventInput);
            }),
          )
          .pipe(
            Effect.mapError((cause) =>
              cause instanceof AgentStateConflictError
                ? cause
                : agentStorageError("interaction.suspend.transaction", cause),
            ),
          );
        yield* hub.publish({ sequence: event.sequence, threadId: task.threadId });
        return interaction;
      },
    );

    const resolveInteraction = Effect.fn("AgentExecutionStore.resolveInteraction")(
      function* (input: {
        readonly interactionId: AgentInteractionId;
        readonly responderId: string;
        readonly response: typeof AgentJson.Type;
      }) {
        const rows = yield* sql<RecordRow>`
        SELECT record_json FROM agent_interactions WHERE interaction_id = ${input.interactionId}
      `.pipe(Effect.mapError((cause) => agentStorageError("interaction.get", cause)));
        if (rows[0] === undefined) {
          return yield* new AgentStateConflictError({
            code: "agent_interaction_not_found",
            entityId: input.interactionId,
            message: "The requested interaction does not exist.",
            retryable: false,
          });
        }
        const current = yield* decodeRecord(
          "interaction.decode",
          AgentInteraction,
          rows[0].record_json,
        );
        if (current.status === "answered") return current;
        if (current.status !== "open") {
          return yield* new AgentStateConflictError({
            actualState: current.status,
            code: "agent_interaction_closed",
            entityId: input.interactionId,
            expectedState: "open",
            message: "The interaction is no longer open.",
            retryable: false,
          });
        }
        const timestamp = yield* now;
        const answered = new AgentInteraction({
          ...current,
          answeredAt: timestamp,
          responderId: input.responderId,
          response: input.response,
          status: "answered",
        });
        const answeredJson = yield* encodeRecord("interaction.encode", AgentInteraction, answered);
        const taskRows = yield* sql<RecordRow>`
          SELECT record_json FROM agent_tasks WHERE task_id = ${current.taskId}
        `.pipe(Effect.mapError((cause) => agentStorageError("interaction.task", cause)));
        const runRows = yield* sql<RecordRow>`
          SELECT record_json FROM agent_runs WHERE run_id = ${current.runId}
        `.pipe(Effect.mapError((cause) => agentStorageError("interaction.run", cause)));
        const attemptRows = yield* sql<RecordRow>`
          SELECT record_json FROM agent_attempts WHERE attempt_id = ${current.attemptId}
        `.pipe(Effect.mapError((cause) => agentStorageError("interaction.attempt", cause)));
        if (taskRows[0] === undefined || runRows[0] === undefined || attemptRows[0] === undefined) {
          return yield* agentStorageError(
            "interaction.resolve",
            new Error("Interaction owner is missing."),
          );
        }
        const task = new AgentTask({
          ...(yield* decodeRecord("task.decode", AgentTask, taskRows[0].record_json)),
          activeInteractionId: undefined,
          status: "running",
          updatedAt: timestamp,
        });
        const run = new AgentRun({
          ...(yield* decodeRecord("run.decode", AgentRun, runRows[0].record_json)),
          status: "running",
          updatedAt: timestamp,
        });
        const attempt = new AgentAttempt({
          ...(yield* decodeRecord("attempt.decode", AgentAttempt, attemptRows[0].record_json)),
          status: "running",
        });
        const taskJson = yield* encodeRecord("task.encode", AgentTask, task);
        const runJson = yield* encodeRecord("run.encode", AgentRun, run);
        const attemptJson = yield* encodeRecord("attempt.encode", AgentAttempt, attempt);
        const eventInput = yield* makeEventAppend({
          attemptId: current.attemptId,
          eventType: current.type === "approval" ? "approval.resolved" : "user-input.resolved",
          payload: { interactionId: input.interactionId },
          retention: "permanent",
          rootRunId: run.rootRunId,
          runId: run.runId,
          taskId: task.taskId,
          threadId: task.threadId,
          visibility: "public",
        });
        const event = yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* sql`
              UPDATE agent_interactions SET status = 'answered', answered_at = ${DateTime.formatIso(
                timestamp,
              )}, record_json = ${answeredJson} WHERE interaction_id = ${input.interactionId}
            `;
              yield* sql`UPDATE agent_tasks SET status = 'running', record_json = ${taskJson} WHERE task_id = ${task.taskId}`;
              yield* sql`UPDATE agent_runs SET status = 'running', record_json = ${runJson} WHERE run_id = ${run.runId}`;
              yield* sql`UPDATE agent_attempts SET status = 'running', record_json = ${attemptJson} WHERE attempt_id = ${attempt.attemptId}`;
              return yield* appendEventTransaction(sql, eventInput);
            }),
          )
          .pipe(
            Effect.mapError((cause) => agentStorageError("interaction.resolve.transaction", cause)),
          );
        yield* hub.publish({ sequence: event.sequence, threadId: task.threadId });
        return answered;
      },
    );

    const scheduleRetry = Effect.fn("AgentExecutionStore.scheduleRetry")(function* (
      lease: AgentExecutionLease,
      error: { readonly code: string; readonly message: string; readonly retryable: boolean },
    ) {
      const timestamp = yield* now;
      const delaySeconds = Math.min(300, 2 ** Math.max(0, lease.attempt.ordinal - 1));
      const notBefore = DateTime.add(timestamp, { seconds: delaySeconds });
      const attempt = new AgentAttempt({
        ...lease.attempt,
        completedAt: timestamp,
        lastError: error,
        status: "failed",
      });
      const task = new AgentTask({
        ...lease.task,
        notBefore,
        status: "queued",
        updatedAt: timestamp,
      });
      const run = new AgentRun({ ...lease.run, status: "queued", updatedAt: timestamp });
      const attemptJson = yield* encodeRecord("attempt.encode", AgentAttempt, attempt);
      const taskJson = yield* encodeRecord("task.encode", AgentTask, task);
      const runJson = yield* encodeRecord("run.encode", AgentRun, run);
      const eventInput = yield* makeEventAppend({
        attemptId: attempt.attemptId,
        eventType: "task.retry-scheduled",
        payload: { code: error.code, delaySeconds },
        retention: "permanent",
        rootRunId: run.rootRunId,
        runId: run.runId,
        taskId: task.taskId,
        threadId: task.threadId,
        visibility: "public",
      });
      const event = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* verifyLease(attempt.attemptId, attempt.fencingToken);
            yield* sql`
              UPDATE agent_attempts SET status = 'failed', completed_at = ${DateTime.formatIso(
                timestamp,
              )}, record_json = ${attemptJson} WHERE attempt_id = ${attempt.attemptId}
            `;
            yield* sql`
              UPDATE agent_runs SET status = 'queued', updated_at = ${DateTime.formatIso(
                timestamp,
              )}, record_json = ${runJson} WHERE run_id = ${run.runId}
            `;
            yield* sql`
              UPDATE agent_tasks SET status = 'queued', not_before = ${DateTime.formatIso(
                notBefore,
              )}, updated_at = ${DateTime.formatIso(timestamp)}, record_json = ${taskJson}
              WHERE task_id = ${task.taskId}
            `;
            return yield* appendEventTransaction(sql, eventInput);
          }),
        )
        .pipe(
          Effect.mapError((cause) =>
            cause instanceof AgentStateConflictError
              ? cause
              : agentStorageError("execution.retry.transaction", cause),
          ),
        );
      yield* hub.publish({ sequence: event.sequence, threadId: task.threadId });
      return task;
    });

    return AgentExecutionStore.of({
      append,
      bindSession,
      finish,
      markRunning,
      refreshSessionBinding,
      resolveInteraction,
      scheduleRetry,
      suspendForInteraction,
    });
  }),
);
