import { Effect, Layer } from "effect";
import type {
  AgentTask,
  AgentTaskEvent,
  AgentTaskStatus,
} from "@cycle/contracts/schemas/agents/agent-task-schemas";
import { agentTaskStorageFailure, type AgentTaskServiceError } from "../AgentTaskErrors.ts";
import { AgentTaskStore, type AgentTaskStoreShape } from "../AgentTaskStore.ts";

const activeStatuses = new Set<AgentTaskStatus>([
  "cancelling",
  "queued",
  "running",
  "starting",
  "waiting_for_input",
]);

export const makeInMemoryAgentTaskStore = (): AgentTaskStoreShape => {
  const tasks = new Map<string, AgentTask>();
  const events = new Map<string, AgentTaskEvent[]>();
  let sequence = 0;

  const effect = <A>(body: () => A): Effect.Effect<A, AgentTaskServiceError> =>
    Effect.try({
      try: body,
      catch: agentTaskStorageFailure,
    });

  return {
    appendEvent: (input) =>
      effect(() => {
        sequence += 1;
        const event: AgentTaskEvent = {
          ...clone(input),
          sequence,
        };
        const current = events.get(event.taskId) ?? [];
        events.set(event.taskId, [...current, clone(event)]);
        return clone(event);
      }),
    close: Effect.void,
    findActiveTaskByIdempotencyKey: (idempotencyKey) =>
      effect(() =>
        clone(
          [...tasks.values()].find(
            (task) => task.idempotencyKey === idempotencyKey && activeStatuses.has(task.status),
          ),
        ),
      ),
    getTask: (taskId) => effect(() => clone(tasks.get(taskId))),
    listEvents: (query) =>
      effect(() =>
        (events.get(query.taskId) ?? [])
          .filter(
            (event) => query.afterSequence === undefined || event.sequence > query.afterSequence,
          )
          .slice(0, query.limit)
          .map((event) => clone(event)),
      ),
    listTasks: (query = {}) =>
      effect(() =>
        [...tasks.values()]
          .filter((task) => query.status === undefined || task.status === query.status)
          .filter((task) => {
            if (query.originKind === undefined) return true;
            return (
              typeof task.origin === "object" &&
              task.origin !== null &&
              !Array.isArray(task.origin) &&
              task.origin.kind === query.originKind
            );
          })
          .filter(
            (task) =>
              originField(task, "repositoryId") ===
              (query.repositoryId ?? originField(task, "repositoryId")),
          )
          .filter(
            (task) =>
              originField(task, "ticketId") === (query.ticketId ?? originField(task, "ticketId")),
          )
          .slice(0, query.limit)
          .map((task) => clone(task)),
      ),
    upsertTask: (task) =>
      effect(() => {
        tasks.set(task.taskId, clone(task));
      }),
  };
};

export const AgentTaskStoreInMemory = Layer.succeed(
  AgentTaskStore,
  AgentTaskStore.of(makeInMemoryAgentTaskStore()),
);

function clone<T>(value: T): T;
function clone<T>(value: T | undefined): T | undefined;
function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as T);
}

const originField = (task: AgentTask, field: string): string | undefined => {
  if (task.origin === undefined) return undefined;
  const value = task.origin[field];
  return typeof value === "string" ? value : undefined;
};
