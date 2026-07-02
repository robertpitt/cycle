import { Context, Effect, Layer, Queue, Stream } from "effect";
import type {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventQuery,
  AgentTaskInput,
  AgentTaskListQuery,
  AgentTaskPage,
  AgentTaskRequest,
  AgentTaskRequestSummary,
  AgentTaskStatus,
  AgentTaskSubscriptionQuery,
  CancelAgentTaskInput,
  RetryAgentTaskInput,
} from "./schemas.ts";
import { AgentTaskFailure, type AgentTaskServiceError } from "./errors.ts";
import { AgentTaskStore, type AgentTaskStoreShape } from "./store.ts";

export type AgentTaskReconcileResult = {
  readonly queued: readonly string[];
  readonly waitingForInput: readonly string[];
  readonly recoverable: readonly string[];
  readonly failed: readonly string[];
};

export type AgentTaskSchedulerHandle = {
  readonly close: () => Effect.Effect<void, AgentTaskServiceError>;
};

export type AgentTaskServiceShape = {
  readonly appendTaskInput: (
    taskId: string,
    input: AgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskServiceError>;
  readonly cancelTask: (
    taskId: string,
    input?: CancelAgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskServiceError>;
  readonly createTask: (request: AgentTaskRequest) => Effect.Effect<AgentTask, AgentTaskServiceError>;
  readonly getTask: (taskId: string) => Effect.Effect<AgentTask | undefined, AgentTaskServiceError>;
  readonly listEvents: (
    query: AgentTaskEventQuery,
  ) => Effect.Effect<readonly AgentTaskEvent[], AgentTaskServiceError>;
  readonly listTasks: (query?: AgentTaskListQuery) => Effect.Effect<AgentTaskPage, AgentTaskServiceError>;
  readonly reconcile: () => Effect.Effect<AgentTaskReconcileResult, AgentTaskServiceError>;
  readonly retryTask: (
    taskId: string,
    input?: RetryAgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskServiceError>;
  readonly startScheduler: () => Effect.Effect<AgentTaskSchedulerHandle, AgentTaskServiceError>;
  readonly subscribe: (
    query: AgentTaskSubscriptionQuery,
  ) => Stream.Stream<AgentTaskEvent, AgentTaskServiceError>;
};

export class AgentTaskService extends Context.Service<AgentTaskService, AgentTaskServiceShape>()(
  "@cycle/agents/AgentTaskService",
) {}

export type AgentTaskServiceOptions = {
  readonly makeId?: (prefix: string) => string;
  readonly now?: () => Date;
};

type Subscriber = {
  readonly offer: (event: AgentTaskEvent) => Effect.Effect<void>;
  readonly query: AgentTaskSubscriptionQuery;
};

const terminalStatuses = new Set<AgentTaskStatus>(["cancelled", "completed", "failed"]);

export const makeAgentTaskService = (
  store: AgentTaskStoreShape,
  options: AgentTaskServiceOptions = {},
): AgentTaskServiceShape => {
  const makeId = options.makeId ?? defaultId;
  const now = options.now ?? (() => new Date());
  const subscribers = new Set<Subscriber>();

  const emit = (
    event: Omit<AgentTaskEvent, "eventId" | "occurredAt" | "sequence"> & {
      readonly eventId?: string;
      readonly occurredAt?: string;
    },
  ): Effect.Effect<AgentTaskEvent, AgentTaskServiceError> =>
    store
      .appendEvent({
        ...event,
        eventId: event.eventId ?? makeId("task_event"),
        occurredAt: event.occurredAt ?? now().toISOString(),
      })
      .pipe(
        Effect.tap((appended) =>
          Effect.forEach([...subscribers], (subscriber) =>
            eventMatchesSubscription(appended, subscriber.query)
              ? subscriber.offer(appended)
              : Effect.void,
          ),
        ),
      );

  const updateTask = (
    task: AgentTask,
    patch: Partial<AgentTask> & { readonly status?: AgentTaskStatus },
  ): Effect.Effect<AgentTask, AgentTaskServiceError> => {
    const updated: AgentTask = {
      ...task,
      ...patch,
      updatedAt: now().toISOString(),
    };
    return store.upsertTask(updated).pipe(Effect.as(updated));
  };

  return {
    appendTaskInput: (taskId, input) =>
      store.getTask(taskId).pipe(
        Effect.flatMap((task) => {
          if (task === undefined || terminalStatuses.has(task.status)) return Effect.succeed(task);
          return emit({
            payload: {
              input: input.input,
              requestedBy: input.requestedBy ?? "user",
            },
            taskId,
            type: "task.input_appended",
            visible: true,
          }).pipe(Effect.as(task));
        }),
      ),
    cancelTask: (taskId, input = {}) =>
      store.getTask(taskId).pipe(
        Effect.flatMap((task) => {
          if (task === undefined || terminalStatuses.has(task.status)) return Effect.succeed(task);
          return updateTask(task, { status: "cancelling" }).pipe(
            Effect.tap(() =>
              emit({
                payload: {
                  reason: input.reason ?? null,
                  requestedBy: input.requestedBy ?? "user",
                },
                taskId,
                type: "task.cancelling",
                visible: true,
              }),
            ),
            Effect.flatMap((cancelling) =>
              updateTask(cancelling, {
                completedAt: now().toISOString(),
                status: "cancelled",
              }),
            ),
            Effect.tap(() =>
              emit({
                payload: {
                  reason: input.reason ?? "Task cancellation requested.",
                  requestedBy: input.requestedBy ?? "user",
                },
                taskId,
                type: "task.cancelled",
                visible: true,
              }),
            ),
          );
        }),
      ),
    createTask: (request) =>
      Effect.gen(function* () {
        if (request.idempotencyKey !== undefined) {
          const existing = yield* store.findActiveTaskByIdempotencyKey(request.idempotencyKey);
          if (existing !== undefined) return existing;
        }

        const timestamp = now().toISOString();
        const metadata = request.metadata ?? {};
        const requestSummary: AgentTaskRequestSummary = {
          authority: request.authority,
          context: request.context,
          input: request.input,
          instructions: request.instructions,
          metadata,
          ...(request.origin === undefined ? {} : { origin: request.origin }),
          requestedBy: request.requestedBy,
          ...(request.responseFormat === undefined ? {} : { responseFormat: request.responseFormat }),
          ...(request.tools === undefined ? {} : { tools: request.tools }),
        };
        const task: AgentTask = {
          agentId: request.agentId,
          attempt: 0,
          authority: request.authority,
          createdAt: timestamp,
          ...(request.idempotencyKey === undefined
            ? {}
            : { idempotencyKey: request.idempotencyKey }),
          maxAttempts: request.maxAttempts ?? 1,
          metadata,
          ...(request.model === undefined ? {} : { model: request.model }),
          ...(request.origin === undefined ? {} : { origin: request.origin }),
          providerId: request.providerId,
          request: requestSummary,
          rootRunId: null,
          schemaVersion: 1,
          status: "queued",
          taskId: makeId("task"),
          updatedAt: timestamp,
          ...(request.workspace === undefined ? {} : { workspace: request.workspace }),
        };
        yield* store.upsertTask(task);
        yield* emit({
          payload: {
            idempotencyKey: request.idempotencyKey ?? null,
            requestedBy: request.requestedBy,
          },
          taskId: task.taskId,
          type: "task.queued",
          visible: true,
        });
        return task;
      }),
    getTask: (taskId) => store.getTask(taskId),
    listEvents: (query) => store.listEvents(query),
    listTasks: (query) =>
      store.listTasks(query).pipe(
        Effect.map((entries) => ({
          entries: [...entries],
        })),
      ),
    reconcile: () =>
      store.listTasks().pipe(
        Effect.map((tasks) => ({
          failed: [],
          queued: tasks.filter((task) => task.status === "queued").map((task) => task.taskId),
          recoverable: tasks
            .filter((task) => task.status === "running" || task.status === "starting")
            .map((task) => task.taskId),
          waitingForInput: tasks
            .filter((task) => task.status === "waiting_for_input")
            .map((task) => task.taskId),
        })),
      ),
    retryTask: (taskId, input = {}) =>
      store.getTask(taskId).pipe(
        Effect.flatMap((task) => {
          if (task === undefined || task.status !== "failed") return Effect.succeed(task);
          return updateTask(task, {
            attempt: task.attempt + 1,
            completedAt: undefined,
            lastError: undefined,
            status: "queued",
          }).pipe(
            Effect.tap(() =>
              emit({
                payload: {
                  requestedBy: input.requestedBy ?? "user",
                },
                taskId,
                type: "task.queued",
                visible: true,
              }),
            ),
          );
        }),
      ),
    startScheduler: () =>
      Effect.succeed({
        close: () => Effect.void,
      }),
    subscribe: (query) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const replayed = yield* store.listEvents({
            afterSequence: query.afterSequence,
            taskId: query.taskId,
          });
          const queue = yield* Queue.unbounded<AgentTaskEvent>();
          const subscriber: Subscriber = {
            offer: (event) => Queue.offer(queue, event),
            query: {
              afterSequence: replayed.at(-1)?.sequence ?? query.afterSequence,
              taskId: query.taskId,
            },
          };
          subscribers.add(subscriber);
          return Stream.fromIterable(replayed).pipe(
            Stream.concat(Stream.fromQueue(queue)),
            Stream.ensuring(
              Effect.sync(() => {
                subscribers.delete(subscriber);
              }),
            ),
          );
        }),
      ),
  };
};

export const AgentTaskServiceLive = (
  options: AgentTaskServiceOptions = {},
): Layer.Layer<AgentTaskService, never, AgentTaskStore> =>
  Layer.effect(
    AgentTaskService,
    Effect.map(AgentTaskStore, (store) => AgentTaskService.of(makeAgentTaskService(store, options))),
  );

export const agentTaskNotFound = (taskId: string): AgentTaskFailure =>
  new AgentTaskFailure({
    code: "not_found",
    message: `Agent task '${taskId}' was not found.`,
    retryable: false,
  });

const eventMatchesSubscription = (
  event: AgentTaskEvent,
  query: AgentTaskSubscriptionQuery,
): boolean =>
  event.taskId === query.taskId &&
  (query.afterSequence === undefined || event.sequence > query.afterSequence);

const defaultId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
