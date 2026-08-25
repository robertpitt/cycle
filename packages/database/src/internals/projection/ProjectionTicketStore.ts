import { Context, Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { DatabaseFailure } from "../../DatabaseErrors.ts";
import {
  normalizeKey,
  type HistoryPage,
  type LinkedRecord,
  type RecordPage,
  type RecordQuery,
  type RepositoryHistoryQuery,
  type SearchTicketsQuery,
  type TicketDocument,
  type TicketPage,
  type TicketQuery,
  type TicketSearchPage,
} from "../../domain/index.ts";
import { decodeCursor, encodeCursor } from "./CursorCodec.ts";
import { ProjectionPageStore } from "./ProjectionPageStore.ts";
import { makeProjectionSql } from "./ProjectionSql.ts";
import { decodeHistoryRow, decodeRecordRow, decodeTicketRow } from "./TicketProjectionCodec.ts";
import { buildTicketQueryPlan, matchedFields, type SqlValue } from "./TicketQueryPlan.ts";
import { makeTicketProjectionWrites } from "./TicketProjectionWrites.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

const normalizeLimit = (limit: number | undefined): number =>
  Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));

export type ProjectionTicketStoreShape = {
  readonly deleteRecord: (
    repositoryId: string,
    recordId: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly deleteTicket: (
    repositoryId: string,
    ticketId: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly getTicket: (
    repositoryId: string,
    ticketId: string,
  ) => Effect.Effect<TicketDocument | null, DatabaseFailure>;
  readonly listTickets: (query?: TicketQuery) => Effect.Effect<TicketPage, DatabaseFailure>;
  readonly recordVisible: (
    repositoryId: string,
    recordId: string,
  ) => Effect.Effect<boolean, DatabaseFailure>;
  readonly repositoryHistory: (
    repositoryId: string,
    query?: RepositoryHistoryQuery,
  ) => Effect.Effect<HistoryPage, DatabaseFailure>;
  readonly searchTickets: (
    query: SearchTicketsQuery,
  ) => Effect.Effect<TicketSearchPage, DatabaseFailure>;
  readonly ticketComments: (
    repositoryId: string,
    ticketId: string,
    query?: RecordQuery,
  ) => Effect.Effect<RecordPage, DatabaseFailure>;
  readonly ticketRecords: (
    repositoryId: string,
    ticketId: string,
    query?: RecordQuery,
  ) => Effect.Effect<RecordPage, DatabaseFailure>;
  readonly ticketVisible: (
    repositoryId: string,
    ticketId: string,
  ) => Effect.Effect<boolean, DatabaseFailure>;
  readonly upsertRecord: (input: {
    readonly record: LinkedRecord;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }) => Effect.Effect<void, DatabaseFailure>;
  readonly upsertTicket: (input: {
    readonly path: string;
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly ticket: TicketDocument;
  }) => Effect.Effect<void, DatabaseFailure>;
};

export class ProjectionTicketStore extends Context.Service<
  ProjectionTicketStore,
  ProjectionTicketStoreShape
>()("@cycle/database/internals/projection/ProjectionTicketStore") {}

export const ProjectionTicketStoreLive = Layer.effect(
  ProjectionTicketStore,
  Effect.gen(function* () {
    const client = yield* SqlClient.SqlClient;
    const pages = yield* ProjectionPageStore;
    const sql = makeProjectionSql(client);
    const writes = makeTicketProjectionWrites(sql, pages);

    const getTicket = Effect.fn("ProjectionTicketStore.getTicket")(function* (
      repositoryId: string,
      ticketId: string,
    ) {
      const row = yield* sql.get(
        "get ticket",
        "SELECT * FROM tickets WHERE repository_id = ? AND ticket_id = ?",
        [repositoryId, ticketId],
      );
      return row === undefined ? null : yield* decodeTicketRow(row);
    });

    const listTickets = Effect.fn("ProjectionTicketStore.listTickets")(function* (
      query: TicketQuery = {},
    ) {
      const limit = normalizeLimit(query.limit);
      const cursor = yield* decodeCursor(query.cursor);
      const plan = buildTicketQueryPlan(query, limit, cursor.offset);
      const rows = yield* sql.all("list tickets", plan.source, plan.params);
      const entries = yield* Effect.forEach(rows.slice(0, limit), decodeTicketRow);
      return {
        entries,
        ...(rows.length > limit ? { nextCursor: encodeCursor(cursor.offset + limit) } : {}),
      };
    });

    const searchTickets = Effect.fn("ProjectionTicketStore.searchTickets")(function* (
      query: SearchTicketsQuery,
    ) {
      const page = yield* listTickets(query);
      return {
        entries: page.entries.map((ticket) => ({
          matchedFields: matchedFields(ticket, query.text),
          ticket,
        })),
        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      };
    });

    const ticketRecords = Effect.fn("ProjectionTicketStore.ticketRecords")(function* (
      repositoryId: string,
      ticketId: string,
      query: RecordQuery = {},
    ) {
      const limit = normalizeLimit(query.limit);
      const cursor = yield* decodeCursor(query.cursor);
      const params: Array<SqlValue> = [repositoryId, ticketId];
      const filter = query.recordType === undefined ? "" : "AND record_type = ?";
      if (query.recordType !== undefined) params.push(normalizeKey(query.recordType));
      const rows = yield* sql.all(
        "list ticket records",
        `SELECT * FROM records
           WHERE repository_id = ? AND ticket_id = ?
           ${filter}
           ORDER BY created_at ASC, record_id ASC
           LIMIT ? OFFSET ?`,
        [...params, limit + 1, cursor.offset],
      );
      const entries = yield* Effect.forEach(rows.slice(0, limit), decodeRecordRow);
      return {
        entries,
        ...(rows.length > limit ? { nextCursor: encodeCursor(cursor.offset + limit) } : {}),
      };
    });

    const ticketComments = Effect.fn("ProjectionTicketStore.ticketComments")(
      (repositoryId: string, ticketId: string, query: RecordQuery = {}) =>
        ticketRecords(repositoryId, ticketId, { ...query, recordType: "comment" }),
    );

    const repositoryHistory = Effect.fn("ProjectionTicketStore.repositoryHistory")(function* (
      repositoryId: string,
      query: RepositoryHistoryQuery = {},
    ) {
      const limit = normalizeLimit(query.limit);
      const cursor = yield* decodeCursor(query.cursor);
      const ticketFilter =
        query.ticketId === undefined
          ? ""
          : `AND EXISTS (
              SELECT 1 FROM commit_changes cc
              WHERE cc.repository_id = c.repository_id
                AND cc.snapshot_id = c.snapshot_id
                AND cc.ticket_id = ?
            )`;
      const params: Array<SqlValue> = [repositoryId];
      if (query.ticketId !== undefined) params.push(query.ticketId);
      const rows = yield* sql.all(
        "repository history",
        `SELECT
             c.snapshot_id,
             c.author_name,
             c.author_email,
             c.committed_at,
             c.message,
             c.sequence,
             COALESCE((
               SELECT json_group_array(parent_snapshot_id)
               FROM commit_parents p
               WHERE p.repository_id = c.repository_id AND p.snapshot_id = c.snapshot_id
             ), '[]') AS parent_ids,
             COALESCE((
               SELECT json_group_array(DISTINCT ticket_id)
               FROM commit_changes cc
               WHERE cc.repository_id = c.repository_id
                 AND cc.snapshot_id = c.snapshot_id
                 AND cc.ticket_id IS NOT NULL
             ), '[]') AS changed_ticket_ids,
             COALESCE((
               SELECT COUNT(*)
               FROM materialization_warnings w
               WHERE w.repository_id = c.repository_id AND w.snapshot_id = c.snapshot_id
             ), 0) AS warning_count
           FROM commits c
           WHERE c.repository_id = ?
           ${ticketFilter}
           ORDER BY c.sequence DESC, c.snapshot_id ASC
           LIMIT ? OFFSET ?`,
        [...params, limit + 1, cursor.offset],
      );
      const entries = yield* Effect.forEach(rows.slice(0, limit), decodeHistoryRow);
      return {
        entries,
        ...(rows.length > limit ? { nextCursor: encodeCursor(cursor.offset + limit) } : {}),
      };
    });

    return ProjectionTicketStore.of({
      ...writes,
      getTicket,
      listTickets,
      repositoryHistory,
      searchTickets,
      ticketComments,
      ticketRecords,
    });
  }),
);
