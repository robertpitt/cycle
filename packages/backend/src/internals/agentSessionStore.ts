import type { AgentSessionBinding, AgentSessionStore, JsonObject } from "@cycle/agents";
import { makeSqliteLayer, migrationsFromRecord } from "@cycle/sqlite";
import { Context, Effect, Exit, Layer, Schema, Scope } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { agentSessionBindingMigrations } from "../migrations/AgentSessionMigrations.ts";

type SessionBindingRow = {
  readonly active_turn_id: string | null;
  readonly created_at: string;
  readonly cwd: string | null;
  readonly last_error: string | null;
  readonly metadata_json: string | null;
  readonly model: string | null;
  readonly native_json: string | null;
  readonly provider: AgentSessionBinding["provider"];
  readonly session_id: string;
  readonly status: AgentSessionBinding["status"];
  readonly thread_id: string | null;
  readonly title: string | null;
  readonly updated_at: string;
};

export const makeBackendAgentSessionStore = (path: string): AgentSessionStore => {
  const scope = Effect.runSync(Scope.make("sequential"));
  const context = Effect.runSync(
    Layer.buildWithScope(
      makeSqliteLayer({
        filename: path,
        migrations: {
          loader: migrationsFromRecord(agentSessionBindingMigrations),
          table: "agent_session_migrations",
        },
      }),
      scope,
    ),
  );
  const sql = Context.get(context, SqlClient.SqlClient);

  return makeBackendAgentSessionStoreFromSql(sql, () =>
    Effect.runPromise(Scope.close(scope, Exit.void)),
  );
};

export const makeBackendAgentSessionStoreFromSql = (
  sql: SqlClient.SqlClient,
  close: () => Promise<void> = () => Promise.resolve(),
): AgentSessionStore => ({
  close,
  delete: (sessionId: string): Promise<void> =>
    Effect.runPromise(
      sql`
      DELETE FROM agent_session_bindings WHERE session_id = ${sessionId}
    `.pipe(Effect.asVoid),
    ),
  get: async (sessionId: string): Promise<AgentSessionBinding | undefined> => {
    const rows = await Effect.runPromise(sql<SessionBindingRow>`
      SELECT * FROM agent_session_bindings WHERE session_id = ${sessionId}
    `);

    return rows[0] === undefined ? undefined : bindingFromRow(rows[0]);
  },
  list: async (): Promise<readonly AgentSessionBinding[]> => {
    const rows = await Effect.runPromise(sql<SessionBindingRow>`
      SELECT *
      FROM agent_session_bindings
      ORDER BY updated_at DESC, session_id ASC
    `);

    return rows.map(bindingFromRow);
  },
  upsert: (binding: AgentSessionBinding): Promise<void> =>
    Effect.runPromise(
      sql`
      INSERT INTO agent_session_bindings (
        session_id, provider, status, thread_id, title, cwd, model, active_turn_id,
        native_json, last_error, metadata_json, created_at, updated_at
      ) VALUES (
        ${binding.sessionId}, ${binding.provider}, ${binding.status}, ${binding.threadId ?? null},
        ${binding.title ?? null}, ${binding.cwd ?? null}, ${binding.model ?? null},
        ${binding.activeTurnId ?? null}, ${stringifyJson(binding.native)},
        ${binding.lastError ?? null}, ${stringifyJson(binding.metadata)}, ${binding.createdAt},
        ${binding.updatedAt}
      )
      ON CONFLICT(session_id) DO UPDATE SET
        provider = excluded.provider,
        status = excluded.status,
        thread_id = excluded.thread_id,
        title = excluded.title,
        cwd = excluded.cwd,
        model = excluded.model,
        active_turn_id = excluded.active_turn_id,
        native_json = excluded.native_json,
        last_error = excluded.last_error,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `.pipe(Effect.asVoid),
    ),
});

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);
const JsonObjectSchema = Schema.Record(Schema.String, Schema.Json);
const StrictDecodeOptions = { onExcessProperty: "error" } as const;

const stringifyJson = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

const parseRecord = (value: string | null): Readonly<Record<string, unknown>> | undefined => {
  if (value === null) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    return Schema.decodeUnknownSync(JsonRecord, StrictDecodeOptions)(parsed);
  } catch {
    return undefined;
  }
};

const parseJsonObject = (value: string | null): JsonObject | undefined => {
  if (value === null) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    return Schema.decodeUnknownSync(
      JsonObjectSchema,
      StrictDecodeOptions,
    )(parsed) as unknown as JsonObject;
  } catch {
    return undefined;
  }
};

const bindingFromRow = (row: SessionBindingRow): AgentSessionBinding => {
  const metadata = parseJsonObject(row.metadata_json);
  const native = parseRecord(row.native_json);

  return {
    ...(row.active_turn_id === null ? {} : { activeTurnId: row.active_turn_id }),
    createdAt: row.created_at,
    ...(row.cwd === null ? {} : { cwd: row.cwd }),
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(native === undefined ? {} : { native }),
    provider: row.provider,
    sessionId: row.session_id,
    status: row.status,
    ...(row.thread_id === null ? {} : { threadId: row.thread_id }),
    ...(row.title === null ? {} : { title: row.title }),
    updatedAt: row.updated_at,
  };
};
