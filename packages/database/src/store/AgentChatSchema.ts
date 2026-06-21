export const agentChatSchemaSql = `
CREATE TABLE IF NOT EXISTS agent_chat_threads (
  thread_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  agent_id TEXT,
  session_id TEXT,
  model TEXT,
  runtime_mode TEXT,
  thinking_level TEXT,
  active_turn_id TEXT,
  last_error TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_chat_threads_updated ON agent_chat_threads(updated_at DESC, thread_id);

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sequence INTEGER,
  actor TEXT NOT NULL,
  body TEXT NOT NULL,
  turn_id TEXT,
  streaming INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  PRIMARY KEY (thread_id, message_id),
  FOREIGN KEY (thread_id) REFERENCES agent_chat_threads(thread_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_chat_messages_thread_sequence ON agent_chat_messages(thread_id, sequence, created_at, message_id);

CREATE TABLE IF NOT EXISTS agent_chat_turns (
  thread_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  input_message_id TEXT NOT NULL,
  assistant_message_id TEXT,
  provider_id TEXT NOT NULL,
  model TEXT,
  runtime_mode TEXT,
  thinking_level TEXT,
  status TEXT NOT NULL,
  last_error TEXT,
  metadata_json TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, turn_id),
  FOREIGN KEY (thread_id) REFERENCES agent_chat_threads(thread_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_chat_turns_thread_updated ON agent_chat_turns(thread_id, updated_at, turn_id);

CREATE TABLE IF NOT EXISTS agent_chat_activities (
  thread_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  turn_id TEXT,
  kind TEXT NOT NULL,
  status TEXT,
  title TEXT NOT NULL,
  detail TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  PRIMARY KEY (thread_id, activity_id),
  FOREIGN KEY (thread_id) REFERENCES agent_chat_threads(thread_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_chat_activities_thread_created ON agent_chat_activities(thread_id, created_at, activity_id);

CREATE TABLE IF NOT EXISTS agent_chat_questions (
  thread_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  answer_json TEXT,
  answered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  PRIMARY KEY (thread_id, question_id),
  FOREIGN KEY (thread_id) REFERENCES agent_chat_threads(thread_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_chat_questions_thread_status ON agent_chat_questions(thread_id, status, created_at);

CREATE TABLE IF NOT EXISTS agent_chat_events (
  thread_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, event_id),
  UNIQUE (thread_id, sequence),
  FOREIGN KEY (thread_id) REFERENCES agent_chat_threads(thread_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_chat_events_thread_sequence ON agent_chat_events(thread_id, sequence);

CREATE TABLE IF NOT EXISTS agent_chat_message_mentions (
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  repository_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, message_id, uri),
  FOREIGN KEY (thread_id, message_id) REFERENCES agent_chat_messages(thread_id, message_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS agent_chat_message_mentions_entity ON agent_chat_message_mentions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS agent_chat_message_mentions_repository ON agent_chat_message_mentions(repository_id, entity_type, entity_id);
`;

export const agentSessionBindingSchemaSql = `
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
);
CREATE INDEX IF NOT EXISTS agent_session_bindings_provider_status ON agent_session_bindings(provider, status);
CREATE INDEX IF NOT EXISTS agent_session_bindings_updated ON agent_session_bindings(updated_at DESC, session_id);
`;
