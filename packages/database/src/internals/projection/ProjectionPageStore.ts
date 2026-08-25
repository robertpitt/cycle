import {
  Actor,
  CommentDocument,
  PageDocument,
  PageFrontmatter,
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
import { Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { DatabaseFailure } from "../../DatabaseErrors.ts";
import { decodeJson, decodeValue, encodeJson } from "./JsonCodec.ts";
import { makeProjectionSql } from "./ProjectionSql.ts";

const PageRowSchema = Schema.Struct({
  archived_at: Schema.NullOr(Schema.String),
  body: Schema.String,
  body_format: Schema.Literal("markdown"),
  created_at: Schema.String,
  frontmatter_json: Schema.String,
  page_id: Schema.String,
  path: Schema.String,
  repository_id: Schema.String,
  revision_id: Schema.String,
  title: Schema.String,
  updated_at: Schema.String,
});
const CommentRowSchema = Schema.Struct({ comment_json: Schema.String });
const PageHistoryRowSchema = Schema.Struct({
  actor_json: Schema.String,
  committed_at: Schema.String,
  message: Schema.NullOr(Schema.String),
  operation: Schema.Literals(["page.archive", "page.create", "page.replace", "page.restore"]),
  page_path: Schema.String,
  parent_ids: Schema.String,
  snapshot_id: Schema.String,
});
const StringList = Schema.Array(Schema.String);
const pageColumns = `
  repository_id, page_id, path, title, body, body_format, frontmatter_json,
  created_at, updated_at, archived_at, revision_id
`;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const cursorPattern = /^page-offset:(\d+)$/u;

export type PageHistoryProjection = {
  readonly actor: PageHistoryEntry["actor"];
  readonly committedAt: string;
  readonly message?: string;
  readonly operation: PageHistoryEntry["operation"];
  readonly pageId: string;
  readonly parentIds: ReadonlyArray<string>;
  readonly path: string;
  readonly repositoryId: string;
  readonly snapshotId: string;
};

export type ProjectionPageStoreShape = {
  readonly clearRepository: (repositoryId: string) => Effect.Effect<void, DatabaseFailure>;
  readonly getComment: (
    repositoryId: string,
    commentId: string,
  ) => Effect.Effect<typeof CommentDocument.Type | null, DatabaseFailure>;
  readonly getPage: (
    repositoryId: string,
    pageId: string,
  ) => Effect.Effect<typeof PageDocument.Type | null, DatabaseFailure>;
  readonly hierarchy: (
    repositoryId: string,
    query?: PageHierarchyQuery,
  ) => Effect.Effect<PageHierarchy, DatabaseFailure>;
  readonly history: (
    repositoryId: string,
    pageId: string,
    options?: { readonly cursor?: string; readonly limit?: number },
  ) => Effect.Effect<PageHistoryPage, DatabaseFailure>;
  readonly listComments: (
    target: CycleResourceRef,
    query?: CommentQuery,
  ) => Effect.Effect<CommentPage, DatabaseFailure>;
  readonly listPages: (
    repositoryId: string,
    query?: PageQuery,
  ) => Effect.Effect<PagePage, DatabaseFailure>;
  readonly resolvePath: (
    repositoryId: string,
    path: string,
  ) => Effect.Effect<typeof PageDocument.Type | null, DatabaseFailure>;
  readonly upsertComment: (
    comment: typeof CommentDocument.Type,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly upsertHistory: (input: PageHistoryProjection) => Effect.Effect<void, DatabaseFailure>;
  readonly upsertPage: (page: typeof PageDocument.Type) => Effect.Effect<void, DatabaseFailure>;
};

export class ProjectionPageStore extends Context.Service<
  ProjectionPageStore,
  ProjectionPageStoreShape
>()("@cycle/database/internals/projection/ProjectionPageStore") {}

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

export const ProjectionPageStoreLive = Layer.effect(
  ProjectionPageStore,
  Effect.gen(function* () {
    const client = yield* SqlClient.SqlClient;
    const sql = makeProjectionSql(client);

    const decodePageRow = Effect.fn("ProjectionPageStore.decodePageRow")(function* (raw: unknown) {
      const row = yield* decodeValue("page row", PageRowSchema, raw);
      const frontmatter = yield* decodeJson(
        "page frontmatter",
        PageFrontmatter,
        row.frontmatter_json,
      );
      return yield* decodeValue("page document", PageDocument, {
        body: row.body,
        bodyFormat: row.body_format,
        frontmatter,
        id: row.page_id,
        path: row.path,
        repositoryId: row.repository_id,
        revisionId: row.revision_id,
      });
    });

    const clearRepository = Effect.fn("ProjectionPageStore.clearRepository")(function* (
      repositoryId: string,
    ) {
      yield* Effect.forEach(
        ["page_history", "resource_comments", "pages"],
        (table) =>
          sql.run(
            `clear Page projection ${table}`,
            `DELETE FROM ${table} WHERE repository_id = ?`,
            [repositoryId],
          ),
        { discard: true },
      );
    });

    const upsertPage = Effect.fn("ProjectionPageStore.upsertPage")(function* (
      page: typeof PageDocument.Type,
    ) {
      const frontmatter = page.frontmatter;
      const [frontmatterJson, createdByJson, updatedByJson, archivedByJson] = yield* Effect.all([
        encodeJson("page frontmatter", PageFrontmatter, frontmatter),
        encodeJson("page created actor", Actor, frontmatter.createdBy),
        encodeJson("page updated actor", Actor, frontmatter.updatedBy),
        frontmatter.archivedBy === undefined
          ? Effect.succeed(null)
          : encodeJson("page archived actor", Actor, frontmatter.archivedBy),
      ]);
      yield* sql.run(
        "upsert Page",
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
          frontmatterJson,
          frontmatter.createdAt,
          createdByJson,
          frontmatter.updatedAt,
          updatedByJson,
          frontmatter.archivedAt ?? null,
          archivedByJson,
          frontmatter.schemaVersion,
          page.revisionId,
        ],
      );
    });

    const getPage = Effect.fn("ProjectionPageStore.getPage")(function* (
      repositoryId: string,
      pageId: string,
    ) {
      const row = yield* sql.get(
        "get Page",
        `SELECT ${pageColumns} FROM pages WHERE repository_id = ? AND page_id = ?`,
        [repositoryId, pageId],
      );
      return row === undefined ? null : yield* decodePageRow(row);
    });

    const resolvePath = Effect.fn("ProjectionPageStore.resolvePath")(function* (
      repositoryId: string,
      path: string,
    ) {
      const row = yield* sql.get(
        "resolve Page path",
        `SELECT ${pageColumns} FROM pages WHERE repository_id = ? AND path = ?`,
        [repositoryId, path],
      );
      return row === undefined ? null : yield* decodePageRow(row);
    });

    const listPages = Effect.fn("ProjectionPageStore.listPages")(function* (
      repositoryId: string,
      query: PageQuery = {},
    ) {
      const rows = yield* sql.all(
        "list Pages",
        `SELECT ${pageColumns} FROM pages
         WHERE repository_id = ? ${archivedSql(query.archived)}
         ORDER BY path ASC, page_id ASC`,
        [repositoryId],
      );
      const decoded = yield* Effect.forEach(rows, decodePageRow);
      const directory = query.directory ?? "";
      const filtered = decoded.filter((page) =>
        withinDirectory(page.path, directory, query.recursive ?? false),
      );
      const limit = normalizeLimit(query.limit);
      const offset = decodeCursor(query.cursor);
      const page = filtered.slice(offset, offset + limit + 1);
      return {
        entries: page.slice(0, limit).map(pageSummary),
        ...(page.length > limit ? { nextCursor: encodeCursor(offset + limit) } : {}),
      };
    });

    const hierarchy = Effect.fn("ProjectionPageStore.hierarchy")(function* (
      repositoryId: string,
      query: PageHierarchyQuery = {},
    ) {
      const rows = yield* sql.all(
        "Page hierarchy",
        `SELECT ${pageColumns} FROM pages
         WHERE repository_id = ? ${archivedSql(query.archived)}
         ORDER BY path ASC, page_id ASC`,
        [repositoryId],
      );
      const pages = yield* Effect.forEach(rows, decodePageRow);
      const rootPath = query.directory ?? "";
      const rootName = rootPath.split("/").at(-1) ?? "";
      const root = makeDirectory(rootName, rootPath);
      const recursive = query.recursive ?? true;

      for (const page of pages) {
        const prefix = rootPath.length === 0 ? "" : `${rootPath}/`;
        if (!page.path.startsWith(prefix) || page.path.length === prefix.length) continue;
        const segments = page.path.slice(prefix.length).split("/");
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

        const summary = pageSummary(page);
        if (fileName === "index.md") directory.cover = summary;
        else directory.pages.push(summary);
      }

      return { root: freezeDirectory(root, recursive ? Number.POSITIVE_INFINITY : 1) };
    });

    const upsertComment = Effect.fn("ProjectionPageStore.upsertComment")(function* (
      comment: typeof CommentDocument.Type,
    ) {
      const [createdByJson, commentJson] = yield* Effect.all([
        encodeJson("comment actor", Actor, comment.createdBy),
        encodeJson("comment document", CommentDocument, comment),
      ]);
      yield* sql.run(
        "upsert resource comment",
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
          createdByJson,
          comment.schemaVersion,
          commentJson,
        ],
      );
    });

    const listComments = Effect.fn("ProjectionPageStore.listComments")(function* (
      target: CycleResourceRef,
      query: CommentQuery = {},
    ) {
      const limit = normalizeLimit(query.limit);
      const offset = decodeCursor(query.cursor);
      const rows = yield* sql.all(
        "list resource comments",
        `SELECT comment_json FROM resource_comments
         WHERE repository_id = ? AND resource_kind = ? AND resource_id = ?
         ORDER BY created_at ASC, rowid ASC
         LIMIT ? OFFSET ?`,
        [target.repositoryId, target.resourceKind, target.resourceId, limit + 1, offset],
      );
      const comments = yield* Effect.forEach(rows.slice(0, limit), (raw) =>
        decodeValue("comment row", CommentRowSchema, raw).pipe(
          Effect.flatMap((row) =>
            decodeJson("comment document", CommentDocument, row.comment_json),
          ),
        ),
      );
      return {
        entries: comments,
        ...(rows.length > limit ? { nextCursor: encodeCursor(offset + limit) } : {}),
      };
    });

    const getComment = Effect.fn("ProjectionPageStore.getComment")(function* (
      repositoryId: string,
      commentId: string,
    ) {
      const raw = yield* sql.get(
        "get resource comment",
        "SELECT comment_json FROM resource_comments WHERE repository_id = ? AND comment_id = ?",
        [repositoryId, commentId],
      );
      if (raw === undefined) return null;
      const row = yield* decodeValue("comment row", CommentRowSchema, raw);
      return yield* decodeJson("comment document", CommentDocument, row.comment_json);
    });

    const upsertHistory = Effect.fn("ProjectionPageStore.upsertHistory")(function* (
      input: PageHistoryProjection,
    ) {
      const [actorJson, parentIdsJson] = yield* Effect.all([
        encodeJson("Page history actor", Actor, input.actor),
        encodeJson("Page history parents", StringList, input.parentIds),
      ]);
      yield* sql.run(
        "upsert Page history",
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
          actorJson,
          input.committedAt,
          parentIdsJson,
          input.message ?? null,
        ],
      );
    });

    const history = Effect.fn("ProjectionPageStore.history")(function* (
      repositoryId: string,
      pageId: string,
      options: { readonly cursor?: string; readonly limit?: number } = {},
    ) {
      const limit = normalizeLimit(options.limit);
      const offset = decodeCursor(options.cursor);
      const rows = yield* sql.all(
        "Page history",
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
      const entries = yield* Effect.forEach(rows.slice(0, limit), (raw) =>
        Effect.gen(function* () {
          const row = yield* decodeValue("Page history row", PageHistoryRowSchema, raw);
          const [actor, parentIds] = yield* Effect.all([
            decodeJson("Page history actor", Actor, row.actor_json),
            decodeJson("Page history parents", StringList, row.parent_ids),
          ]);
          return {
            actor,
            committedAt: row.committed_at,
            ...(row.message === null ? {} : { message: row.message }),
            operation: row.operation,
            parentIds,
            path: row.page_path as PageHistoryEntry["path"],
            snapshotId: row.snapshot_id,
          };
        }),
      );
      return {
        entries,
        ...(rows.length > limit ? { nextCursor: encodeCursor(offset + limit) } : {}),
      };
    });

    return ProjectionPageStore.of({
      clearRepository,
      getComment,
      getPage,
      hierarchy,
      history,
      listComments,
      listPages,
      resolvePath,
      upsertComment,
      upsertHistory,
      upsertPage,
    });
  }),
);
