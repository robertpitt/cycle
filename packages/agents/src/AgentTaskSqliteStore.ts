import { makeSqliteLayer, type SqliteLayerError } from "@cycle/sqlite";
import { Context, Effect, Exit, Layer, Scope } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type {
  AgentTask,
  AgentTaskEvent,
  AgentTaskStatus,
} from "@cycle/contracts/schemas/agents/agent-task-schemas";
import { agentTaskStorageFailure, type AgentTaskServiceError } from "./AgentTaskErrors.ts";
import { AgentTaskStore, type AgentTaskStoreShape } from "./AgentTaskStore.ts";
import { agentTaskMigrations } from "./migrations/AgentTaskMigrations.ts";

const activeStatuses = new Set<AgentTaskStatus>([
  "cancelling",
  "queued",
  "running",
  "starting",
  "waiting_for_input",
]);

export const makeNodeSqliteAgentTaskStore = (path: string): AgentTaskStoreShape => {
  const scope = Effect.runSync(Scope.make("sequential"));
  const context = Effect.runSync(
    Layer.buildWithScope(
      makeSqliteLayer({
        filename: path,
        migrations: agentTaskMigrations,
      }),
      scope,
    ),
  );
  const sql = Context.get(context, SqlClient.SqlClient);

  return makeSqliteAgentTaskStore(
    sql,
    Scope.close(scope, Exit.void).pipe(Effect.mapError(agentTaskStorageFailure)),
  );
};

export const AgentTaskStoreSqliteLive = Layer.effect(
  AgentTaskStore,
  Effect.map(SqlClient.SqlClient, (sql) => AgentTaskStore.of(makeSqliteAgentTaskStore(sql))),
);

export const AgentTaskStoreSqlite = (path: string): Layer.Layer<AgentTaskStore, SqliteLayerError> =>
  AgentTaskStoreSqliteLive.pipe(
    Layer.provide(
      makeSqliteLayer({
        filename: path,
        migrations: agentTaskMigrations,
      }),
    ),
  );

export const makeSqliteAgentTaskStore = (
  sql: SqlClient.SqlClient,
  closeEffect: Effect.Effect<void, AgentTaskServiceError> = Effect.void,
): AgentTaskStoreShape => {
  const effect = <A>(body: Effect.Effect<A, unknown>): Effect.Effect<A, AgentTaskServiceError> =>
    body.pipe(Effect.mapError(agentTaskStorageFailure));

  return {
    appendEvent: (input) =>
      effect(
        Effect.gen(function* () {
          const existing = yield* sql<RecordRow>`
            SELECT record_json FROM agent_task_events WHERE event_id = ${input.eventId}
          `;
          if (existing[0] !== undefined) {
            return parseJson<AgentTaskEvent>(existing[0].record_json);
          }

          const result = yield* sql`
            INSERT INTO agent_task_events(
              event_id, task_id, event_type, occurred_at, record_json
            ) VALUES (
              ${input.eventId}, ${input.taskId}, ${input.type}, ${input.occurredAt},
              ${JSON.stringify({ ...input, sequence: 0 })}
            )
          `.raw;
          const sequence = Number((result as SqliteRunResult).lastInsertRowid ?? 0);
          const event: AgentTaskEvent = { ...input, sequence };
          yield* sql`
            UPDATE agent_task_events
            SET record_json = ${JSON.stringify(event)}
            WHERE sequence = ${sequence}
          `;
          return clone(event);
        }),
      ),
    close: closeEffect,
    findActiveTaskByIdempotencyKey: (idempotencyKey) =>
      effect(
        Effect.gen(function* () {
          const rows = yield* sql<RecordRow>`
            SELECT record_json FROM agent_tasks WHERE idempotency_key = ${idempotencyKey}
          `;
          return clone(
            rows
              .map((row) => parseJson<AgentTask>(row.record_json))
              .find((task) => activeStatuses.has(task.status)),
          );
        }),
      ),
    getTask: (taskId) =>
      effect(
        Effect.gen(function* () {
          const rows = yield* sql<RecordRow>`
            SELECT record_json FROM agent_tasks WHERE task_id = ${taskId}
          `;
          return rows[0] === undefined
            ? undefined
            : clone(parseJson<AgentTask>(rows[0].record_json));
        }),
      ),
    listEvents: (query) =>
      effect(
        Effect.gen(function* () {
          const rows = yield* sql<RecordRow>`
            SELECT record_json
            FROM agent_task_events
            WHERE task_id = ${query.taskId} AND sequence > ${query.afterSequence ?? 0}
            ORDER BY sequence ASC
          `;
          return rows
            .map((row) => parseJson<AgentTaskEvent>(row.record_json))
            .slice(0, query.limit)
            .map((event) => clone(event));
        }),
      ),
    listTasks: (query = {}) =>
      effect(
        Effect.gen(function* () {
          const rows = yield* sql<RecordRow>`
            SELECT record_json FROM agent_tasks ORDER BY created_at DESC
          `;
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
      ),
    upsertTask: (task) =>
      effect(
        sql`
        INSERT INTO agent_tasks(
          task_id, idempotency_key, origin_kind, status, created_at, updated_at, record_json
        ) VALUES (
          ${task.taskId}, ${task.idempotencyKey ?? null}, ${originKind(task) ?? null},
          ${task.status}, ${task.createdAt}, ${task.updatedAt}, ${JSON.stringify(task)}
        )
        ON CONFLICT(task_id) DO UPDATE SET
          idempotency_key = excluded.idempotency_key,
          origin_kind = excluded.origin_kind,
          status = excluded.status,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          record_json = excluded.record_json
      `.pipe(Effect.asVoid),
      ),
  };
};

type RecordRow = {
  readonly record_json: string;
};

type SqliteRunResult = {
  readonly changes?: bigint | number;
  readonly lastInsertRowid?: bigint | number;
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
