import { Context, Effect, Layer, Option, Schema, Stream } from "effect";
import { AgentCommand, AgentCommandReceipt } from "./AgentCommand.ts";
import { AgentCommandStore } from "./AgentCommandStore.ts";
import type { AgentError } from "./AgentErrors.ts";
import { AgentNotFoundError, AgentStateConflictError } from "./AgentErrors.ts";
import { AgentEventJournal, AgentObserveInput } from "./AgentEventJournal.ts";
import { AgentExecutionStore } from "./AgentExecutionStore.ts";
import type { AgentRuntimeEvent } from "./AgentEvents.ts";
import { AgentCommandId, AgentTaskId, AgentThreadId, type AgentInteractionId } from "./AgentIds.ts";
import { AgentInteractionResponseInput } from "./AgentInteraction.ts";
import { AgentQueueStore, type AgentQueueStoreShape } from "./AgentQueueStore.ts";
import { AgentReadStore } from "./AgentReadStore.ts";
import { AgentScheduler } from "./AgentScheduler.ts";
import { AgentTask, AgentTaskSubmitInput } from "./AgentTask.ts";
import { AgentTaskSnapshot, AgentThreadSnapshot } from "./AgentSnapshots.ts";
import { AgentSupervisor } from "./AgentSupervisor.ts";
import { AgentThread, AgentThreadCreateInput } from "./AgentThread.ts";
import { AgentThreadStore, type AgentThreadStoreShape } from "./AgentThreadStore.ts";
import { makeAgentId, now } from "./internal/persistence.ts";

export class AgentThreadSendInput extends Schema.Class<AgentThreadSendInput>(
  "@cycle/agents/AgentThreadSendInput",
)({
  idempotencyKey: Schema.optional(Schema.String),
  message: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  threadId: AgentThreadId,
}) {}

export class AgentControlInput extends Schema.Class<AgentControlInput>(
  "@cycle/agents/AgentControlInput",
)({
  commandId: Schema.optional(AgentCommandId),
  message: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
  taskId: AgentTaskId,
  threadId: AgentThreadId,
}) {}

export type AgentRuntimeServiceShape = {
  readonly archiveThread: (
    threadId: AgentThreadId,
  ) => Effect.Effect<AgentThreadSnapshot, AgentError>;
  readonly createThread: (
    input: AgentThreadCreateInput,
  ) => Effect.Effect<AgentThreadSnapshot, AgentError>;
  readonly cancel: (input: AgentControlInput) => Effect.Effect<AgentTaskSnapshot, AgentError>;
  readonly getTask: (
    taskId: AgentTaskId,
  ) => Effect.Effect<Option.Option<AgentTaskSnapshot>, AgentError>;
  readonly getThread: (
    threadId: AgentThreadId,
  ) => Effect.Effect<Option.Option<AgentThreadSnapshot>, AgentError>;
  readonly interrupt: (input: AgentControlInput) => Effect.Effect<AgentCommandReceipt, AgentError>;
  readonly listTasks: (
    input?: Parameters<AgentQueueStoreShape["list"]>[0],
  ) => Stream.Stream<AgentTask, AgentError>;
  readonly listThreads: (
    input?: Parameters<AgentThreadStoreShape["list"]>[0],
  ) => Stream.Stream<AgentThread, AgentError>;
  readonly observe: (input: AgentObserveInput) => Stream.Stream<AgentRuntimeEvent, AgentError>;
  readonly respond: (input: {
    readonly interactionId: AgentInteractionId;
    readonly response: AgentInteractionResponseInput;
    readonly taskId: AgentTaskId;
    readonly threadId: AgentThreadId;
  }) => Effect.Effect<AgentCommandReceipt, AgentError>;
  readonly reconcile: () => Stream.Stream<AgentTaskSnapshot, AgentError>;
  readonly retry: (input: AgentControlInput) => Effect.Effect<AgentTaskSnapshot, AgentError>;
  readonly send: (input: AgentThreadSendInput) => Effect.Effect<AgentTaskSnapshot, AgentError>;
  readonly steer: (input: AgentControlInput) => Effect.Effect<AgentCommandReceipt, AgentError>;
  readonly submit: (input: AgentTaskSubmitInput) => Effect.Effect<AgentTaskSnapshot, AgentError>;
};

export class AgentRuntimeService extends Context.Service<
  AgentRuntimeService,
  AgentRuntimeServiceShape
>()("@cycle/agents/AgentRuntimeService") {}

export const AgentRuntimeServiceLive = Layer.effect(
  AgentRuntimeService,
  Effect.gen(function* () {
    const commands = yield* AgentCommandStore;
    const events = yield* AgentEventJournal;
    const executions = yield* AgentExecutionStore;
    const queue = yield* AgentQueueStore;
    const reads = yield* AgentReadStore;
    const scheduler = yield* AgentScheduler;
    const supervisor = yield* AgentSupervisor;
    const threads = yield* AgentThreadStore;

    const requireThreadSnapshot = Effect.fn("AgentRuntime.requireThreadSnapshot")(function* (
      threadId: AgentThreadId,
    ) {
      const snapshot = yield* reads.threadSnapshot(threadId);
      if (Option.isNone(snapshot)) {
        return yield* new AgentNotFoundError({
          code: "agent_thread_not_found",
          entityId: threadId,
          entityType: "thread",
          message: `Agent thread not found: ${threadId}`,
          retryable: false,
        });
      }
      return snapshot.value;
    });

    const requireTaskSnapshot = Effect.fn("AgentRuntime.requireTaskSnapshot")(function* (
      taskId: AgentTaskId,
    ) {
      const snapshot = yield* reads.taskSnapshot(taskId);
      if (Option.isNone(snapshot)) {
        return yield* new AgentNotFoundError({
          code: "agent_task_not_found",
          entityId: taskId,
          entityType: "task",
          message: `Agent task not found: ${taskId}`,
          retryable: false,
        });
      }
      return snapshot.value;
    });

    const submit = Effect.fn("AgentRuntime.submit")(function* (input: AgentTaskSubmitInput) {
      const task = yield* queue.submit(input);
      yield* scheduler.wake;
      return yield* requireTaskSnapshot(task.taskId);
    });

    const recordCommand = Effect.fn("AgentRuntime.recordCommand")(function* (
      input: AgentControlInput,
      commandType: "cancel" | "interrupt" | "steer",
    ) {
      const commandId =
        input.commandId ?? (yield* makeAgentId<typeof AgentCommandId.Type>("agent_command"));
      const createdAt = yield* now;
      return yield* commands.record(
        new AgentCommand({
          commandId,
          commandType,
          createdAt,
          payload: {
            ...(input.message === undefined ? {} : { message: input.message }),
            ...(input.reason === undefined ? {} : { reason: input.reason }),
          },
          status: "queued",
          taskId: input.taskId,
          threadId: input.threadId,
        }),
      );
    });

    return AgentRuntimeService.of({
      archiveThread: (threadId) =>
        threads.archive(threadId).pipe(Effect.flatMap(() => requireThreadSnapshot(threadId))),
      cancel: (input) =>
        Effect.gen(function* () {
          yield* recordCommand(input, "cancel");
          const task = yield* queue.requestCancel(input.taskId, input.reason);
          if (task.status === "cancelling") {
            yield* supervisor
              .interrupt(input.taskId, input.reason)
              .pipe(Effect.catchTag("AgentStateConflictError", () => Effect.void));
          }
          return yield* requireTaskSnapshot(input.taskId);
        }),
      createThread: (input) =>
        threads
          .create(input)
          .pipe(Effect.flatMap((thread) => requireThreadSnapshot(thread.threadId))),
      getTask: reads.taskSnapshot,
      getThread: reads.threadSnapshot,
      interrupt: (input) =>
        Effect.gen(function* () {
          const receipt = yield* recordCommand(input, "interrupt");
          if (receipt.status !== "delivered") {
            yield* supervisor.interrupt(input.taskId, input.reason);
          }
          return yield* commands.deliver(receipt.commandId);
        }),
      listTasks: (input) => Stream.unwrap(queue.list(input).pipe(Effect.map(Stream.fromIterable))),
      listThreads: (input) =>
        Stream.unwrap(threads.list(input).pipe(Effect.map(Stream.fromIterable))),
      observe: events.observe,
      respond: (input) =>
        Effect.gen(function* () {
          const createdAt = yield* now;
          const commandId = input.response.commandId as typeof AgentCommandId.Type;
          const receipt = yield* commands.record(
            new AgentCommand({
              commandId,
              commandType: "respond",
              createdAt,
              payload: { interactionId: input.interactionId },
              status: "queued",
              taskId: input.taskId,
              threadId: input.threadId,
            }),
          );
          if (receipt.status !== "delivered") {
            const interaction = yield* executions.resolveInteraction({
              interactionId: input.interactionId,
              responderId: input.response.responderId,
              response: input.response.response,
            });
            yield* supervisor.respond(
              input.taskId,
              new AgentInteractionResponseInput({
                ...input.response,
                providerRequestId: interaction.providerRequestId,
              }),
            );
          }
          return yield* commands.deliver(commandId);
        }),
      reconcile: () =>
        Stream.unwrap(
          queue.reconcile.pipe(
            Effect.flatMap((tasks) =>
              Effect.forEach(tasks, (task) => requireTaskSnapshot(task.taskId)),
            ),
            Effect.map(Stream.fromIterable),
          ),
        ),
      retry: (input) =>
        Effect.gen(function* () {
          const current = yield* requireTaskSnapshot(input.taskId);
          if (current.task.status !== "failed" && current.task.status !== "cancelled") {
            return yield* new AgentStateConflictError({
              actualState: current.task.status,
              code: "agent_task_not_retryable",
              entityId: input.taskId,
              expectedState: "failed-or-cancelled",
              message: "Only failed or cancelled tasks may be retried.",
              retryable: false,
            });
          }
          const generation =
            input.commandId ?? (yield* makeAgentId<typeof AgentCommandId.Type>("agent_command"));
          return yield* submit(
            new AgentTaskSubmitInput({
              agentId: current.task.agentId,
              authority: current.task.authority,
              harnessId: current.task.harnessId,
              idempotencyKey: `retry:${current.task.taskId}:${generation}`,
              input: current.task.input,
              kind: current.task.kind,
              maxAttempts: current.task.maxAttempts,
              metadata: {
                ...current.task.metadata,
                retryOfTaskId: current.task.taskId,
              },
              model: current.task.model,
              parentRunId: current.task.parentRunId,
              priorityLane: current.task.priorityLane,
              providerId: current.task.providerId,
              repositoryId: current.task.repositoryId,
              threadId: current.task.threadId,
              workflowId: current.task.workflowId,
            }),
          );
        }),
      send: (input) =>
        Effect.gen(function* () {
          const thread = yield* requireThreadSnapshot(input.threadId);
          return yield* submit(
            new AgentTaskSubmitInput({
              agentId: thread.thread.agentId,
              authority: thread.thread.authority,
              harnessId: thread.thread.harnessId,
              idempotencyKey:
                input.idempotencyKey ??
                (yield* makeAgentId<string>("agent_interactive_idempotency")),
              input: { message: input.message },
              kind: "interactive-turn",
              metadata: input.metadata ?? {},
              model: thread.thread.model,
              priorityLane: "interactive",
              providerId: thread.thread.providerId,
              repositoryId: thread.thread.repositoryId,
              threadId: input.threadId,
              workflowId: thread.thread.workflowId ?? "interactive-chat",
            }),
          );
        }),
      steer: (input) =>
        Effect.gen(function* () {
          const receipt = yield* recordCommand(input, "steer");
          if (receipt.status !== "delivered")
            yield* supervisor.steer(input.taskId, input.message ?? "");
          return yield* commands.deliver(receipt.commandId);
        }),
      submit,
    });
  }),
);
