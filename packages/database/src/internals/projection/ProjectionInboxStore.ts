import { Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { DatabaseSqliteError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import type {
  InboxEntry,
  InboxItem,
  InboxMutationInput,
  InboxMutationResult,
  InboxPage,
  InboxQuery,
  InboxSourceState,
  InboxStatus,
  InboxSummary,
} from "../../domain/index.ts";
import { decodeCursor, encodeCursor } from "./CursorCodec.ts";
import { decodeJson, decodeValue } from "./JsonCodec.ts";
import { makeProjectionSql } from "./ProjectionSql.ts";
import { placeholders, type SqlValue } from "./TicketQueryPlan.ts";

const NullOrString = Schema.NullOr(Schema.String);
const InboxReasonSchema = Schema.Literals([
  "assigned",
  "comment_assigned",
  "comment_created",
  "mention",
]);
const InboxStatusSchema = Schema.Literals(["archived", "read", "snoozed", "unread"]);
const InboxListRowSchema = Schema.Struct({
  actor_email: NullOrString,
  actor_name: NullOrString,
  archived_at: NullOrString,
  body_excerpt: NullOrString,
  created_at: Schema.String,
  deleted_at: NullOrString,
  event_path: Schema.String,
  item_id: Schema.String,
  local_archived_at: NullOrString,
  local_read_at: NullOrString,
  local_snoozed_until: NullOrString,
  local_updated_at: NullOrString,
  metadata_json: NullOrString,
  reason: InboxReasonSchema,
  record_id: NullOrString,
  repository_id: Schema.String,
  sequence: Schema.Int,
  snapshot_id: Schema.String,
  status: InboxStatusSchema,
  ticket_id: Schema.String,
  title: Schema.String,
  user_id: Schema.String,
});
const SnapshotRowSchema = Schema.Struct({
  active_snapshot_id: NullOrString,
  repository_id: Schema.String,
});
const RepositorySummaryRowSchema = Schema.Struct({
  active_snapshot_id: NullOrString,
  repository_id: Schema.String,
  sync_status: Schema.Literals(["degraded", "empty", "failed", "ready", "syncing"]),
  warning_count: Schema.Int,
});
const SummaryRowSchema = Schema.Struct({
  count: Schema.Int,
  latest: NullOrString,
  reason: InboxReasonSchema,
  repository_id: Schema.String,
  status: InboxStatusSchema,
});
const ItemIdRowSchema = Schema.Struct({ item_id: Schema.String, repository_id: Schema.String });
const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const normalizeLimit = (limit: number | undefined): number =>
  Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));

type InboxFilter = { readonly params: ReadonlyArray<SqlValue>; readonly where: string };

const inboxFilters = (query: InboxQuery, includeStatusFilter: boolean): InboxFilter => {
  const filters = ["i.user_id = ?"];
  const params: Array<SqlValue> = [query.userId];
  if (query.repositoryIds !== undefined && query.repositoryIds.length > 0) {
    filters.push(`i.repository_id IN (${placeholders(query.repositoryIds.length)})`);
    params.push(...query.repositoryIds);
  }
  if (query.reason !== undefined) {
    filters.push("i.reason = ?");
    params.push(query.reason);
  }
  if (query.ticketId !== undefined) {
    filters.push("i.ticket_id = ?");
    params.push(query.ticketId);
  }
  if (query.createdAfter !== undefined) {
    filters.push("i.created_at >= ?");
    params.push(query.createdAfter);
  }
  if (query.createdBefore !== undefined) {
    filters.push("i.created_at <= ?");
    params.push(query.createdBefore);
  }
  if (query.includeSourceInactive !== true) {
    filters.push("t.archived_at IS NULL", "t.deleted_at IS NULL");
  }
  if (includeStatusFilter && query.status !== "all") {
    filters.push("COALESCE(s.status, 'unread') = ?");
    params.push(query.status ?? "unread");
  }
  return { params, where: filters.join(" AND ") };
};

export type ProjectionInboxStoreShape = {
  readonly archive: (
    input: InboxMutationInput,
    now: string,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly list: (query: InboxQuery) => Effect.Effect<InboxPage, DatabaseFailure>;
  readonly markRead: (
    input: InboxMutationInput,
    now: string,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly markUnread: (
    input: InboxMutationInput,
    now: string,
  ) => Effect.Effect<InboxMutationResult, DatabaseFailure>;
  readonly summary: (query: InboxQuery) => Effect.Effect<InboxSummary, DatabaseFailure>;
  readonly upsert: (item: InboxItem) => Effect.Effect<void, DatabaseFailure>;
};

export class ProjectionInboxStore extends Context.Service<
  ProjectionInboxStore,
  ProjectionInboxStoreShape
>()("@cycle/database/internals/projection/ProjectionInboxStore") {}

export const ProjectionInboxStoreLive = Layer.effect(
  ProjectionInboxStore,
  Effect.gen(function* () {
    const client = yield* SqlClient.SqlClient;
    const sql = makeProjectionSql(client);

    const upsert = Effect.fn("ProjectionInboxStore.upsert")(function* (item: InboxItem) {
      yield* sql.run(
        "upsert inbox item",
        `INSERT INTO inbox_items (
          repository_id, user_id, item_id, snapshot_id, sequence, event_path, ticket_id,
          record_id, reason, actor_name, actor_email, created_at, title, body_excerpt,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, user_id, item_id) DO UPDATE SET
          snapshot_id = excluded.snapshot_id,
          sequence = excluded.sequence,
          event_path = excluded.event_path,
          ticket_id = excluded.ticket_id,
          record_id = excluded.record_id,
          reason = excluded.reason,
          actor_name = excluded.actor_name,
          actor_email = excluded.actor_email,
          created_at = excluded.created_at,
          title = excluded.title,
          body_excerpt = excluded.body_excerpt,
          metadata_json = excluded.metadata_json`,
        [
          item.repositoryId,
          item.userId,
          item.itemId,
          item.snapshotId,
          item.sequence,
          item.eventPath,
          item.ticketId,
          item.recordId ?? null,
          item.reason,
          item.actorName ?? null,
          item.actorEmail ?? null,
          item.createdAt,
          item.title,
          item.bodyExcerpt ?? null,
          item.metadataJson ?? null,
        ],
      );
    });

    const decodeInboxEntry = Effect.fn("ProjectionInboxStore.decodeInboxEntry")(function* (
      raw: unknown,
    ) {
      const row = yield* decodeValue("inbox row", InboxListRowSchema, raw);
      const metadata =
        row.metadata_json === null
          ? undefined
          : yield* decodeJson("inbox metadata", JsonRecord, row.metadata_json);
      const sourceState: InboxSourceState =
        row.deleted_at !== null
          ? "source_deleted"
          : row.archived_at !== null
            ? "source_archived"
            : "active";
      return {
        actor: {
          ...(row.actor_email === null ? {} : { email: row.actor_email }),
          ...(row.actor_name === null ? {} : { name: row.actor_name }),
        },
        ...(row.body_excerpt === null ? {} : { bodyExcerpt: row.body_excerpt }),
        createdAt: row.created_at,
        eventPath: row.event_path,
        itemId: row.item_id,
        ...(metadata === undefined ? {} : { metadata }),
        reason: row.reason,
        ...(row.record_id === null ? {} : { recordId: row.record_id }),
        repositoryId: row.repository_id,
        sequence: row.sequence,
        snapshotId: row.snapshot_id,
        sourceState,
        status: row.status,
        ticketId: row.ticket_id,
        title: row.title,
        ...(row.local_updated_at === null ? {} : { updatedAt: row.local_updated_at }),
      } satisfies InboxEntry;
    });

    const activeSnapshotIds = Effect.fn("ProjectionInboxStore.activeSnapshotIds")(function* (
      repositoryIds: ReadonlyArray<string> | undefined,
    ) {
      const rows = yield* sql.all(
        "inbox active snapshot ids",
        repositoryIds !== undefined && repositoryIds.length > 0
          ? `SELECT repository_id, active_snapshot_id
               FROM repositories
               WHERE repository_id IN (${placeholders(repositoryIds.length)})
               ORDER BY repository_id ASC`
          : `SELECT repository_id, active_snapshot_id
               FROM repositories
               ORDER BY repository_id ASC`,
        repositoryIds !== undefined && repositoryIds.length > 0 ? repositoryIds : [],
      );
      const decoded = yield* Effect.forEach(rows, (row) =>
        decodeValue("inbox snapshot row", SnapshotRowSchema, row),
      );
      return Object.fromEntries(decoded.map((row) => [row.repository_id, row.active_snapshot_id]));
    });

    const repositorySummaries = Effect.fn("ProjectionInboxStore.repositorySummaries")(function* (
      repositoryIds: ReadonlyArray<string> | undefined,
    ) {
      const rows = yield* sql.all(
        "inbox repository summaries",
        repositoryIds !== undefined && repositoryIds.length > 0
          ? `SELECT repository_id, active_snapshot_id, sync_status, warning_count
               FROM repositories
               WHERE repository_id IN (${placeholders(repositoryIds.length)})
               ORDER BY repository_id ASC`
          : `SELECT repository_id, active_snapshot_id, sync_status, warning_count
               FROM repositories
               ORDER BY repository_id ASC`,
        repositoryIds !== undefined && repositoryIds.length > 0 ? repositoryIds : [],
      );
      return yield* Effect.forEach(rows, (raw) =>
        decodeValue("inbox repository summary row", RepositorySummaryRowSchema, raw).pipe(
          Effect.map((row) => ({
            activeSnapshotId: row.active_snapshot_id,
            repositoryId: row.repository_id,
            status: row.sync_status,
            warningCount: row.warning_count,
          })),
        ),
      );
    });

    const list = Effect.fn("ProjectionInboxStore.list")(function* (query: InboxQuery) {
      const limit = normalizeLimit(query.limit);
      const cursor = yield* decodeCursor(query.cursor);
      const filtered = inboxFilters(query, true);
      const rows = yield* sql.all(
        "list inbox",
        `SELECT
           i.*,
           COALESCE(s.status, 'unread') AS status,
           s.read_at AS local_read_at,
           s.archived_at AS local_archived_at,
           s.snoozed_until AS local_snoozed_until,
           s.updated_at AS local_updated_at,
           t.archived_at,
           t.deleted_at
         FROM inbox_items i
         JOIN tickets t
           ON t.repository_id = i.repository_id AND t.ticket_id = i.ticket_id
         LEFT JOIN inbox_item_state s
           ON s.repository_id = i.repository_id
          AND s.user_id = i.user_id
          AND s.item_id = i.item_id
         WHERE ${filtered.where}
         ORDER BY i.created_at DESC, i.sequence DESC, i.item_id ASC
         LIMIT ? OFFSET ?`,
        [...filtered.params, limit + 1, cursor.offset],
      );
      const [entries, snapshots] = yield* Effect.all([
        Effect.forEach(rows.slice(0, limit), decodeInboxEntry),
        activeSnapshotIds(query.repositoryIds),
      ]);
      return {
        activeSnapshotIds: snapshots,
        entries,
        ...(rows.length > limit ? { nextCursor: encodeCursor(cursor.offset + limit) } : {}),
      };
    });

    const summary = Effect.fn("ProjectionInboxStore.summary")(function* (query: InboxQuery) {
      const filtered = inboxFilters(query, false);
      const rawRows = yield* sql.all(
        "inbox summary",
        `SELECT
           i.repository_id,
           i.reason,
           COALESCE(s.status, 'unread') AS status,
           COUNT(*) AS count,
           MAX(i.created_at) AS latest
         FROM inbox_items i
         JOIN tickets t
           ON t.repository_id = i.repository_id AND t.ticket_id = i.ticket_id
         LEFT JOIN inbox_item_state s
           ON s.repository_id = i.repository_id
          AND s.user_id = i.user_id
          AND s.item_id = i.item_id
         WHERE ${filtered.where}
         GROUP BY i.repository_id, i.reason, COALESCE(s.status, 'unread')`,
        filtered.params,
      );
      const rows = yield* Effect.forEach(rawRows, (row) =>
        decodeValue("inbox summary row", SummaryRowSchema, row),
      );
      const byRepository: Record<string, number> = {};
      const byReason: Record<string, number> = {};
      let unreadCount = 0;
      let readCount = 0;
      let archivedCount = 0;
      let latestItemTimestamp: string | undefined;
      for (const row of rows) {
        byRepository[row.repository_id] = (byRepository[row.repository_id] ?? 0) + row.count;
        byReason[row.reason] = (byReason[row.reason] ?? 0) + row.count;
        if (row.status === "unread") unreadCount += row.count;
        if (row.status === "read") readCount += row.count;
        if (row.status === "archived") archivedCount += row.count;
        if (
          row.latest !== null &&
          (latestItemTimestamp === undefined || row.latest > latestItemTimestamp)
        ) {
          latestItemTimestamp = row.latest;
        }
      }
      return {
        archivedCount,
        byReason,
        byRepository,
        ...(latestItemTimestamp === undefined ? {} : { latestItemTimestamp }),
        readCount,
        repositories: yield* repositorySummaries(query.repositoryIds),
        unreadCount,
      };
    });

    const setStatus = Effect.fn("ProjectionInboxStore.setStatus")(function* (
      input: InboxMutationInput,
      status: InboxStatus,
      now: string,
    ) {
      if (input.itemIds.length === 0) {
        return { matchedCount: 0, missingItemIds: [], status, updatedCount: 0 };
      }
      return yield* sql.transaction(
        Effect.gen(function* () {
          const rawRows = yield* sql.all(
            "find inbox items for status update",
            `SELECT repository_id, item_id
               FROM inbox_items
               WHERE user_id = ? AND item_id IN (${placeholders(input.itemIds.length)})
               ORDER BY repository_id ASC, item_id ASC`,
            [input.userId, ...input.itemIds],
          );
          const rows = yield* Effect.forEach(rawRows, (row) =>
            decodeValue("inbox item id row", ItemIdRowSchema, row),
          );
          const foundIds = new Set(rows.map((row) => row.item_id));
          const missingItemIds = input.itemIds.filter((itemId) => !foundIds.has(itemId));
          if (missingItemIds.length > 0 && input.allowMissing !== true) {
            return yield* new DatabaseSqliteError({
              message: `unknown inbox item ids: ${missingItemIds.join(", ")}`,
              operation: "setInboxItemStatus",
            });
          }
          yield* Effect.forEach(
            rows,
            (row) =>
              status === "unread"
                ? sql.run(
                    "mark inbox item unread",
                    `DELETE FROM inbox_item_state
                       WHERE repository_id = ? AND user_id = ? AND item_id = ?`,
                    [row.repository_id, input.userId, row.item_id],
                  )
                : sql.run(
                    "set inbox item status",
                    `INSERT INTO inbox_item_state (
                      repository_id, user_id, item_id, status, read_at, archived_at,
                      snoozed_until, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
                    ON CONFLICT(repository_id, user_id, item_id) DO UPDATE SET
                      status = excluded.status,
                      read_at = CASE
                        WHEN excluded.status = 'read' AND inbox_item_state.read_at IS NOT NULL
                          THEN inbox_item_state.read_at
                        ELSE excluded.read_at
                      END,
                      archived_at = CASE
                        WHEN excluded.status = 'archived' AND inbox_item_state.archived_at IS NOT NULL
                          THEN inbox_item_state.archived_at
                        ELSE excluded.archived_at
                      END,
                      snoozed_until = excluded.snoozed_until,
                      updated_at = excluded.updated_at`,
                    [
                      row.repository_id,
                      input.userId,
                      row.item_id,
                      status,
                      status === "read" ? now : null,
                      status === "archived" ? now : null,
                      now,
                    ],
                  ),
            { discard: true },
          );
          return {
            matchedCount: rows.length,
            missingItemIds,
            status,
            updatedCount: rows.length,
          };
        }),
      );
    });

    return ProjectionInboxStore.of({
      archive: (input, now) => setStatus(input, "archived", now),
      list,
      markRead: (input, now) => setStatus(input, "read", now),
      markUnread: (input, now) => setStatus(input, "unread", now),
      summary,
      upsert,
    });
  }),
);
