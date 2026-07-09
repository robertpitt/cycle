import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

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

export const agentTaskMigrations = {
  "0001_create_agent_task_tables": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        task_id TEXT PRIMARY KEY,
        idempotency_key TEXT,
        origin_kind TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_status
      ON agent_tasks(status, updated_at)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_idempotency
      ON agent_tasks(idempotency_key, status)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_origin_kind
      ON agent_tasks(origin_kind, updated_at)
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_task_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_task_events_task
      ON agent_task_events(task_id, sequence)
    `;
  }),
} satisfies Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>;
