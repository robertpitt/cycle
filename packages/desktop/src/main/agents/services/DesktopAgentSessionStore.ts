import type { AgentSessionBinding, AgentSessionStore, JsonObject } from "@cycle/agents";
import { agentSessionBindingSchemaSql, ensureDatabaseParentDirectorySync } from "@cycle/database";
import { Context, Layer, Schema } from "effect";
import { DatabaseSync } from "node:sqlite";

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

export class DesktopAgentSessionStore extends Context.Service<
  DesktopAgentSessionStore,
  AgentSessionStore
>()("@cycle/desktop/DesktopAgentSessionStore") {}

export const makeDesktopAgentSessionStore = (path: string): AgentSessionStore => {
  ensureDatabaseParentDirectorySync(path);
  const db = new DatabaseSync(path);
  db.exec(agentSessionBindingSchemaSql);

  return {
    close: () => {
      db.close();
    },
    delete: async (sessionId: string): Promise<void> => {
      db.prepare("DELETE FROM agent_session_bindings WHERE session_id = ?").run(sessionId);
    },
    get: async (sessionId: string): Promise<AgentSessionBinding | undefined> => {
      const row = db
        .prepare("SELECT * FROM agent_session_bindings WHERE session_id = ?")
        .get(sessionId) as SessionBindingRow | undefined;

      return row === undefined ? undefined : bindingFromRow(row);
    },
    list: async (): Promise<readonly AgentSessionBinding[]> => {
      const rows = db
        .prepare(
          `SELECT *
           FROM agent_session_bindings
           ORDER BY updated_at DESC, session_id ASC`,
        )
        .all() as unknown as ReadonlyArray<SessionBindingRow>;

      return rows.map(bindingFromRow);
    },
    upsert: async (binding: AgentSessionBinding): Promise<void> => {
      db.prepare(
        `INSERT INTO agent_session_bindings (
          session_id, provider, status, thread_id, title, cwd, model, active_turn_id,
          native_json, last_error, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          updated_at = excluded.updated_at`,
      ).run(
        binding.sessionId,
        binding.provider,
        binding.status,
        binding.threadId ?? null,
        binding.title ?? null,
        binding.cwd ?? null,
        binding.model ?? null,
        binding.activeTurnId ?? null,
        stringifyJson(binding.native),
        binding.lastError ?? null,
        stringifyJson(binding.metadata),
        binding.createdAt,
        binding.updatedAt,
      );
    },
  };
};

export const DesktopAgentSessionStoreLive = (path: string) =>
  Layer.sync(DesktopAgentSessionStore, () =>
    DesktopAgentSessionStore.of(makeDesktopAgentSessionStore(path)),
  );

export const DesktopAgentSessionStoreTest = (store: AgentSessionStore) =>
  Layer.succeed(DesktopAgentSessionStore, DesktopAgentSessionStore.of(store));

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
