import {
  CommentDocument,
  PageDocument,
  type CommentPage,
  type CommentQuery,
  type CycleResourceRef,
  type PageHierarchy,
  type PageHierarchyDirectory,
  type PageHierarchyQuery,
  type PageHistoryEntry,
  type PageHistoryPage,
  type PagePage,
  type PageQuery,
  type PageSummary,
} from "@cycle/contracts/schemas";
import { Schema } from "effect";

export type PageProjectionDatabase = {
  readonly all: <A extends object = Record<string, unknown>>(
    source: string,
    params?: ReadonlyArray<unknown>,
  ) => ReadonlyArray<A>;
  readonly get: <A extends object = Record<string, unknown>>(
    source: string,
    params?: ReadonlyArray<unknown>,
  ) => A | undefined;
  readonly run: (source: string, params?: ReadonlyArray<unknown>) => unknown;
};

type PageRow = {
  readonly archived_at: string | null;
  readonly body: string;
  readonly body_format: "markdown";
  readonly created_at: string;
  readonly frontmatter_json: string;
  readonly page_id: string;
  readonly path: string;
  readonly repository_id: string;
  readonly revision_id: string;
  readonly title: string;
  readonly updated_at: string;
};

type CommentRow = {
  readonly comment_json: string;
};

type PageHistoryRow = {
  readonly actor_json: string;
  readonly committed_at: string;
  readonly message: string | null;
  readonly operation: PageHistoryEntry["operation"];
  readonly page_path: string;
  readonly parent_ids: string;
  readonly snapshot_id: string;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const cursorPattern = /^page-offset:(\d+)$/u;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeLimit = (limit: number | undefined): number =>
  Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT)));

const decodeCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) return 0;

  const match = cursorPattern.exec(cursor);
  if (match === null) return 0;

  const offset = Number(match[1]);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
};

const encodeCursor = (offset: number): string => `page-offset:${offset}`;

const commentFromJson = (value: string): typeof CommentDocument.Type =>
  Schema.decodeUnknownSync(CommentDocument)(JSON.parse(value));

const pageFromRow = (row: PageRow): typeof PageDocument.Type =>
  Schema.decodeUnknownSync(PageDocument)({
    body: row.body,
    bodyFormat: row.body_format,
    frontmatter: JSON.parse(row.frontmatter_json),
    id: row.page_id,
    path: row.path,
    repositoryId: row.repository_id,
    revisionId: row.revision_id,
  });

export const pageSummary = (page: typeof PageDocument.Type): PageSummary => ({
  archived: page.frontmatter.archivedAt !== undefined,
  ...(page.frontmatter.archivedAt === undefined ? {} : { archivedAt: page.frontmatter.archivedAt }),
  createdAt: page.frontmatter.createdAt,
  id: page.id,
  path: page.path,
  repositoryId: page.repositoryId,
  revisionId: page.revisionId,
  title: page.frontmatter.title,
  updatedAt: page.frontmatter.updatedAt,
});

const archivedSql = (archived: PageQuery["archived"] | PageHierarchyQuery["archived"]): string =>
  archived === "only"
    ? "AND archived_at IS NOT NULL"
    : archived === "include"
      ? ""
      : "AND archived_at IS NULL";

const withinDirectory = (path: string, directory: string, recursive: boolean): boolean => {
  const prefix = directory.length === 0 ? "" : `${directory}/`;

  if (!path.startsWith(prefix)) return false;

  const relative = path.slice(prefix.length);
  return relative.length > 0 && (recursive || !relative.includes("/"));
};

type MutableDirectory = {
  cover?: PageSummary;
  readonly directories: Map<string, MutableDirectory>;
  readonly name: string;
  readonly pages: Array<PageSummary>;
  readonly path: string;
};

const makeDirectory = (name: string, path: string): MutableDirectory => ({
  directories: new Map(),
  name,
  pages: [],
  path,
});

const freezeDirectory = (
  directory: MutableDirectory,
  remainingDepth = Number.POSITIVE_INFINITY,
): PageHierarchyDirectory => ({
  ...(directory.cover === undefined ? {} : { cover: directory.cover }),
  directories:
    remainingDepth <= 0
      ? []
      : [...directory.directories.values()]
          .sort((left, right) => compareText(left.name, right.name))
          .map((child) => freezeDirectory(child, remainingDepth - 1)),
  name: directory.name,
  pages: directory.pages.sort((left, right) => compareText(left.path, right.path)),
  path: directory.path as PageHierarchyDirectory["path"],
});

export class PageProjection {
  private readonly db: PageProjectionDatabase;

  constructor(db: PageProjectionDatabase) {
    this.db = db;
  }

  clearRepository(repositoryId: string): void {
    for (const table of ["page_history", "resource_comments", "pages"]) {
      this.db.run(`DELETE FROM ${table} WHERE repository_id = ?`, [repositoryId]);
    }
  }

  upsertPage(page: typeof PageDocument.Type): void {
    const frontmatter = page.frontmatter;

    this.db.run(
      `INSERT INTO pages (
          repository_id, page_id, path, path_segments_json, title, body, body_format,
          frontmatter_json, created_at, created_by_json, updated_at, updated_by_json,
          archived_at, archived_by_json, schema_version, revision_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, page_id) DO UPDATE SET
          path = excluded.path,
          path_segments_json = excluded.path_segments_json,
          title = excluded.title,
          body = excluded.body,
          body_format = excluded.body_format,
          frontmatter_json = excluded.frontmatter_json,
          created_at = excluded.created_at,
          created_by_json = excluded.created_by_json,
          updated_at = excluded.updated_at,
          updated_by_json = excluded.updated_by_json,
          archived_at = excluded.archived_at,
          archived_by_json = excluded.archived_by_json,
          schema_version = excluded.schema_version,
          revision_id = excluded.revision_id`,
      [
        page.repositoryId,
        page.id,
        page.path,
        JSON.stringify(page.path.split("/")),
        frontmatter.title,
        page.body,
        page.bodyFormat,
        JSON.stringify(frontmatter),
        frontmatter.createdAt,
        JSON.stringify(frontmatter.createdBy),
        frontmatter.updatedAt,
        JSON.stringify(frontmatter.updatedBy),
        frontmatter.archivedAt ?? null,
        frontmatter.archivedBy === undefined ? null : JSON.stringify(frontmatter.archivedBy),
        frontmatter.schemaVersion,
        page.revisionId,
      ],
    );
  }

  getPage(repositoryId: string, pageId: string): typeof PageDocument.Type | null {
    const row = this.db.get<PageRow>(
      "SELECT * FROM pages WHERE repository_id = ? AND page_id = ?",
      [repositoryId, pageId],
    );

    return row === undefined ? null : pageFromRow(row);
  }

  resolvePath(repositoryId: string, path: string): typeof PageDocument.Type | null {
    const row = this.db.get<PageRow>("SELECT * FROM pages WHERE repository_id = ? AND path = ?", [
      repositoryId,
      path,
    ]);

    return row === undefined ? null : pageFromRow(row);
  }

  listPages(repositoryId: string, query: PageQuery = {}): PagePage {
    const rows = this.db.all<PageRow>(
      `SELECT * FROM pages
       WHERE repository_id = ? ${archivedSql(query.archived)}
       ORDER BY path ASC, page_id ASC`,
      [repositoryId],
    );
    const directory = query.directory ?? "";
    const filtered = rows.filter((row) =>
      withinDirectory(row.path, directory, query.recursive ?? false),
    );
    const limit = normalizeLimit(query.limit);
    const offset = decodeCursor(query.cursor);
    const page = filtered.slice(offset, offset + limit + 1);

    return {
      entries: page.slice(0, limit).map((row) => pageSummary(pageFromRow(row))),
      ...(page.length > limit ? { nextCursor: encodeCursor(offset + limit) } : {}),
    };
  }

  hierarchy(repositoryId: string, query: PageHierarchyQuery = {}): PageHierarchy {
    const rows = this.db.all<PageRow>(
      `SELECT * FROM pages
       WHERE repository_id = ? ${archivedSql(query.archived)}
       ORDER BY path ASC, page_id ASC`,
      [repositoryId],
    );
    const rootPath = query.directory ?? "";
    const rootName = rootPath.split("/").at(-1) ?? "";
    const root = makeDirectory(rootName, rootPath);
    const recursive = query.recursive ?? true;

    for (const row of rows) {
      const prefix = rootPath.length === 0 ? "" : `${rootPath}/`;
      if (!row.path.startsWith(prefix) || row.path.length === prefix.length) continue;
      const segments = row.path.slice(prefix.length).split("/");
      const fileName = segments.pop();
      if (fileName === undefined) continue;

      let directory = root;
      let directoryPath = rootPath;
      for (const segment of segments) {
        directoryPath = directoryPath.length === 0 ? segment : `${directoryPath}/${segment}`;
        const child = directory.directories.get(segment) ?? makeDirectory(segment, directoryPath);
        directory.directories.set(segment, child);
        directory = child;
      }

      const summary = pageSummary(pageFromRow(row));
      if (fileName === "index.md") directory.cover = summary;
      else directory.pages.push(summary);
    }

    return { root: freezeDirectory(root, recursive ? Number.POSITIVE_INFINITY : 1) };
  }

  upsertComment(comment: typeof CommentDocument.Type): void {
    this.db.run(
      `INSERT INTO resource_comments (
          repository_id, comment_id, resource_kind, resource_id, body, body_format,
          created_at, created_by_json, schema_version, comment_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, comment_id) DO UPDATE SET
          resource_kind = excluded.resource_kind,
          resource_id = excluded.resource_id,
          body = excluded.body,
          body_format = excluded.body_format,
          created_at = excluded.created_at,
          created_by_json = excluded.created_by_json,
          schema_version = excluded.schema_version,
          comment_json = excluded.comment_json`,
      [
        comment.repositoryId,
        comment.id,
        comment.target.resourceKind,
        comment.target.resourceId,
        comment.body,
        comment.bodyFormat,
        comment.createdAt,
        JSON.stringify(comment.createdBy),
        comment.schemaVersion,
        JSON.stringify(comment),
      ],
    );
  }

  listComments(target: CycleResourceRef, query: CommentQuery = {}): CommentPage {
    const limit = normalizeLimit(query.limit);
    const offset = decodeCursor(query.cursor);
    const rows = this.db.all<CommentRow>(
      `SELECT comment_json FROM resource_comments
       WHERE repository_id = ? AND resource_kind = ? AND resource_id = ?
       ORDER BY created_at ASC, comment_id ASC
       LIMIT ? OFFSET ?`,
      [target.repositoryId, target.resourceKind, target.resourceId, limit + 1, offset],
    );

    return {
      entries: rows.slice(0, limit).map((row) => commentFromJson(row.comment_json)),
      ...(rows.length > limit ? { nextCursor: encodeCursor(offset + limit) } : {}),
    };
  }

  getComment(repositoryId: string, commentId: string): typeof CommentDocument.Type | null {
    const row = this.db.get<CommentRow>(
      "SELECT comment_json FROM resource_comments WHERE repository_id = ? AND comment_id = ?",
      [repositoryId, commentId],
    );

    return row === undefined ? null : commentFromJson(row.comment_json);
  }

  upsertHistory(input: {
    readonly actor: PageHistoryEntry["actor"];
    readonly committedAt: string;
    readonly message?: string;
    readonly operation: PageHistoryEntry["operation"];
    readonly pageId: string;
    readonly parentIds: ReadonlyArray<string>;
    readonly path: string;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }): void {
    this.db.run(
      `INSERT INTO page_history (
          repository_id, page_id, snapshot_id, operation, page_path, actor_json,
          committed_at, parent_ids_json, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, page_id, snapshot_id) DO UPDATE SET
          operation = excluded.operation,
          page_path = excluded.page_path,
          actor_json = excluded.actor_json,
          committed_at = excluded.committed_at,
          parent_ids_json = excluded.parent_ids_json,
          message = excluded.message`,
      [
        input.repositoryId,
        input.pageId,
        input.snapshotId,
        input.operation,
        input.path,
        JSON.stringify(input.actor),
        input.committedAt,
        JSON.stringify(input.parentIds),
        input.message ?? null,
      ],
    );
  }

  history(
    repositoryId: string,
    pageId: string,
    options: { readonly cursor?: string; readonly limit?: number } = {},
  ): PageHistoryPage {
    const limit = normalizeLimit(options.limit);
    const offset = decodeCursor(options.cursor);
    const rows = this.db.all<PageHistoryRow>(
      `SELECT ph.snapshot_id, ph.operation, ph.page_path, ph.actor_json, ph.committed_at,
              ph.parent_ids_json AS parent_ids, ph.message
       FROM page_history ph
       JOIN commits c
         ON c.repository_id = ph.repository_id AND c.snapshot_id = ph.snapshot_id
       WHERE ph.repository_id = ? AND ph.page_id = ?
       ORDER BY c.sequence DESC, ph.snapshot_id ASC
       LIMIT ? OFFSET ?`,
      [repositoryId, pageId, limit + 1, offset],
    );

    return {
      entries: rows.slice(0, limit).map((row) => ({
        actor: JSON.parse(row.actor_json) as PageHistoryEntry["actor"],
        committedAt: row.committed_at,
        ...(row.message === null ? {} : { message: row.message }),
        operation: row.operation,
        parentIds: JSON.parse(row.parent_ids) as ReadonlyArray<string>,
        path: row.page_path as PageHistoryEntry["path"],
        snapshotId: row.snapshot_id,
      })),
      ...(rows.length > limit ? { nextCursor: encodeCursor(offset + limit) } : {}),
    };
  }
}

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
