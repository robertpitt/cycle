import { agentChatSchemaSql, ensureDatabaseParentDirectorySync } from "@cycle/database";
import type {
  AgentChatActivityRecord,
  AgentChatEventRecord,
  AgentChatMessageRecord,
  AgentChatQuestionItemRecord,
  AgentChatQuestionRecord,
  AgentChatStoreShape,
  AgentChatThreadRecord,
  AgentChatThreadWithMessages,
  AgentChatTurnRecord,
} from "@cycle/api";
import { Schema } from "effect";
import { DatabaseSync } from "node:sqlite";

type ThreadRow = {
  readonly active_turn_id: string | null;
  readonly agent_id: string | null;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly last_error: string | null;
  readonly model: string | null;
  readonly origin_json: string | null;
  readonly runtime_mode: string | null;
  readonly session_id: string | null;
  readonly status: AgentChatThreadRecord["status"];
  readonly summary: string;
  readonly thinking_level: string | null;
  readonly thread_id: string;
  readonly title: string;
  readonly updated_at: string;
};

type MessageRow = {
  readonly actor: AgentChatMessageRecord["actor"];
  readonly body: string;
  readonly created_at: string;
  readonly message_id: string;
  readonly metadata_json: string | null;
  readonly sequence: number | null;
  readonly streaming: number | null;
  readonly thread_id: string;
  readonly turn_id: string | null;
  readonly updated_at: string | null;
};

type TurnRow = {
  readonly assistant_message_id: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly input_message_id: string;
  readonly last_error: string | null;
  readonly metadata_json: string | null;
  readonly model: string | null;
  readonly provider_id: string;
  readonly runtime_mode: string | null;
  readonly status: AgentChatTurnRecord["status"];
  readonly thinking_level: string | null;
  readonly thread_id: string;
  readonly turn_id: string;
  readonly updated_at: string;
};

type ActivityRow = {
  readonly activity_id: string;
  readonly created_at: string;
  readonly detail: string | null;
  readonly kind: AgentChatActivityRecord["kind"];
  readonly payload_json: string | null;
  readonly status: AgentChatActivityRecord["status"];
  readonly thread_id: string;
  readonly title: string;
  readonly turn_id: string | null;
  readonly updated_at: string | null;
};

type QuestionRow = {
  readonly answer_json: string | null;
  readonly answered_at: string | null;
  readonly created_at: string;
  readonly prompt: string;
  readonly question_id: string;
  readonly questions_json: string;
  readonly status: AgentChatQuestionRecord["status"];
  readonly thread_id: string;
  readonly turn_id: string;
  readonly updated_at: string | null;
};

type EventRow = {
  readonly created_at: string;
  readonly event_id: string;
  readonly payload_json: string;
  readonly sequence: number;
  readonly thread_id: string;
  readonly type: string;
};

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);
const StrictDecodeOptions = { onExcessProperty: "error" } as const;
const AgentChatQuestionItem = Schema.Struct({
  header: Schema.String,
  id: Schema.String,
  multiSelect: Schema.Boolean,
  options: Schema.Array(
    Schema.Struct({
      description: Schema.optional(Schema.NullOr(Schema.String)),
      disabled: Schema.optional(Schema.Boolean),
      label: Schema.String,
      value: Schema.optional(Schema.String),
    }),
  ),
  question: Schema.String,
});
const AgentChatQuestionItems = Schema.Array(AgentChatQuestionItem);

export const makeDesktopAgentChatStore = (path: string): AgentChatStoreShape => {
  ensureDatabaseParentDirectorySync(path);
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(agentChatSchemaSql);
  ensureChatSchemaCompatibility(db);

  const listMessages = async (threadId: string): Promise<readonly AgentChatMessageRecord[]> => {
    const rows = db
      .prepare(
        `SELECT *
         FROM agent_chat_messages
         WHERE thread_id = ?
         ORDER BY COALESCE(sequence, 9223372036854775807), created_at ASC, message_id ASC`,
      )
      .all(threadId) as unknown as ReadonlyArray<MessageRow>;

    return rows.map(messageFromRow);
  };

  const listActivities = async (threadId: string): Promise<readonly AgentChatActivityRecord[]> => {
    const rows = db
      .prepare(
        `SELECT *
         FROM agent_chat_activities
         WHERE thread_id = ?
         ORDER BY created_at ASC, activity_id ASC`,
      )
      .all(threadId) as unknown as ReadonlyArray<ActivityRow>;

    return rows.map(activityFromRow);
  };

  const listQuestions = async (threadId: string): Promise<readonly AgentChatQuestionRecord[]> => {
    const rows = db
      .prepare(
        `SELECT *
         FROM agent_chat_questions
         WHERE thread_id = ?
         ORDER BY created_at ASC, question_id ASC`,
      )
      .all(threadId) as unknown as ReadonlyArray<QuestionRow>;

    return rows.map(questionFromRow);
  };

  const listTurns = async (threadId: string): Promise<readonly AgentChatTurnRecord[]> => {
    const rows = db
      .prepare(
        `SELECT *
         FROM agent_chat_turns
         WHERE thread_id = ?
         ORDER BY created_at ASC, turn_id ASC`,
      )
      .all(threadId) as unknown as ReadonlyArray<TurnRow>;

    return rows.map(turnFromRow);
  };

  const listEventsAfter = async (
    threadId: string,
    sequence: number,
  ): Promise<readonly AgentChatEventRecord[]> => {
    const rows = db
      .prepare(
        `SELECT *
         FROM agent_chat_events
         WHERE thread_id = ? AND sequence > ?
         ORDER BY sequence ASC`,
      )
      .all(threadId, sequence) as unknown as ReadonlyArray<EventRow>;

    return rows.map(eventFromRow);
  };

  const getThread = async (threadId: string): Promise<AgentChatThreadWithMessages | undefined> => {
    const row = db.prepare("SELECT * FROM agent_chat_threads WHERE thread_id = ?").get(threadId) as
      | ThreadRow
      | undefined;

    if (row === undefined) return undefined;

    return {
      ...threadFromRow(row),
      messages: await listMessages(threadId),
    };
  };

  const nextMessageSequence = (threadId: string): number => {
    const row = db
      .prepare(
        "SELECT COALESCE(MAX(sequence), -1) + 1 AS sequence FROM agent_chat_messages WHERE thread_id = ?",
      )
      .get(threadId) as { readonly sequence: number } | undefined;

    return row?.sequence ?? 0;
  };

  const existingMessageSequence = (threadId: string, messageId: string): number | undefined => {
    const row = db
      .prepare("SELECT sequence FROM agent_chat_messages WHERE thread_id = ? AND message_id = ?")
      .get(threadId, messageId) as { readonly sequence: number | null } | undefined;

    return row?.sequence ?? undefined;
  };

  const nextEventSequence = (threadId: string): number => {
    const row = db
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM agent_chat_events WHERE thread_id = ?",
      )
      .get(threadId) as { readonly sequence: number } | undefined;

    return row?.sequence ?? 1;
  };

  return {
    appendEvent: async (input): Promise<AgentChatEventRecord> => {
      const sequence = nextEventSequence(input.threadId);

      db.prepare(
        `INSERT INTO agent_chat_events (
          thread_id, event_id, sequence, type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, event_id) DO UPDATE SET
          type = excluded.type,
          payload_json = excluded.payload_json,
          created_at = excluded.created_at`,
      ).run(
        input.threadId,
        input.eventId,
        sequence,
        input.type,
        jsonString(input.payload),
        input.createdAt,
      );

      return {
        ...input,
        sequence,
      };
    },
    close: () => {
      db.close();
    },
    deleteThread: async (threadId): Promise<boolean> => {
      const existing = db
        .prepare("SELECT 1 FROM agent_chat_threads WHERE thread_id = ?")
        .get(threadId);

      if (existing === undefined) return false;

      db.prepare("DELETE FROM agent_chat_threads WHERE thread_id = ?").run(threadId);
      return true;
    },
    getThread,
    listActivities,
    listEventsAfter,
    listMessages,
    listQuestions,
    listThreads: async (): Promise<readonly AgentChatThreadWithMessages[]> => {
      const rows = db
        .prepare(
          `SELECT *
           FROM agent_chat_threads
           ORDER BY updated_at DESC, thread_id ASC`,
        )
        .all() as unknown as ReadonlyArray<ThreadRow>;

      return Promise.all(
        rows.map(async (row) => ({
          ...threadFromRow(row),
          messages: await listMessages(row.thread_id),
        })),
      );
    },
    listTurns,
    upsertActivity: async (input): Promise<AgentChatActivityRecord> => {
      db.prepare(
        `INSERT INTO agent_chat_activities (
          thread_id, activity_id, turn_id, kind, status, title, detail, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, activity_id) DO UPDATE SET
          turn_id = excluded.turn_id,
          kind = excluded.kind,
          status = excluded.status,
          title = excluded.title,
          detail = excluded.detail,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`,
      ).run(
        input.threadId,
        input.id,
        input.turnId ?? null,
        input.kind,
        input.status ?? null,
        input.title,
        input.detail ?? null,
        input.payload === undefined || input.payload === null ? null : jsonString(input.payload),
        input.createdAt,
        input.updatedAt ?? null,
      );

      return input;
    },
    upsertMessage: async (input: AgentChatMessageRecord): Promise<AgentChatMessageRecord> => {
      const sequence =
        input.sequence ??
        existingMessageSequence(input.threadId, input.id) ??
        nextMessageSequence(input.threadId);

      db.prepare(
        `INSERT INTO agent_chat_messages (
          thread_id, message_id, sequence, actor, body, turn_id, streaming, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, message_id) DO UPDATE SET
          sequence = excluded.sequence,
          actor = excluded.actor,
          body = excluded.body,
          turn_id = excluded.turn_id,
          streaming = excluded.streaming,
          metadata_json = excluded.metadata_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
      ).run(
        input.threadId,
        input.id,
        sequence,
        input.actor,
        input.body,
        input.turnId ?? null,
        input.streaming ? 1 : 0,
        input.metadata === undefined ? null : jsonString(input.metadata),
        input.createdAt,
        input.updatedAt ?? null,
      );

      return {
        ...input,
        sequence,
      };
    },
    upsertQuestion: async (input): Promise<AgentChatQuestionRecord> => {
      db.prepare(
        `INSERT INTO agent_chat_questions (
          thread_id, question_id, turn_id, status, prompt, questions_json, answer_json, answered_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, question_id) DO UPDATE SET
          turn_id = excluded.turn_id,
          status = excluded.status,
          prompt = excluded.prompt,
          questions_json = excluded.questions_json,
          answer_json = excluded.answer_json,
          answered_at = excluded.answered_at,
          updated_at = excluded.updated_at`,
      ).run(
        input.threadId,
        input.id,
        input.turnId,
        input.status,
        input.prompt,
        jsonString(input.questions),
        input.answer === undefined || input.answer === null ? null : jsonString(input.answer),
        input.answeredAt ?? null,
        input.createdAt,
        input.updatedAt ?? null,
      );

      return input;
    },
    upsertThread: async (input: AgentChatThreadRecord): Promise<AgentChatThreadRecord> => {
      db.prepare(
        `INSERT INTO agent_chat_threads (
	          thread_id, title, summary, status, agent_id, session_id, model, runtime_mode, thinking_level,
	          active_turn_id, last_error, origin_json, archived_at, created_at, updated_at
	        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	        ON CONFLICT(thread_id) DO UPDATE SET
	          title = excluded.title,
	          summary = excluded.summary,
	          status = excluded.status,
	          agent_id = excluded.agent_id,
	          session_id = excluded.session_id,
	          model = excluded.model,
	          runtime_mode = excluded.runtime_mode,
	          thinking_level = excluded.thinking_level,
	          active_turn_id = excluded.active_turn_id,
	          last_error = excluded.last_error,
	          origin_json = excluded.origin_json,
	          archived_at = excluded.archived_at,
	          updated_at = excluded.updated_at`,
      ).run(
        input.id,
        input.title,
        input.summary,
        input.status,
        input.agentId ?? null,
        input.sessionId ?? null,
        input.model ?? null,
        input.runtimeMode ?? null,
        input.thinkingLevel ?? null,
        input.activeTurnId ?? null,
        input.lastError ?? null,
        input.origin === undefined ? null : jsonString(input.origin),
        input.archivedAt ?? null,
        input.createdAt,
        input.updatedAt,
      );

      return input;
    },
    upsertTurn: async (input): Promise<AgentChatTurnRecord> => {
      db.prepare(
        `INSERT INTO agent_chat_turns (
	          thread_id, turn_id, input_message_id, assistant_message_id, provider_id, model,
	          runtime_mode, thinking_level, status, last_error, metadata_json, completed_at, created_at, updated_at
	        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	        ON CONFLICT(thread_id, turn_id) DO UPDATE SET
	          input_message_id = excluded.input_message_id,
	          assistant_message_id = excluded.assistant_message_id,
	          provider_id = excluded.provider_id,
	          model = excluded.model,
	          runtime_mode = excluded.runtime_mode,
	          thinking_level = excluded.thinking_level,
	          status = excluded.status,
	          last_error = excluded.last_error,
	          metadata_json = excluded.metadata_json,
          completed_at = excluded.completed_at,
          updated_at = excluded.updated_at`,
      ).run(
        input.threadId,
        input.id,
        input.inputMessageId,
        input.assistantMessageId ?? null,
        input.providerId,
        input.model ?? null,
        input.runtimeMode ?? null,
        input.thinkingLevel ?? null,
        input.status,
        input.lastError ?? null,
        input.metadata === undefined ? null : jsonString(input.metadata),
        input.completedAt ?? null,
        input.createdAt,
        input.updatedAt,
      );

      return input;
    },
  };
};

const ensureChatSchemaCompatibility = (db: DatabaseSync): void => {
  const columns: ReadonlyArray<readonly [string, string]> = [
    ["agent_chat_threads", "model TEXT"],
    ["agent_chat_threads", "runtime_mode TEXT"],
    ["agent_chat_threads", "thinking_level TEXT"],
    ["agent_chat_threads", "active_turn_id TEXT"],
    ["agent_chat_threads", "last_error TEXT"],
    ["agent_chat_threads", "origin_json TEXT"],
    ["agent_chat_threads", "archived_at TEXT"],
    ["agent_chat_messages", "turn_id TEXT"],
    ["agent_chat_messages", "streaming INTEGER NOT NULL DEFAULT 0"],
    ["agent_chat_messages", "metadata_json TEXT"],
    ["agent_chat_messages", "updated_at TEXT"],
    ["agent_chat_turns", "runtime_mode TEXT"],
  ];

  for (const [table, column] of columns) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`);
    } catch {
      // SQLite reports duplicate column names for already-migrated databases.
    }
  }
};

const jsonString = (value: unknown): string => JSON.stringify(value);

const parseJsonRecord = (value: string | null): Readonly<Record<string, unknown>> | undefined => {
  if (value === null) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    return Schema.decodeUnknownSync(JsonRecord, StrictDecodeOptions)(parsed);
  } catch {
    return undefined;
  }
};

const parseQuestionItems = (value: string): readonly AgentChatQuestionItemRecord[] => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Schema.decodeUnknownSync(AgentChatQuestionItems, StrictDecodeOptions)(parsed);
  } catch {
    return [];
  }
};

const jsonRecordProperty = <Key extends string>(
  key: Key,
  value: string | null,
): Partial<Record<Key, Readonly<Record<string, unknown>>>> => {
  const parsed = parseJsonRecord(value);
  return parsed === undefined ? {} : ({ [key]: parsed } as Record<Key, typeof parsed>);
};

const runtimeModeFromString = (
  value: string | null,
): AgentChatThreadRecord["runtimeMode"] | undefined =>
  value === "read-only" || value === "workspace-write" || value === "full-access"
    ? value
    : undefined;

const threadFromRow = (row: ThreadRow): AgentChatThreadRecord => ({
  ...(row.active_turn_id === null ? {} : { activeTurnId: row.active_turn_id }),
  ...(row.agent_id === null ? {} : { agentId: row.agent_id }),
  ...(row.archived_at === null ? {} : { archivedAt: row.archived_at }),
  createdAt: row.created_at,
  id: row.thread_id,
  ...(row.last_error === null ? {} : { lastError: row.last_error }),
  ...(row.model === null ? {} : { model: row.model }),
  ...jsonRecordProperty("origin", row.origin_json),
  ...(runtimeModeFromString(row.runtime_mode) === undefined
    ? {}
    : { runtimeMode: runtimeModeFromString(row.runtime_mode) }),
  ...(row.session_id === null ? {} : { sessionId: row.session_id }),
  status: row.status,
  summary: row.summary,
  ...(row.thinking_level === null ? {} : { thinkingLevel: row.thinking_level }),
  title: row.title,
  updatedAt: row.updated_at,
});

const messageFromRow = (row: MessageRow): AgentChatMessageRecord => ({
  actor: row.actor,
  body: row.body,
  createdAt: row.created_at,
  id: row.message_id,
  ...jsonRecordProperty("metadata", row.metadata_json),
  ...(row.sequence === null ? {} : { sequence: row.sequence }),
  streaming: row.streaming === 1,
  threadId: row.thread_id,
  ...(row.turn_id === null ? {} : { turnId: row.turn_id }),
  ...(row.updated_at === null ? {} : { updatedAt: row.updated_at }),
});

const turnFromRow = (row: TurnRow): AgentChatTurnRecord => ({
  ...(row.assistant_message_id === null ? {} : { assistantMessageId: row.assistant_message_id }),
  ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
  createdAt: row.created_at,
  id: row.turn_id,
  inputMessageId: row.input_message_id,
  ...(row.last_error === null ? {} : { lastError: row.last_error }),
  ...jsonRecordProperty("metadata", row.metadata_json),
  ...(row.model === null ? {} : { model: row.model }),
  providerId: row.provider_id,
  ...(runtimeModeFromString(row.runtime_mode) === undefined
    ? {}
    : { runtimeMode: runtimeModeFromString(row.runtime_mode) }),
  status: row.status,
  ...(row.thinking_level === null ? {} : { thinkingLevel: row.thinking_level }),
  threadId: row.thread_id,
  updatedAt: row.updated_at,
});

const activityFromRow = (row: ActivityRow): AgentChatActivityRecord => ({
  createdAt: row.created_at,
  ...(row.detail === null ? {} : { detail: row.detail }),
  id: row.activity_id,
  kind: row.kind,
  ...jsonRecordProperty("payload", row.payload_json),
  ...(row.status === null ? {} : { status: row.status }),
  threadId: row.thread_id,
  title: row.title,
  ...(row.turn_id === null ? {} : { turnId: row.turn_id }),
  ...(row.updated_at === null ? {} : { updatedAt: row.updated_at }),
});

const questionFromRow = (row: QuestionRow): AgentChatQuestionRecord => ({
  ...jsonRecordProperty("answer", row.answer_json),
  ...(row.answered_at === null ? {} : { answeredAt: row.answered_at }),
  createdAt: row.created_at,
  id: row.question_id,
  prompt: row.prompt,
  questions: parseQuestionItems(row.questions_json),
  status: row.status,
  threadId: row.thread_id,
  turnId: row.turn_id,
  ...(row.updated_at === null ? {} : { updatedAt: row.updated_at }),
});

const eventFromRow = (row: EventRow): AgentChatEventRecord => ({
  createdAt: row.created_at,
  eventId: row.event_id,
  payload: parseJsonRecord(row.payload_json) ?? {},
  sequence: row.sequence,
  threadId: row.thread_id,
  type: row.type,
});
