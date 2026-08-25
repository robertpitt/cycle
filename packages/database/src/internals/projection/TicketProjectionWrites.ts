import {
  CommentDocument,
  IssueFrontmatter,
  IssueRelation,
  LinkedRecord as LinkedRecordSchema,
  StringList,
  TicketDocument as TicketDocumentSchema,
} from "@cycle/contracts/schemas";
import { Effect, Schema } from "effect";
import { DatabaseValidationError, type DatabaseFailure } from "../../DatabaseErrors.ts";
import { normalizeKey, type LinkedRecord, type TicketDocument } from "../../domain/index.ts";
import { encodeJson } from "./JsonCodec.ts";
import type { ProjectionPageStoreShape } from "./ProjectionPageStore.ts";
import type { ProjectionSql } from "./ProjectionSql.ts";

const RelationList = Schema.Array(IssueRelation);

const commentBody = (payload: unknown): string => {
  if (typeof payload === "string") return payload;
  if (payload !== null && typeof payload === "object") {
    const record = payload as Readonly<Record<string, unknown>>;
    if (typeof record.body === "string") return record.body;
    if (typeof record.text === "string") return record.text;
    if (typeof record.markdown === "string") return record.markdown;
    if (typeof record.comment === "string") return record.comment;
  }
  return JSON.stringify(payload) ?? "";
};

const invalidProjectionInput = (field: string, cause: unknown): DatabaseValidationError =>
  new DatabaseValidationError({
    cause,
    field,
    message: `Cannot project invalid ${field}`,
  });

export type TicketProjectionWrites = {
  readonly deleteRecord: (
    repositoryId: string,
    recordId: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly deleteTicket: (
    repositoryId: string,
    ticketId: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly recordVisible: (
    repositoryId: string,
    recordId: string,
  ) => Effect.Effect<boolean, DatabaseFailure>;
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

export const makeTicketProjectionWrites = (
  sql: ProjectionSql,
  pages: ProjectionPageStoreShape,
): TicketProjectionWrites => {
  const deleteSearchDocument = Effect.fn("ProjectionTicketStore.deleteSearchDocument")(function* (
    repositoryId: string,
    documentId: string,
  ) {
    yield* sql.run(
      "delete search document",
      "DELETE FROM search_documents WHERE repository_id = ? AND document_id = ?",
      [repositoryId, documentId],
    );
    yield* sql.run(
      "delete search FTS document",
      "DELETE FROM search_fts WHERE repository_id = ? AND document_id = ?",
      [repositoryId, documentId],
    );
  });

  const upsertSearchDocument = Effect.fn("ProjectionTicketStore.upsertSearchDocument")(
    function* (input: {
      readonly body: string;
      readonly documentId: string;
      readonly repositoryId: string;
      readonly sourceType: "comment" | "ticket";
      readonly ticketId: string;
      readonly title: string;
    }) {
      yield* deleteSearchDocument(input.repositoryId, input.documentId);
      yield* sql.run(
        "upsert search document",
        `INSERT INTO search_documents (
          repository_id, document_id, ticket_id, source_type, title, body
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.repositoryId,
          input.documentId,
          input.ticketId,
          input.sourceType,
          input.title,
          input.body,
        ],
      );
      yield* sql.run(
        "upsert search FTS document",
        `INSERT INTO search_fts (repository_id, document_id, ticket_id, title, body)
           VALUES (?, ?, ?, ?, ?)`,
        [input.repositoryId, input.documentId, input.ticketId, input.title, input.body],
      );
    },
  );

  const upsertTicket = Effect.fn("ProjectionTicketStore.upsertTicket")(function* (input: {
    readonly path: string;
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly ticket: TicketDocument;
  }) {
    const ticket = yield* Schema.decodeUnknownEffect(TicketDocumentSchema)(input.ticket).pipe(
      Effect.mapError((cause) => invalidProjectionInput(`ticket ${input.ticket.id}`, cause)),
    );
    const frontmatter = ticket.frontmatter;
    const labels = ticket.labels ?? [];
    const relations = frontmatter.relations ?? [];
    const [labelsJson, frontmatterJson, relationsJson] = yield* Effect.all([
      encodeJson("ticket labels", StringList, labels),
      encodeJson("ticket frontmatter", IssueFrontmatter, frontmatter),
      relations.length === 0
        ? Effect.succeed(null)
        : encodeJson("ticket relations", RelationList, relations),
    ]);

    yield* sql.run(
      "upsert ticket",
      `INSERT INTO tickets (
        repository_id, ticket_id, snapshot_id, document_path, title, body, body_format, type,
        status, priority, assignee, parent_id, repository_key, created_at, updated_at,
        created_by_name, created_by_email, created_by_type, labels_json, frontmatter_json,
        schema_version, due_date, estimate, archived_at, deleted_at, relation_summary_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repository_id, ticket_id) DO UPDATE SET
        snapshot_id = excluded.snapshot_id,
        document_path = excluded.document_path,
        title = excluded.title,
        body = excluded.body,
        body_format = excluded.body_format,
        type = excluded.type,
        status = excluded.status,
        priority = excluded.priority,
        assignee = excluded.assignee,
        parent_id = excluded.parent_id,
        repository_key = excluded.repository_key,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        created_by_name = excluded.created_by_name,
        created_by_email = excluded.created_by_email,
        created_by_type = excluded.created_by_type,
        labels_json = excluded.labels_json,
        frontmatter_json = excluded.frontmatter_json,
        schema_version = excluded.schema_version,
        due_date = excluded.due_date,
        estimate = excluded.estimate,
        archived_at = excluded.archived_at,
        deleted_at = excluded.deleted_at,
        relation_summary_json = excluded.relation_summary_json`,
      [
        input.repositoryId,
        ticket.id,
        input.snapshotId,
        input.path,
        frontmatter.title,
        ticket.body,
        ticket.bodyFormat,
        ticket.type,
        ticket.status,
        ticket.priority,
        ticket.assignee ?? null,
        ticket.parent,
        ticket.repository ?? null,
        frontmatter.createdAt,
        frontmatter.updatedAt,
        frontmatter.createdBy.name,
        frontmatter.createdBy.email ?? null,
        frontmatter.createdBy.type,
        labelsJson,
        frontmatterJson,
        ticket.schemaVersion,
        frontmatter.dueDate ?? null,
        frontmatter.estimate === null || frontmatter.estimate === undefined
          ? null
          : String(frontmatter.estimate),
        frontmatter.archivedAt ?? null,
        frontmatter.deletedAt ?? null,
        relationsJson,
      ],
    );

    yield* sql.run(
      "replace ticket labels",
      "DELETE FROM ticket_labels WHERE repository_id = ? AND ticket_id = ?",
      [input.repositoryId, ticket.id],
    );
    yield* Effect.forEach(
      labels,
      (label) =>
        sql.run(
          "insert ticket label",
          `INSERT OR IGNORE INTO ticket_labels (repository_id, ticket_id, label)
             VALUES (?, ?, ?)`,
          [input.repositoryId, ticket.id, label],
        ),
      { discard: true },
    );

    yield* sql.run(
      "replace ticket external links",
      "DELETE FROM ticket_external_links WHERE repository_id = ? AND ticket_id = ?",
      [input.repositoryId, ticket.id],
    );
    yield* Effect.forEach(
      frontmatter.externalLinks ?? [],
      (link) =>
        sql.run(
          "insert ticket external link",
          `INSERT INTO ticket_external_links (repository_id, ticket_id, source, title, url)
             VALUES (?, ?, ?, ?, ?)`,
          [input.repositoryId, ticket.id, link.source ?? null, link.title ?? null, link.url],
        ),
      { discard: true },
    );

    yield* sql.run(
      "replace ticket relations",
      "DELETE FROM ticket_relations WHERE repository_id = ? AND ticket_id = ?",
      [input.repositoryId, ticket.id],
    );
    yield* Effect.forEach(
      relations,
      (relation) =>
        sql.run(
          "insert ticket relation",
          `INSERT OR IGNORE INTO ticket_relations (
            repository_id, ticket_id, related_issue_id, relation_type
          ) VALUES (?, ?, ?, ?)`,
          [input.repositoryId, ticket.id, relation.issueId, relation.type],
        ),
      { discard: true },
    );
    yield* upsertSearchDocument({
      body: ticket.body,
      documentId: `ticket:${ticket.id}`,
      repositoryId: input.repositoryId,
      sourceType: "ticket",
      ticketId: ticket.id,
      title: frontmatter.title,
    });
  });

  const deleteTicket = Effect.fn("ProjectionTicketStore.deleteTicket")(function* (
    repositoryId: string,
    ticketId: string,
  ) {
    yield* Effect.forEach(
      ["tickets", "ticket_labels", "ticket_external_links", "ticket_relations"],
      (table) =>
        sql.run(
          `delete ticket from ${table}`,
          `DELETE FROM ${table} WHERE repository_id = ? AND ticket_id = ?`,
          [repositoryId, ticketId],
        ),
      { discard: true },
    );
    yield* deleteSearchDocument(repositoryId, `ticket:${ticketId}`);
  });

  const upsertRecord = Effect.fn("ProjectionTicketStore.upsertRecord")(function* (input: {
    readonly record: LinkedRecord;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }) {
    const record = yield* Schema.decodeUnknownEffect(LinkedRecordSchema)(input.record).pipe(
      Effect.mapError((cause) => invalidProjectionInput(`record ${input.record.id}`, cause)),
    );
    const payload = yield* Schema.decodeUnknownEffect(Schema.Json)(record.payload).pipe(
      Effect.mapError((cause) => invalidProjectionInput(`record ${record.id} payload`, cause)),
    );
    const payloadJson = yield* encodeJson("linked record payload", Schema.Json, payload);
    yield* sql.run(
      "upsert linked record",
      `INSERT INTO records (
        repository_id, record_id, ticket_id, record_type, created_at, created_date,
        created_by_name, created_by_email, created_by_type, payload_json, schema_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repository_id, record_id) DO UPDATE SET
        ticket_id = excluded.ticket_id,
        record_type = excluded.record_type,
        created_at = excluded.created_at,
        created_date = excluded.created_date,
        created_by_name = excluded.created_by_name,
        created_by_email = excluded.created_by_email,
        created_by_type = excluded.created_by_type,
        payload_json = excluded.payload_json,
        schema_version = excluded.schema_version`,
      [
        input.repositoryId,
        record.id,
        record.issueId,
        normalizeKey(record.recordType),
        record.createdAt,
        record.createdDate,
        record.createdBy.name,
        record.createdBy.email ?? null,
        record.createdBy.type,
        payloadJson,
        record.schemaVersion,
      ],
    );

    if (normalizeKey(record.recordType) === "comment") {
      const body = commentBody(record.payload);
      yield* sql.run(
        "upsert ticket comment",
        `INSERT INTO comments (repository_id, record_id, ticket_id, body, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(repository_id, record_id) DO UPDATE SET
             ticket_id = excluded.ticket_id,
             body = excluded.body,
             created_at = excluded.created_at`,
        [input.repositoryId, record.id, record.issueId, body, record.createdAt],
      );
      yield* upsertSearchDocument({
        body,
        documentId: `comment:${record.id}`,
        repositoryId: input.repositoryId,
        sourceType: "comment",
        ticketId: record.issueId,
        title: "",
      });
      const comment = yield* Schema.decodeUnknownEffect(CommentDocument)({
        body,
        bodyFormat: "markdown",
        createdAt: record.createdAt,
        createdBy: record.createdBy,
        id: record.id,
        repositoryId: input.repositoryId,
        schemaVersion: 1,
        target: {
          repositoryId: input.repositoryId,
          resourceId: record.issueId,
          resourceKind: "ticket",
        },
      }).pipe(Effect.mapError((cause) => invalidProjectionInput(`comment ${record.id}`, cause)));
      yield* pages.upsertComment(comment);
    } else {
      yield* sql.run(
        "delete non-comment record projection",
        "DELETE FROM comments WHERE repository_id = ? AND record_id = ?",
        [input.repositoryId, record.id],
      );
      yield* deleteSearchDocument(input.repositoryId, `comment:${record.id}`);
    }
  });

  const deleteRecord = Effect.fn("ProjectionTicketStore.deleteRecord")(function* (
    repositoryId: string,
    recordId: string,
  ) {
    yield* sql.run(
      "delete linked record",
      "DELETE FROM records WHERE repository_id = ? AND record_id = ?",
      [repositoryId, recordId],
    );
    yield* sql.run(
      "delete ticket comment",
      "DELETE FROM comments WHERE repository_id = ? AND record_id = ?",
      [repositoryId, recordId],
    );
    yield* deleteSearchDocument(repositoryId, `comment:${recordId}`);
  });

  const ticketVisible = Effect.fn("ProjectionTicketStore.ticketVisible")(function* (
    repositoryId: string,
    ticketId: string,
  ) {
    return (
      (yield* sql.get(
        "check ticket visibility",
        "SELECT 1 FROM tickets WHERE repository_id = ? AND ticket_id = ?",
        [repositoryId, ticketId],
      )) !== undefined
    );
  });

  const recordVisible = Effect.fn("ProjectionTicketStore.recordVisible")(function* (
    repositoryId: string,
    recordId: string,
  ) {
    return (
      (yield* sql.get(
        "check record visibility",
        "SELECT 1 FROM records WHERE repository_id = ? AND record_id = ?",
        [repositoryId, recordId],
      )) !== undefined
    );
  });

  return { deleteRecord, deleteTicket, recordVisible, ticketVisible, upsertRecord, upsertTicket };
};
