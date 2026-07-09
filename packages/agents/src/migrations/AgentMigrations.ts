import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export const agentMigrations = {
  "0001_durable_agent_runtime": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_threads (
        thread_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        harness_id TEXT NOT NULL,
        repository_id TEXT,
        ticket_id TEXT,
        idempotency_key TEXT,
        active_task_id TEXT,
        last_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sequence >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_threads_status_updated
      ON agent_threads(status, updated_at DESC)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_threads_repository
      ON agent_threads(repository_id, updated_at DESC)
    `;
    yield* sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_threads_idempotency
      ON agent_threads(idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        task_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        priority_lane TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        harness_id TEXT NOT NULL,
        repository_id TEXT,
        parent_run_id TEXT,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        enqueue_sequence INTEGER NOT NULL UNIQUE,
        not_before TEXT,
        current_run_id TEXT,
        current_attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL,
        queued_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_enqueue_sequence (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT
      )
    `;
    yield* sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_idempotency
      ON agent_tasks(idempotency_key)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_schedule
      ON agent_tasks(status, priority_lane, not_before, enqueue_sequence)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_capacity
      ON agent_tasks(status, provider_id, repository_id, parent_run_id)
    `;
    yield* sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_active_interactive_thread
      ON agent_tasks(thread_id)
      WHERE kind = 'interactive-turn'
        AND status IN ('queued','claimed','preparing','running','suspending','suspended','resuming','retry-wait','cancelling')
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_runs (
        run_id TEXT PRIMARY KEY,
        root_run_id TEXT NOT NULL,
        parent_run_id TEXT,
        task_id TEXT NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        depth INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        harness_id TEXT NOT NULL,
        current_attempt_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        FOREIGN KEY(parent_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_task_status
      ON agent_runs(task_id, status)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_parent_status
      ON agent_runs(parent_run_id, status)
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_attempts (
        attempt_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        status TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        fencing_token INTEGER NOT NULL,
        lease_expires_at TEXT NOT NULL,
        heartbeat_at TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        record_json TEXT NOT NULL,
        UNIQUE(run_id, ordinal),
        UNIQUE(run_id, fencing_token)
      )
    `;
    yield* sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_attempts_active_run
      ON agent_attempts(run_id)
      WHERE status IN ('claimed','preparing','running','suspending','suspended')
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_attempts_lease
      ON agent_attempts(status, lease_expires_at)
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_turns (
        turn_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_messages (
        message_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        task_id TEXT REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        turn_id TEXT REFERENCES agent_turns(turn_id) ON DELETE CASCADE,
        run_id TEXT REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        attempt_id TEXT REFERENCES agent_attempts(attempt_id) ON DELETE SET NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        visibility TEXT NOT NULL,
        provider_message_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_messages_thread
      ON agent_messages(thread_id, created_at, message_id)
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_message_parts (
        message_id TEXT NOT NULL REFERENCES agent_messages(message_id) ON DELETE CASCADE,
        part_index INTEGER NOT NULL,
        part_type TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY(message_id, part_index)
      )
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_session_bindings (
        session_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        harness_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_session_id TEXT,
        provider_thread_id TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_session_provider_ids
      ON agent_session_bindings(provider_id, provider_session_id, provider_thread_id)
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_interactions (
        interaction_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        attempt_id TEXT NOT NULL REFERENCES agent_attempts(attempt_id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_request_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        answered_at TEXT,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_interactions_open
      ON agent_interactions(thread_id, task_id, status)
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_workflow_steps (
        step_id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        attempt_count INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_workflow_task
      ON agent_workflow_steps(task_id, status, created_at)
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_operation_receipts (
        operation_id TEXT PRIMARY KEY,
        step_id TEXT NOT NULL REFERENCES agent_workflow_steps(step_id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        input_hash TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_artifacts (
        artifact_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        task_id TEXT REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        run_id TEXT REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        retention TEXT NOT NULL,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      )
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_events (
        event_id TEXT NOT NULL UNIQUE,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        task_id TEXT REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        run_id TEXT REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        attempt_id TEXT REFERENCES agent_attempts(attempt_id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        visibility TEXT NOT NULL,
        retention TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        persisted_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        PRIMARY KEY(thread_id, sequence)
      ) WITHOUT ROWID
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_events_task_sequence
      ON agent_events(task_id, sequence)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_events_run_sequence
      ON agent_events(run_id, sequence)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_events_retention
      ON agent_events(retention, persisted_at)
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_provider_diagnostics (
        diagnostic_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        task_id TEXT REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        provider_id TEXT NOT NULL,
        provider_tag TEXT NOT NULL,
        cursor TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_diagnostics_expiry
      ON agent_provider_diagnostics(expires_at)
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_commands (
        command_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
        task_id TEXT REFERENCES agent_tasks(task_id) ON DELETE CASCADE,
        run_id TEXT REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        command_type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        record_json TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_agent_commands_delivery
      ON agent_commands(status, created_at)
    `;

    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_retention_runs (
        retention_run_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        cursor_json TEXT,
        error_json TEXT
      )
    `;
  }),
  "0002_repair_enqueue_sequence": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    // Early development builds recorded migration 0001 before this allocator table was
    // added. Keep this repair additive and idempotent so those databases retain their
    // threads while becoming able to accept their first task.
    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_enqueue_sequence (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT
      )
    `;
  }),
} satisfies Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>;
