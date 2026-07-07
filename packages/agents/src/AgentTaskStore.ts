import { Context, Effect } from "effect";
import type {
  AgentTask,
  AgentTaskEvent,
  AgentTaskEventQuery,
  AgentTaskListQuery,
} from "./AgentTaskSchemas.ts";
import type { AgentTaskServiceError } from "./AgentTaskErrors.ts";

export type AgentTaskEventInput = Omit<AgentTaskEvent, "sequence">;

export type AgentTaskStoreShape = {
  readonly appendEvent: (
    event: AgentTaskEventInput,
  ) => Effect.Effect<AgentTaskEvent, AgentTaskServiceError>;
  readonly close: () => Effect.Effect<void, AgentTaskServiceError>;
  readonly findActiveTaskByIdempotencyKey: (
    idempotencyKey: string,
  ) => Effect.Effect<AgentTask | undefined, AgentTaskServiceError>;
  readonly getTask: (taskId: string) => Effect.Effect<AgentTask | undefined, AgentTaskServiceError>;
  readonly listEvents: (
    query: AgentTaskEventQuery,
  ) => Effect.Effect<readonly AgentTaskEvent[], AgentTaskServiceError>;
  readonly listTasks: (
    query?: AgentTaskListQuery,
  ) => Effect.Effect<readonly AgentTask[], AgentTaskServiceError>;
  readonly upsertTask: (task: AgentTask) => Effect.Effect<void, AgentTaskServiceError>;
};

export class AgentTaskStore extends Context.Service<AgentTaskStore, AgentTaskStoreShape>()(
  "@cycle/agents/AgentTaskStore",
) {}
