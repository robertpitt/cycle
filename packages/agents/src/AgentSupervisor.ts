import { Context, Effect, Layer, Option, Ref, Stream } from "effect";
import type { AgentInteractionResponseInput } from "./AgentInteraction.ts";
import { AgentConfig } from "./AgentConfig.ts";
import { AgentHarnessError, AgentStateConflictError, AgentStorageError } from "./AgentErrors.ts";
import {
  AgentHarnessBinding,
  type AgentHarnessEvent,
  type AgentHarnessSession,
} from "./AgentHarness.ts";
import { AgentHarnessCatalog } from "./AgentHarnessCatalog.ts";
import {
  AgentExecutionStore,
  type AgentExecutionLease,
  type AgentExecutionStoreShape,
} from "./AgentExecutionStore.ts";
import type { AgentTaskId } from "./AgentIds.ts";
import { AgentQueueStore } from "./AgentQueueStore.ts";
import { AgentReadStore } from "./AgentReadStore.ts";
import { AgentWorkflowRegistry } from "./AgentWorkflow.ts";

type ActiveExecution = {
  readonly lease: AgentExecutionLease;
  readonly session: AgentHarnessSession;
};

export type AgentSupervisorShape = {
  readonly interrupt: (
    taskId: AgentTaskId,
    reason?: string,
  ) => Effect.Effect<void, AgentHarnessError | AgentStateConflictError>;
  readonly respond: (
    taskId: AgentTaskId,
    input: AgentInteractionResponseInput,
  ) => Effect.Effect<void, AgentHarnessError | AgentStateConflictError>;
  readonly run: (
    lease: AgentExecutionLease,
  ) => Effect.Effect<void, AgentHarnessError | AgentStorageError | AgentStateConflictError>;
  readonly steer: (
    taskId: AgentTaskId,
    message: string,
  ) => Effect.Effect<void, AgentHarnessError | AgentStateConflictError>;
};

export class AgentSupervisor extends Context.Service<AgentSupervisor, AgentSupervisorShape>()(
  "@cycle/agents/AgentSupervisor",
) {}

const missingActive = (taskId: AgentTaskId) =>
  new AgentStateConflictError({
    actualState: "not-running",
    code: "agent_task_not_live",
    entityId: taskId,
    expectedState: "running",
    message: "The task has no live provider session in this process.",
    retryable: true,
  });

const canonicalType = (
  event: AgentHarnessEvent,
): Parameters<AgentExecutionStoreShape["append"]>[1]["eventType"] => {
  switch (event.eventType) {
    case "turn-started":
      return "turn.started";
    case "text-delta":
      return "message.delta";
    case "reasoning-delta":
      return "reasoning.delta";
    case "plan-updated":
    case "diff-updated":
    case "warning":
      return "warning.reported";
    case "tool-started":
      return "tool.started";
    case "tool-progress":
      return "tool.progress";
    case "tool-completed":
      return "tool.completed";
    case "approval-requested":
      return "approval.requested";
    case "approval-resolved":
      return "approval.resolved";
    case "user-input-requested":
      return "user-input.requested";
    case "user-input-resolved":
      return "user-input.resolved";
    case "artifact":
      return "artifact.recorded";
    case "usage":
      return "usage.reported";
    case "completed":
      return "message.completed";
    case "failed":
      return "message.failed";
    case "cancelled":
      return "attempt.cancelled";
  }
};

export const AgentSupervisorLive = Layer.effect(
  AgentSupervisor,
  Effect.gen(function* () {
    const catalog = yield* AgentHarnessCatalog;
    const config = yield* AgentConfig;
    const executions = yield* AgentExecutionStore;
    const queue = yield* AgentQueueStore;
    const reads = yield* AgentReadStore;
    const workflows = yield* AgentWorkflowRegistry;
    const active = yield* Ref.make(new Map<AgentTaskId, ActiveExecution>());

    yield* Effect.addFinalizer(() =>
      Ref.get(active).pipe(
        Effect.flatMap((entries) =>
          Effect.forEach(entries.values(), (execution) => execution.session.interrupt("shutdown"), {
            concurrency: "unbounded",
            discard: true,
          }),
        ),
        Effect.catch(() => Effect.void),
      ),
    );

    const withActive = <A, E>(
      taskId: AgentTaskId,
      use: (execution: ActiveExecution) => Effect.Effect<A, E>,
    ): Effect.Effect<A, E | AgentStateConflictError> =>
      Effect.gen(function* () {
        const entries = yield* Ref.get(active);
        const execution = entries.get(taskId);
        if (execution === undefined) return yield* missingActive(taskId);
        return yield* use(execution);
      });

    const notifyWorkflowFailed = Effect.fn("AgentSupervisor.notifyWorkflowFailed")(function* (
      task: AgentExecutionLease["task"],
      error: { readonly code: string; readonly message: string; readonly retryable: boolean },
    ) {
      const workflow = yield* workflows.get(task.workflowId);
      if (workflow.failed !== undefined) yield* workflow.failed({ error, task });
    });

    const run = Effect.fn("AgentSupervisor.run")(function* (lease: AgentExecutionLease) {
      const harness = yield* catalog.get(lease.task.harnessId);
      const exit = yield* Effect.scoped(
        Effect.gen(function* () {
          const workflow = yield* workflows.get(lease.task.workflowId);
          if (workflow.prepare !== undefined) yield* workflow.prepare({ task: lease.task });
          const thread = yield* reads.threadSnapshot(lease.task.threadId);
          const previousSession = yield* reads.latestSessionBinding({
            harnessId: lease.task.harnessId,
            threadId: lease.task.threadId,
          });
          const openInput = {
            ...lease,
            messages: Option.isSome(thread) ? thread.value.messages : [],
          };
          const session = yield* Option.match(previousSession, {
            onNone: () => harness.open(openInput),
            onSome: (previous) =>
              harness.reattach({
                ...openInput,
                binding: new AgentHarnessBinding({
                  adapterVersion: previous.adapterVersion,
                  capabilities: harness.capabilities,
                  ...(previous.providerSessionId === undefined
                    ? {}
                    : { providerSessionId: previous.providerSessionId }),
                  ...(previous.providerThreadId === undefined
                    ? {}
                    : { providerThreadId: previous.providerThreadId }),
                  ...(previous.replayCursor === undefined
                    ? {}
                    : { replayCursor: previous.replayCursor }),
                }),
              }),
          });
          const running = yield* executions.markRunning(lease);
          const durableSession = yield* executions.bindSession(running, session.binding);
          yield* Effect.addFinalizer(() =>
            session.refreshBinding.pipe(
              Effect.flatMap((binding) =>
                executions.refreshSessionBinding(running, durableSession.sessionId, binding),
              ),
              Effect.catch(() => Effect.void),
            ),
          );
          yield* Ref.update(active, (entries) =>
            new Map(entries).set(lease.task.taskId, { lease: running, session }),
          );
          yield* Effect.addFinalizer(() =>
            Ref.update(active, (entries) => {
              const updated = new Map(entries);
              updated.delete(lease.task.taskId);
              return updated;
            }),
          );
          const heartbeat = Effect.gen(function* () {
            yield* Effect.sleep(config.heartbeatMs);
            yield* queue.heartbeat({
              attemptId: running.attempt.attemptId,
              fencingToken: running.attempt.fencingToken,
            });
          }).pipe(
            Effect.forever,
            Effect.catch(() =>
              session.interrupt("lease-lost").pipe(Effect.catch(() => Effect.void)),
            ),
          );
          yield* heartbeat.pipe(Effect.forkScoped);

          const terminal = yield* Ref.make(false);
          yield* session.events.pipe(
            Stream.runForEach((event) =>
              Effect.gen(function* () {
                if (yield* Ref.get(terminal)) return;
                if (event.eventType === "completed") {
                  yield* executions.append(running, {
                    eventType: "message.completed",
                    payload: event.payload,
                    retention: "permanent",
                    visibility: "public",
                  });
                  const summary =
                    typeof event.payload.summary === "string"
                      ? event.payload.summary
                      : "Agent task completed.";
                  const workflow = yield* workflows.get(running.task.workflowId);
                  yield* executions.append(running, {
                    eventType: "workflow.started",
                    payload: { workflowId: running.task.workflowId },
                    retention: "permanent",
                    visibility: "internal",
                  });
                  const completion = yield* workflow
                    .complete({ run: running.run, summary, task: running.task })
                    .pipe(Effect.result);
                  if (completion._tag === "Failure") {
                    yield* notifyWorkflowFailed(running.task, {
                      code: completion.failure.code,
                      message: completion.failure.message,
                      retryable: completion.failure.retryable,
                    }).pipe(Effect.catch(() => Effect.void));
                    yield* executions.append(running, {
                      eventType: "workflow.failed",
                      payload: {
                        message: completion.failure.message,
                        workflowId: running.task.workflowId,
                      },
                      retention: "permanent",
                      visibility: "public",
                    });
                    yield* executions.finish(running, {
                      error: {
                        code: completion.failure.code,
                        message: completion.failure.message,
                        retryable: completion.failure.retryable,
                      },
                      status: "failed",
                    });
                  } else {
                    yield* executions.append(running, {
                      eventType: "workflow.completed",
                      payload: { workflowId: running.task.workflowId },
                      retention: "permanent",
                      visibility: "internal",
                    });
                    yield* executions.finish(running, {
                      output: event.payload,
                      status: "completed",
                      summary,
                    });
                  }
                  yield* Ref.set(terminal, true);
                  return;
                }
                if (event.eventType === "failed") {
                  const error = {
                    code:
                      typeof event.payload.code === "string"
                        ? event.payload.code
                        : "provider_failed",
                    message:
                      typeof event.payload.message === "string"
                        ? event.payload.message
                        : "Provider execution failed.",
                    retryable: event.payload.retryable === true,
                  };
                  if (error.retryable && running.task.currentAttempt < running.task.maxAttempts) {
                    yield* executions.scheduleRetry(running, error);
                  } else {
                    yield* notifyWorkflowFailed(running.task, error).pipe(
                      Effect.catch(() => Effect.void),
                    );
                    yield* executions.finish(running, { error, status: "failed" });
                  }
                  yield* Ref.set(terminal, true);
                  return;
                }
                if (event.eventType === "cancelled") {
                  yield* executions.finish(running, {
                    reason: "Provider execution was cancelled.",
                    status: "cancelled",
                  });
                  yield* Ref.set(terminal, true);
                  return;
                }
                if (
                  event.eventType === "approval-requested" ||
                  event.eventType === "user-input-requested"
                ) {
                  const providerRequestId =
                    typeof event.payload.requestId === "string"
                      ? event.payload.requestId
                      : `${running.attempt.attemptId}:${event.eventType}`;
                  const prompt =
                    typeof event.payload.prompt === "string"
                      ? event.payload.prompt
                      : event.eventType === "approval-requested"
                        ? "The agent requires approval to continue."
                        : "The agent requires additional input to continue.";
                  yield* executions.suspendForInteraction({
                    fields: event.payload,
                    lease: running,
                    prompt,
                    providerRequestId,
                    type: event.eventType === "approval-requested" ? "approval" : "user-input",
                  });
                  return;
                }
                yield* executions.append(running, {
                  eventType: canonicalType(event),
                  payload: event.payload,
                  retention:
                    event.eventType === "text-delta" || event.eventType === "reasoning-delta"
                      ? "delta-24h"
                      : "permanent",
                  visibility: event.eventType === "reasoning-delta" ? "internal" : "public",
                });
              }),
            ),
          );
          if (!(yield* Ref.get(terminal))) {
            const error = {
              code: "provider_stream_ended",
              message: "The provider stream ended without a terminal event.",
              retryable: true,
            };
            yield* notifyWorkflowFailed(running.task, error).pipe(Effect.catch(() => Effect.void));
            yield* executions.finish(running, {
              error,
              status: "failed",
            });
          }
        }),
      ).pipe(Effect.exit);

      if (exit._tag === "Failure") {
        const error = {
          code: "provider_execution_failed",
          message: "The provider execution failed before a terminal result was persisted.",
          retryable: true,
        };
        if (lease.task.currentAttempt >= lease.task.maxAttempts) {
          yield* notifyWorkflowFailed(lease.task, error).pipe(Effect.catch(() => Effect.void));
        }
        const current = yield* (
          lease.task.currentAttempt < lease.task.maxAttempts
            ? executions.scheduleRetry(lease, error)
            : executions.finish(lease, { error, status: "failed" })
        ).pipe(Effect.option);
        if (Option.isNone(current)) {
          return yield* new AgentStateConflictError({
            code: "agent_execution_terminal_conflict",
            entityId: lease.task.taskId,
            message: "The failed provider execution could not be persisted.",
            retryable: true,
          });
        }
      }
    });

    return AgentSupervisor.of({
      interrupt: (taskId, reason) =>
        withActive(taskId, (execution) => execution.session.interrupt(reason)),
      respond: (taskId, input) =>
        withActive(taskId, (execution) => execution.session.respond(input)),
      run,
      steer: (taskId, message) =>
        withActive(taskId, (execution) => execution.session.steer(message)),
    });
  }),
);
