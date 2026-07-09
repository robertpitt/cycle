import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export const agentSessionBindingMigrations = {
  "0001_create_agent_session_bindings": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE IF NOT EXISTS agent_session_bindings (
        session_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        thread_id TEXT,
        title TEXT,
        cwd TEXT,
        model TEXT,
        active_turn_id TEXT,
        native_json TEXT,
        last_error TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS agent_session_bindings_provider_status
      ON agent_session_bindings(provider, status)
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS agent_session_bindings_updated
      ON agent_session_bindings(updated_at DESC, session_id)
    `;
  }),
} satisfies Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>;
