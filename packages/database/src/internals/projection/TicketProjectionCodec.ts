import {
  IssueFrontmatter,
  IssueRelation,
  LinkedRecord as LinkedRecordSchema,
  TicketDocument as TicketDocumentSchema,
} from "@cycle/contracts/schemas";
import { Effect, Schema } from "effect";
import type { DatabaseFailure } from "../../DatabaseErrors.ts";
import {
  makeIssueFrontmatter,
  normalizeKey,
  type HistoryCommit,
  type LinkedRecord,
  type TicketDocument,
} from "../../domain/index.ts";
import { decodeJson, decodeValue } from "./JsonCodec.ts";

const NullOrString = Schema.NullOr(Schema.String);

export const TicketRowSchema = Schema.Struct({
  archived_at: NullOrString,
  assignee: NullOrString,
  body: Schema.String,
  body_format: Schema.Literal("markdown"),
  created_at: Schema.String,
  created_by_email: NullOrString,
  created_by_name: Schema.String,
  created_by_type: Schema.String,
  deleted_at: NullOrString,
  document_path: Schema.String,
  due_date: NullOrString,
  estimate: NullOrString,
  frontmatter_json: Schema.String,
  labels_json: NullOrString,
  parent_id: Schema.String,
  priority: Schema.String,
  relation_summary_json: NullOrString,
  repository_id: Schema.String,
  repository_key: NullOrString,
  schema_version: Schema.Int,
  snapshot_id: Schema.String,
  status: Schema.String,
  ticket_id: Schema.String,
  title: Schema.String,
  type: Schema.String,
  updated_at: Schema.String,
});

export const RecordRowSchema = Schema.Struct({
  created_at: Schema.String,
  created_by_email: NullOrString,
  created_by_name: Schema.String,
  created_by_type: Schema.Literals(["agent", "human", "import"]),
  created_date: Schema.String,
  payload_json: Schema.String,
  record_id: Schema.String,
  record_type: Schema.String,
  repository_id: Schema.String,
  schema_version: Schema.Int,
  ticket_id: Schema.String,
});

export const HistoryRowSchema = Schema.Struct({
  author_email: NullOrString,
  author_name: NullOrString,
  changed_ticket_ids: NullOrString,
  committed_at: NullOrString,
  message: NullOrString,
  parent_ids: NullOrString,
  sequence: Schema.Int,
  snapshot_id: Schema.String,
  warning_count: Schema.Int,
});

const StringList = Schema.Array(Schema.String);
const RelationList = Schema.Array(IssueRelation);

export const decodeTicketRow = (raw: unknown): Effect.Effect<TicketDocument, DatabaseFailure> =>
  Effect.gen(function* () {
    const row = yield* decodeValue("ticket row", TicketRowSchema, raw);
    const decodedFrontmatter = yield* decodeJson(
      "ticket frontmatter",
      IssueFrontmatter,
      row.frontmatter_json,
    );
    const frontmatter = makeIssueFrontmatter(decodedFrontmatter);
    const labels =
      row.labels_json === null
        ? undefined
        : yield* decodeJson("ticket labels", StringList, row.labels_json);
    const relations =
      row.relation_summary_json === null
        ? undefined
        : yield* decodeJson("ticket relations", RelationList, row.relation_summary_json);

    return yield* decodeValue("ticket document", TicketDocumentSchema, {
      archivedAt: row.archived_at ?? undefined,
      assignee:
        frontmatter.assignee === null || frontmatter.assignee === undefined
          ? undefined
          : normalizeKey(frontmatter.assignee),
      body: row.body,
      bodyFormat: row.body_format,
      createdBy: frontmatter.createdBy?.email ?? frontmatter.createdBy?.name ?? "",
      deletedAt: row.deleted_at ?? undefined,
      dueDate: row.due_date ?? undefined,
      estimate: frontmatter.estimate ?? undefined,
      frontmatter,
      id: row.ticket_id,
      labels,
      parent: row.parent_id,
      priority: row.priority,
      relations,
      repository: row.repository_key ?? undefined,
      repositoryId: row.repository_id,
      schemaVersion: 1,
      status: normalizeKey(row.status),
      title: row.title,
      type: row.type,
      updatedDate: row.updated_at.slice(0, 10),
    });
  });

export const decodeRecordRow = (raw: unknown): Effect.Effect<LinkedRecord, DatabaseFailure> =>
  Effect.gen(function* () {
    const row = yield* decodeValue("linked record row", RecordRowSchema, raw);
    const payload = yield* decodeJson("linked record payload", Schema.Json, row.payload_json);
    return yield* decodeValue("linked record", LinkedRecordSchema, {
      createdAt: row.created_at,
      createdBy: {
        email: row.created_by_email ?? undefined,
        name: row.created_by_name,
        type: row.created_by_type,
      },
      createdDate: row.created_date,
      id: row.record_id,
      issueId: row.ticket_id,
      payload,
      recordType: row.record_type,
      schemaVersion: 1,
    });
  });

export const decodeHistoryRow = (raw: unknown): Effect.Effect<HistoryCommit, DatabaseFailure> =>
  Effect.gen(function* () {
    const row = yield* decodeValue("repository history row", HistoryRowSchema, raw);
    const [changedTicketIds, parentIds] = yield* Effect.all([
      decodeJson("history changed ticket ids", StringList, row.changed_ticket_ids ?? "[]"),
      decodeJson("history parent ids", StringList, row.parent_ids ?? "[]"),
    ]);
    return {
      authorEmail: row.author_email ?? undefined,
      authorName: row.author_name ?? undefined,
      changedTicketIds,
      committedAt: row.committed_at ?? undefined,
      message: row.message ?? undefined,
      parentIds,
      sequence: row.sequence,
      snapshotId: row.snapshot_id,
      warningCount: row.warning_count,
    };
  });
