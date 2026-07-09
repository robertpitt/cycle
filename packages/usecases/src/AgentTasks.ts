import {
  AgentControlInput,
  AgentRuntimeService,
  AgentThreadSendInput,
  type AgentRuntimeServiceShape,
} from "@cycle/agents/runtime";
import type { AgentRuntimeEvent } from "@cycle/agents/events";
import {
  AgentTaskSubmitInput,
  AgentThreadCreateInput,
  type AgentTask as DurableAgentTask,
  type AgentTaskId,
  type AgentTaskSnapshot,
} from "@cycle/agents/models";
import type {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventQuery,
  AgentTaskInput,
  AgentTaskListQuery,
  AgentTaskPage,
  AgentTaskRequest,
  AgentTaskSubscriptionQuery,
  CancelAgentTaskInput,
  RetryAgentTaskInput,
} from "@cycle/contracts/schemas/agents/agent-task-schemas";
import { Context, DateTime, Effect, Layer, Option, Schema, Stream } from "effect";

export class AgentTaskFailure extends Schema.TaggedErrorClass<AgentTaskFailure>()(
  "AgentTaskFailure",
  {
    cause: Schema.optional(Schema.Unknown),
    code: Schema.Literals([
      "invalid_request",
      "not_found",
      "conflict",
      "unsupported_operation",
      "storage_failed",
      "execution_failed",
    ]),
    message: Schema.String,
    retryable: Schema.Boolean,
  },
) {}

export type AgentTaskUsecasesShape = {
  readonly appendTaskInput: (
    taskId: string,
    input: AgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskFailure, AgentRuntimeService>;
  readonly cancelTask: (
    taskId: string,
    input?: CancelAgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskFailure, AgentRuntimeService>;
  readonly createGenericTask: (
    request: AgentTaskRequest,
  ) => Effect.Effect<AgentTask, AgentTaskFailure, AgentRuntimeService>;
  readonly getTask: (
    taskId: string,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskFailure, AgentRuntimeService>;
  readonly listEvents: (
    query: AgentTaskEventQuery,
  ) => Effect.Effect<readonly AgentTaskEvent[], AgentTaskFailure, AgentRuntimeService>;
  readonly listTasks: (
    query?: AgentTaskListQuery,
  ) => Effect.Effect<AgentTaskPage, AgentTaskFailure, AgentRuntimeService>;
  readonly retryTask: (
    taskId: string,
    input?: RetryAgentTaskInput,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskFailure, AgentRuntimeService>;
  readonly subscribe: (
    query: AgentTaskSubscriptionQuery,
  ) => Stream.Stream<AgentTaskEvent, AgentTaskFailure, AgentRuntimeService>;
};

export class AgentTaskUsecases extends Context.Service<AgentTaskUsecases, AgentTaskUsecasesShape>()(
  "@cycle/usecases/AgentTaskUsecases",
) {}

const failure = (cause: unknown): AgentTaskFailure => {
  const tag =
    typeof cause === "object" && cause !== null && "_tag" in cause ? String(cause._tag) : "";
  const code =
    tag === "AgentNotFoundError"
      ? "not_found"
      : tag === "AgentStateConflictError" || tag === "AgentIdempotencyConflictError"
        ? "conflict"
        : tag === "AgentValidationError"
          ? "invalid_request"
          : tag === "AgentStorageError" || tag === "AgentMigrationError"
            ? "storage_failed"
            : "execution_failed";
  return new AgentTaskFailure({
    cause,
    code,
    message:
      cause instanceof Error
        ? cause.message
        : typeof cause === "object" && cause !== null && "message" in cause
          ? String(cause.message)
          : "Agent task operation failed.",
    retryable:
      typeof cause === "object" &&
      cause !== null &&
      "retryable" in cause &&
      cause.retryable === true,
  });
};

const iso = DateTime.formatIso;

const status = (task: DurableAgentTask): AgentTask["status"] => {
  switch (task.status) {
    case "claimed":
    case "preparing":
    case "resuming":
      return "starting";
    case "running":
    case "suspending":
      return "running";
    case "suspended":
      return "waiting_for_input";
    case "cancelling":
      return "cancelling";
    case "completed":
    case "failed":
    case "cancelled":
      return task.status;
    case "queued":
    case "retry-wait":
      return "queued";
  }
};

const object = (value: unknown): Readonly<Record<string, Schema.Json>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Schema.Json>>)
    : {};

const taskProjection = (snapshot: AgentTaskSnapshot): AgentTask => {
  const task = snapshot.task;
  const original = object(task.metadata.originalRequest);
  const originalAuthority = object(original.authority);
  const terminalError = task.terminal?.status === "failed" ? task.terminal.error : undefined;
  const latestAttempt = snapshot.attempts.at(-1);
  const input = original.input ?? task.input.message ?? task.input;
  const instructions =
    typeof original.instructions === "string" ? original.instructions : "Complete the agent task.";
  const requestedBy = typeof original.requestedBy === "string" ? original.requestedBy : "cycle";
  const authorityMode =
    originalAuthority.mode === "workspace-write" || originalAuthority.mode === "full-access"
      ? originalAuthority.mode
      : "read-only";

  return {
    agentId: task.agentId,
    attempt: task.currentAttempt,
    authority: {
      mode: authorityMode,
      ...(Array.isArray(originalAuthority.allowedTools)
        ? {
            allowedTools: originalAuthority.allowedTools.filter(
              (item): item is string => typeof item === "string",
            ),
          }
        : {}),
    },
    ...(task.completedAt === undefined ? {} : { completedAt: iso(task.completedAt) }),
    createdAt: iso(task.createdAt),
    idempotencyKey: task.idempotencyKey,
    ...(terminalError === undefined
      ? {}
      : {
          lastError: {
            code: terminalError.code,
            message: terminalError.message,
            retryable: terminalError.retryable,
          },
        }),
    ...(latestAttempt?.heartbeatAt === undefined
      ? {}
      : { lastHeartbeatAt: iso(latestAttempt.heartbeatAt) }),
    maxAttempts: task.maxAttempts,
    metadata: task.metadata,
    ...(task.model === undefined ? {} : { model: task.model }),
    ...(original.origin === undefined ? {} : { origin: object(original.origin) }),
    providerId: task.providerId,
    request: {
      authority: {
        mode: authorityMode,
        ...(Array.isArray(originalAuthority.allowedTools)
          ? {
              allowedTools: originalAuthority.allowedTools.filter(
                (item): item is string => typeof item === "string",
              ),
            }
          : {}),
      },
      context: object(original.context),
      input: typeof input === "string" ? input : object(input),
      instructions,
      metadata: object(original.metadata ?? task.metadata),
      ...(original.origin === undefined ? {} : { origin: object(original.origin) }),
      requestedBy,
    },
    rootRunId: snapshot.runs[0]?.rootRunId ?? null,
    schemaVersion: 1,
    ...(task.startedAt === undefined ? {} : { startedAt: iso(task.startedAt) }),
    status: status(task),
    taskId: task.taskId,
    updatedAt: iso(task.updatedAt),
    ...(task.authority.workspacePath === undefined
      ? {}
      : {
          workspace: {
            path: task.authority.workspacePath,
            ...(typeof task.metadata.branchName === "string"
              ? { branchName: task.metadata.branchName }
              : {}),
            ...(typeof task.metadata.worktreeId === "string"
              ? { workspaceId: task.metadata.worktreeId }
              : {}),
          },
        }),
  };
};

const eventProjection = (event: AgentRuntimeEvent): AgentTaskEvent => ({
  eventId: event.eventId,
  occurredAt: iso(event.occurredAt),
  payload: event.payload,
  ...(event.runId === undefined ? {} : { runId: event.runId }),
  sequence: event.sequence,
  taskId: event.taskId ?? "",
  type: event.eventType,
  visible: event.visibility === "public",
});

const repositoryId = (request: AgentTaskRequest): string | undefined => {
  const origin = object(request.origin);
  const context = request.context;
  const value = origin.repositoryId ?? context.repositoryId;
  return typeof value === "string" ? value : undefined;
};

const authority = (request: AgentTaskRequest) => {
  const repository = repositoryId(request);
  if (request.authority.mode === "full-access") {
    return {
      allowedOperations: request.authority.allowedTools ?? [],
      mode: "operator-full-access" as const,
      ...(repository === undefined ? {} : { repositoryId: repository }),
    };
  }
  if (request.authority.mode === "workspace-write" && request.workspace !== undefined) {
    return {
      allowedOperations: request.authority.allowedTools ?? [],
      mode: "implementation-worktree" as const,
      ...(repository === undefined ? {} : { repositoryId: repository }),
      workspacePath: request.workspace.path,
    };
  }
  return {
    allowedOperations: request.authority.allowedTools ?? [],
    mode: repository === undefined ? ("conversation-read" as const) : ("repository-read" as const),
    ...(repository === undefined ? {} : { repositoryId: repository }),
  };
};

const requireTask = Effect.fn("AgentTaskUsecases.requireTask")(function* (
  runtime: AgentRuntimeServiceShape,
  taskId: string,
) {
  const snapshot = yield* runtime.getTask(taskId as AgentTaskId);
  return Option.getOrUndefined(snapshot);
});

export const makeAgentTaskUsecases = (): AgentTaskUsecasesShape => ({
  appendTaskInput: (taskId, input) =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntimeService;
      const snapshot = yield* requireTask(runtime, taskId);
      if (snapshot === undefined) return undefined;
      const message = typeof input.input === "string" ? input.input : JSON.stringify(input.input);
      if (
        snapshot.task.status === "completed" ||
        snapshot.task.status === "failed" ||
        snapshot.task.status === "cancelled"
      ) {
        const next = yield* runtime.send(
          new AgentThreadSendInput({ message, threadId: snapshot.task.threadId }),
        );
        return taskProjection(next);
      }
      yield* runtime.steer(
        new AgentControlInput({
          message,
          taskId: snapshot.task.taskId,
          threadId: snapshot.task.threadId,
        }),
      );
      return taskProjection(
        yield* runtime.getTask(snapshot.task.taskId).pipe(Effect.map(Option.getOrThrow)),
      );
    }).pipe(Effect.mapError(failure)),
  cancelTask: (taskId, input) =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntimeService;
      const snapshot = yield* requireTask(runtime, taskId);
      if (snapshot === undefined) return undefined;
      return taskProjection(
        yield* runtime.cancel(
          new AgentControlInput({
            reason: input?.reason,
            taskId: snapshot.task.taskId,
            threadId: snapshot.task.threadId,
          }),
        ),
      );
    }).pipe(Effect.mapError(failure)),
  createGenericTask: (request) =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntimeService;
      const key = request.idempotencyKey ?? `generic:${crypto.randomUUID()}`;
      const repository = repositoryId(request);
      const access = authority(request);
      const thread = yield* runtime.createThread(
        new AgentThreadCreateInput({
          agentId: request.agentId,
          authority: access,
          harnessId: request.providerId,
          idempotencyKey: `${key}:thread`,
          kind: "research",
          metadata: { originalRequest: request },
          providerId: request.providerId,
          ...(request.model === undefined ? {} : { model: request.model }),
          ...(repository === undefined ? {} : { repositoryId: repository }),
          title: request.instructions.slice(0, 120),
          workflowId: "generic-task",
        }),
      );
      const task = yield* runtime.submit(
        new AgentTaskSubmitInput({
          agentId: request.agentId,
          authority: access,
          harnessId: request.providerId,
          idempotencyKey: key,
          input: {
            message:
              typeof request.input === "string" ? request.input : JSON.stringify(request.input),
            instructions: request.instructions,
          },
          kind: "research",
          maxAttempts: request.maxAttempts,
          metadata: { ...request.metadata, originalRequest: request },
          model: request.model,
          priorityLane: "background",
          providerId: request.providerId,
          repositoryId: repository,
          threadId: thread.thread.threadId,
          workflowId: "generic-task",
        }),
      );
      return taskProjection(task);
    }).pipe(Effect.mapError(failure)),
  getTask: (taskId) =>
    AgentRuntimeService.pipe(
      Effect.flatMap((runtime) => runtime.getTask(taskId as AgentTaskId)),
      Effect.map(Option.map(taskProjection)),
      Effect.map(Option.getOrUndefined),
      Effect.mapError(failure),
    ),
  listEvents: (query) =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntimeService;
      const snapshot = yield* requireTask(runtime, query.taskId);
      if (snapshot === undefined) return [];
      return yield* runtime
        .observe({
          afterSequence: query.afterSequence,
          tail: false,
          threadId: snapshot.task.threadId,
        })
        .pipe(
          Stream.filter((event) => event.taskId === query.taskId),
          Stream.take(query.limit ?? 100),
          Stream.map(eventProjection),
          Stream.runCollect,
        );
    }).pipe(Effect.mapError(failure)),
  listTasks: (query = {}) =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntimeService;
      const snapshots = yield* runtime.listTasks().pipe(
        Stream.filter((task) =>
          query.after === undefined ? true : task.enqueueSequence > query.after,
        ),
        Stream.filter((task) =>
          query.status === undefined ? true : status(task) === query.status,
        ),
        Stream.filter((task) =>
          query.repositoryId === undefined ? true : task.repositoryId === query.repositoryId,
        ),
        Stream.filter((task) => {
          const original = object(task.metadata.originalRequest);
          const origin = object(original.origin);
          return query.originKind === undefined ? true : origin.kind === query.originKind;
        }),
        Stream.filter((task) => {
          const original = object(task.metadata.originalRequest);
          const origin = object(original.origin);
          return query.ticketId === undefined ? true : origin.ticketId === query.ticketId;
        }),
        Stream.take((query.limit ?? 100) + 1),
        Stream.mapEffect((task) => runtime.getTask(task.taskId)),
        Stream.map(Option.getOrUndefined),
        Stream.filter((snapshot): snapshot is AgentTaskSnapshot => snapshot !== undefined),
        Stream.runCollect,
      );
      const limit = query.limit ?? 100;
      const page = snapshots.slice(0, limit);
      return {
        entries: page.map(taskProjection),
        ...(snapshots.length > limit
          ? { nextCursor: String(page.at(-1)?.task.enqueueSequence ?? "") }
          : {}),
      };
    }).pipe(Effect.mapError(failure)),
  retryTask: (taskId) =>
    Effect.gen(function* () {
      const runtime = yield* AgentRuntimeService;
      const snapshot = yield* requireTask(runtime, taskId);
      if (snapshot === undefined) return undefined;
      return taskProjection(
        yield* runtime.retry(
          new AgentControlInput({
            taskId: snapshot.task.taskId,
            threadId: snapshot.task.threadId,
          }),
        ),
      );
    }).pipe(Effect.mapError(failure)),
  subscribe: (query) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const runtime = yield* AgentRuntimeService;
        const snapshot = yield* requireTask(runtime, query.taskId);
        if (snapshot === undefined) return Stream.empty;
        return runtime
          .observe({
            afterSequence: query.afterSequence,
            tail: true,
            threadId: snapshot.task.threadId,
          })
          .pipe(
            Stream.filter((event) => event.taskId === query.taskId),
            Stream.map(eventProjection),
            Stream.mapError(failure),
          );
      }).pipe(Effect.mapError(failure)),
    ),
});

export const AgentTaskUsecasesLive = Layer.succeed(
  AgentTaskUsecases,
  AgentTaskUsecases.of(makeAgentTaskUsecases()),
);
