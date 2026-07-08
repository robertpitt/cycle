import { openSqliteSync, type SqliteDatabaseLike } from "@cycle/sqlite/sync";
import { Effect, Layer } from "effect";
import type {
  AgentTask,
  AgentTaskEvent,
  AgentTaskStatus,
} from "@cycle/contracts/schemas/agents/agent-task-schemas";
import { agentTaskStorageFailure, type AgentTaskServiceError } from "./AgentTaskErrors.ts";
import { AgentTaskStore, type AgentTaskStoreShape } from "./AgentTaskStore.ts";

export const agentTaskSchemaSql = `
CREATE TABLE IF NOT EXISTS agent_tasks (
  task_id TEXT PRIMARY KEY,
  idempotency_key TEXT,
  origin_kind TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status
  ON agent_tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_idempotency
  ON agent_tasks(idempotency_key, status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_origin_kind
  ON agent_tasks(origin_kind, updated_at);

CREATE TABLE IF NOT EXISTS agent_task_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_task_events_task
  ON agent_task_events(task_id, sequence);
`;

const activeStatuses = new Set<AgentTaskStatus>([
  "cancelling",
  "queued",
  "running",
  "starting",
  "waiting_for_input",
]);

export const makeNodeSqliteAgentTaskStore = (path: string): AgentTaskStoreShape => {
  return makeSqliteAgentTaskStore(openSqliteSync(path));
};

export const AgentTaskStoreSqlite = (path: string): Layer.Layer<AgentTaskStore> =>
  Layer.succeed(AgentTaskStore, AgentTaskStore.of(makeNodeSqliteAgentTaskStore(path)));

export const makeSqliteAgentTaskStore = (db: SqliteDatabaseLike): AgentTaskStoreShape => {
  db.exec(agentTaskSchemaSql);

  const effect = <A>(body: () => A): Effect.Effect<A, AgentTaskServiceError> =>
    Effect.try({
      try: body,
      catch: agentTaskStorageFailure,
    });

  return {
    appendEvent: (input) =>
      effect(() => {
        const existing = db
          .prepare("SELECT record_json FROM agent_task_events WHERE event_id = ?")
          .get(input.eventId) as RecordRow | undefined;
        if (existing !== undefined) return parseJson<AgentTaskEvent>(existing.record_json);

        const result = db
          .prepare(
            `INSERT INTO agent_task_events(
               event_id, task_id, event_type, occurred_at, record_json
             ) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            input.eventId,
            input.taskId,
            input.type,
            input.occurredAt,
            JSON.stringify({ ...input, sequence: 0 }),
          ) as { readonly lastInsertRowid?: bigint | number };
        const sequence = Number(result.lastInsertRowid ?? 0);
        const event: AgentTaskEvent = { ...input, sequence };
        db.prepare("UPDATE agent_task_events SET record_json = ? WHERE sequence = ?").run(
          JSON.stringify(event),
          sequence,
        );
        return clone(event);
      }),
    close: effect(() => {
      db.close?.();
    }),
    findActiveTaskByIdempotencyKey: (idempotencyKey) =>
      effect(() => {
        const rows = db
          .prepare("SELECT record_json FROM agent_tasks WHERE idempotency_key = ?")
          .all(idempotencyKey) as readonly RecordRow[];
        return clone(
          rows
            .map((row) => parseJson<AgentTask>(row.record_json))
            .find((task) => activeStatuses.has(task.status)),
        );
      }),
    getTask: (taskId) =>
      effect(() => {
        const row = db
          .prepare("SELECT record_json FROM agent_tasks WHERE task_id = ?")
          .get(taskId) as RecordRow | undefined;
        return row === undefined ? undefined : clone(parseJson<AgentTask>(row.record_json));
      }),
    listEvents: (query) =>
      effect(() => {
        const rows = db
          .prepare(
            `SELECT record_json
             FROM agent_task_events
             WHERE task_id = ? AND sequence > ?
             ORDER BY sequence ASC`,
          )
          .all(query.taskId, query.afterSequence ?? 0) as readonly RecordRow[];
        return rows
          .map((row) => parseJson<AgentTaskEvent>(row.record_json))
          .slice(0, query.limit)
          .map((event) => clone(event));
      }),
    listTasks: (query = {}) =>
      effect(() => {
        const rows = db
          .prepare("SELECT record_json FROM agent_tasks ORDER BY created_at DESC")
          .all() as readonly RecordRow[];
        return rows
          .map((row) => parseJson<AgentTask>(row.record_json))
          .filter((task) => query.status === undefined || task.status === query.status)
          .filter((task) => {
            if (query.originKind === undefined) return true;
            return originKind(task) === query.originKind;
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
          .map((task) => clone(task));
      }),
    upsertTask: (task) =>
      effect(() => {
        db.prepare(
          `INSERT INTO agent_tasks(
             task_id, idempotency_key, origin_kind, status, created_at, updated_at, record_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(task_id) DO UPDATE SET
             idempotency_key = excluded.idempotency_key,
             origin_kind = excluded.origin_kind,
             status = excluded.status,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at,
             record_json = excluded.record_json`,
        ).run(
          task.taskId,
          task.idempotencyKey ?? null,
          originKind(task) ?? null,
          task.status,
          task.createdAt,
          task.updatedAt,
          JSON.stringify(task),
        );
      }),
  };
};

type RecordRow = {
  readonly record_json: string;
};

const originKind = (task: AgentTask): string | undefined => {
  if (task.origin === undefined) return undefined;
  const kind = task.origin.kind;
  return typeof kind === "string" ? kind : undefined;
};

const originField = (task: AgentTask, field: string): string | undefined => {
  if (task.origin === undefined) return undefined;
  const value = task.origin[field];
  return typeof value === "string" ? value : undefined;
};

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

function clone<T>(value: T): T;
function clone<T>(value: T | undefined): T | undefined;
function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as T);
}
