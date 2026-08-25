export const pageProjectionSchemaSql = `
CREATE TABLE IF NOT EXISTS pages (
  repository_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  path TEXT NOT NULL,
  path_segments_json TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  body_format TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_json TEXT NOT NULL,
  archived_at TEXT,
  archived_by_json TEXT,
  schema_version INTEGER NOT NULL,
  revision_id TEXT NOT NULL,
  PRIMARY KEY (repository_id, page_id),
  UNIQUE (repository_id, path)
);
CREATE INDEX IF NOT EXISTS pages_repository_path ON pages(repository_id, path, page_id);
CREATE INDEX IF NOT EXISTS pages_repository_archived_path ON pages(repository_id, archived_at, path, page_id);

CREATE TABLE IF NOT EXISTS resource_comments (
  repository_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  resource_kind TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  body TEXT NOT NULL,
  body_format TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  comment_json TEXT NOT NULL,
  PRIMARY KEY (repository_id, comment_id)
);
CREATE INDEX IF NOT EXISTS resource_comments_target_created
  ON resource_comments(repository_id, resource_kind, resource_id, created_at, comment_id);

CREATE TABLE IF NOT EXISTS page_history (
  repository_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  page_path TEXT NOT NULL,
  actor_json TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  parent_ids_json TEXT NOT NULL,
  message TEXT,
  PRIMARY KEY (repository_id, page_id, snapshot_id)
);
CREATE INDEX IF NOT EXISTS page_history_page_created
  ON page_history(repository_id, page_id, committed_at DESC, snapshot_id);
`;
