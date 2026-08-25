import { pageProjectionSchemaSql } from "./PageProjectionSchema.ts";

export const CURRENT_PROJECTION_SCHEMA_VERSION = 6;

export const inboxSchemaSql = `
CREATE TABLE IF NOT EXISTS inbox_items (
  repository_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_path TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  record_id TEXT,
  reason TEXT NOT NULL,
  actor_name TEXT,
  actor_email TEXT,
  created_at TEXT NOT NULL,
  title TEXT NOT NULL,
  body_excerpt TEXT,
  metadata_json TEXT,
  PRIMARY KEY (repository_id, user_id, item_id)
);
CREATE INDEX IF NOT EXISTS inbox_items_user_order ON inbox_items(user_id, created_at DESC, sequence DESC, item_id);
CREATE INDEX IF NOT EXISTS inbox_items_repository_user ON inbox_items(repository_id, user_id, created_at DESC, item_id);
CREATE INDEX IF NOT EXISTS inbox_items_ticket ON inbox_items(repository_id, ticket_id, user_id);
CREATE INDEX IF NOT EXISTS inbox_items_reason ON inbox_items(user_id, reason, created_at DESC, item_id);

CREATE TABLE IF NOT EXISTS inbox_item_state (
  repository_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  status TEXT NOT NULL,
  read_at TEXT,
  archived_at TEXT,
  snoozed_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (repository_id, user_id, item_id)
);
CREATE INDEX IF NOT EXISTS inbox_item_state_status ON inbox_item_state(user_id, status, updated_at DESC, item_id);
`;

export const schemaSql = `
CREATE TABLE IF NOT EXISTS repositories (
  repository_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  worktree_path TEXT,
  git_dir TEXT,
  watched_ref TEXT NOT NULL,
  active_snapshot_id TEXT,
  active_generation INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL,
  last_sync_started_at TEXT,
  last_sync_completed_at TEXT,
  last_sync_error TEXT,
  warning_count INTEGER NOT NULL DEFAULT 0,
  cycle_metadata_json TEXT,
  current_branch TEXT,
  default_remote TEXT,
  default_remote_url TEXT,
  metadata_updated_at TEXT,
  remotes_json TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  repository_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  document_path TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  body_format TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  assignee TEXT,
  parent_id TEXT NOT NULL,
  repository_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_by_type TEXT NOT NULL,
  labels_json TEXT,
  frontmatter_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  due_date TEXT,
  estimate TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  relation_summary_json TEXT,
  PRIMARY KEY (repository_id, ticket_id)
);
CREATE INDEX IF NOT EXISTS tickets_active_updated ON tickets(repository_id, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_active_created ON tickets(repository_id, archived_at, deleted_at, created_at, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_active_due_date ON tickets(repository_id, archived_at, deleted_at, due_date, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_active_priority_order ON tickets(repository_id, archived_at, deleted_at, priority, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_active_title ON tickets(repository_id, archived_at, deleted_at, title, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_repository_status ON tickets(repository_id, status, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_repository_priority ON tickets(repository_id, priority, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_repository_type ON tickets(repository_id, type, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_repository_assignee ON tickets(repository_id, assignee, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_repository_parent ON tickets(repository_id, parent_id, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_repository_due_range ON tickets(repository_id, due_date, archived_at, deleted_at, ticket_id);
CREATE INDEX IF NOT EXISTS tickets_repository_estimate ON tickets(repository_id, estimate, archived_at, deleted_at, ticket_id);

CREATE TABLE IF NOT EXISTS users (
  repository_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  timezone TEXT,
  source TEXT NOT NULL,
  disabled_at TEXT,
  aliases_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, user_id)
);
CREATE INDEX IF NOT EXISTS users_repository_display_name ON users(repository_id, disabled_at, display_name, user_id);
CREATE INDEX IF NOT EXISTS users_repository_email ON users(repository_id, email, user_id);

CREATE TABLE IF NOT EXISTS labels (
  repository_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  archived_at TEXT,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_by_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  label_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, label_id)
);
CREATE INDEX IF NOT EXISTS labels_repository_name ON labels(repository_id, archived_at, name, label_id);

CREATE TABLE IF NOT EXISTS saved_views (
  repository_id TEXT NOT NULL,
  view_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  group_by TEXT NOT NULL,
  pinned INTEGER NOT NULL,
  built_in INTEGER NOT NULL,
  owner_user_id TEXT,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_by_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  view_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, view_id)
);
CREATE INDEX IF NOT EXISTS saved_views_repository_order ON saved_views(repository_id, pinned, built_in, name, view_id);

CREATE TABLE IF NOT EXISTS issue_templates (
  repository_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  active INTEGER NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_by_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  template_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, template_id)
);
CREATE INDEX IF NOT EXISTS issue_templates_repository_kind ON issue_templates(repository_id, active, kind, name, template_id);

CREATE TABLE IF NOT EXISTS ticket_labels (
  repository_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (repository_id, ticket_id, label)
);
CREATE INDEX IF NOT EXISTS ticket_labels_lookup ON ticket_labels(repository_id, label, ticket_id);

CREATE TABLE IF NOT EXISTS ticket_external_links (
  repository_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  source TEXT,
  title TEXT,
  url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_relations (
  repository_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  related_issue_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  PRIMARY KEY (repository_id, ticket_id, related_issue_id, relation_type)
);
CREATE INDEX IF NOT EXISTS ticket_relations_source_lookup ON ticket_relations(repository_id, ticket_id, relation_type, related_issue_id);
CREATE INDEX IF NOT EXISTS ticket_relations_related_lookup ON ticket_relations(repository_id, related_issue_id, relation_type, ticket_id);

CREATE TABLE IF NOT EXISTS records (
  repository_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_date TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_by_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, record_id)
);
CREATE INDEX IF NOT EXISTS records_ticket_created ON records(repository_id, ticket_id, created_at, record_id);
CREATE INDEX IF NOT EXISTS records_ticket_type_created ON records(repository_id, ticket_id, record_type, created_at, record_id);

CREATE TABLE IF NOT EXISTS comments (
  repository_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (repository_id, record_id)
);
CREATE INDEX IF NOT EXISTS comments_ticket_created ON comments(repository_id, ticket_id, created_at, record_id);

CREATE TABLE IF NOT EXISTS commits (
  repository_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  root_tree_id TEXT NOT NULL,
  author_name TEXT,
  author_email TEXT,
  committed_at TEXT,
  committer_name TEXT,
  committer_email TEXT,
  message TEXT,
  sequence INTEGER NOT NULL,
  PRIMARY KEY (repository_id, snapshot_id)
);
CREATE INDEX IF NOT EXISTS commits_repository_sequence ON commits(repository_id, sequence DESC, snapshot_id);

CREATE TABLE IF NOT EXISTS commit_parents (
  repository_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  parent_snapshot_id TEXT NOT NULL,
  PRIMARY KEY (repository_id, snapshot_id, parent_snapshot_id)
);
CREATE INDEX IF NOT EXISTS commit_parents_snapshot ON commit_parents(repository_id, snapshot_id, parent_snapshot_id);

CREATE TABLE IF NOT EXISTS commit_changes (
  repository_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  ticket_id TEXT,
  path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS commit_changes_snapshot_ticket ON commit_changes(repository_id, snapshot_id, ticket_id);
CREATE INDEX IF NOT EXISTS commit_changes_ticket ON commit_changes(repository_id, ticket_id, snapshot_id);

CREATE TABLE IF NOT EXISTS materialization_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  path TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  reason TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS materialization_warnings_snapshot ON materialization_warnings(repository_id, snapshot_id);
CREATE INDEX IF NOT EXISTS materialization_warnings_repository_created ON materialization_warnings(repository_id, created_at, path);

CREATE TABLE IF NOT EXISTS search_documents (
  repository_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (repository_id, document_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  repository_id UNINDEXED,
  document_id UNINDEXED,
  ticket_id UNINDEXED,
  title,
  body
);

${inboxSchemaSql}
${pageProjectionSchemaSql}
`;

export const sharedMetadataSchemaSql = `
CREATE TABLE IF NOT EXISTS users (
  repository_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  timezone TEXT,
  source TEXT NOT NULL,
  disabled_at TEXT,
  aliases_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, user_id)
);
CREATE INDEX IF NOT EXISTS users_repository_display_name ON users(repository_id, disabled_at, display_name, user_id);
CREATE INDEX IF NOT EXISTS users_repository_email ON users(repository_id, email, user_id);

CREATE TABLE IF NOT EXISTS labels (
  repository_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  archived_at TEXT,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_by_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  label_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, label_id)
);
CREATE INDEX IF NOT EXISTS labels_repository_name ON labels(repository_id, archived_at, name, label_id);

CREATE TABLE IF NOT EXISTS saved_views (
  repository_id TEXT NOT NULL,
  view_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  group_by TEXT NOT NULL,
  pinned INTEGER NOT NULL,
  built_in INTEGER NOT NULL,
  owner_user_id TEXT,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_by_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  view_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, view_id)
);
CREATE INDEX IF NOT EXISTS saved_views_repository_order ON saved_views(repository_id, pinned, built_in, name, view_id);

CREATE TABLE IF NOT EXISTS issue_templates (
  repository_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  active INTEGER NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT,
  created_by_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  template_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY (repository_id, template_id)
);
CREATE INDEX IF NOT EXISTS issue_templates_repository_kind ON issue_templates(repository_id, active, kind, name, template_id);
`;
