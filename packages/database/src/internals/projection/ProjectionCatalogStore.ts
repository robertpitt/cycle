import {
  IssueTemplateDocument as IssueTemplateDocumentSchema,
  LabelDefinitionDocument as LabelDefinitionDocumentSchema,
  SavedViewDocument as SavedViewDocumentSchema,
  UserProfileDocument as UserProfileDocumentSchema,
} from "@cycle/contracts/schemas";
import { Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { DatabaseFailure } from "../../DatabaseErrors.ts";
import type {
  IssueTemplateDocument,
  IssueTemplatePage,
  IssueTemplateQuery,
  LabelDefinitionDocument,
  LabelDefinitionPage,
  LabelDefinitionQuery,
  SavedViewDocument,
  SavedViewPage,
  SavedViewQuery,
  UserProfileDocument,
  UserProfilePage,
  UserProfileQuery,
} from "../../domain/index.ts";
import { decodeCursor, encodeCursor } from "./CursorCodec.ts";
import { decodeJson, decodeValue, encodeJson } from "./JsonCodec.ts";
import { makeProjectionSql } from "./ProjectionSql.ts";

type SqlValue = null | number | string;

const DocumentRowSchema = Schema.Struct({ document_json: Schema.String });
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

const normalizeLimit = (limit: number | undefined): number =>
  Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT)));

const placeholders = (count: number): string => Array.from({ length: count }, () => "?").join(", ");

const searchPattern = (text: string): string =>
  `%${text.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

export type ProjectionCatalogStoreShape = {
  readonly deleteLabel: (
    repositoryId: string,
    labelId: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly deleteTemplate: (
    repositoryId: string,
    templateId: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly deleteUser: (
    repositoryId: string,
    userId: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly deleteView: (
    repositoryId: string,
    viewId: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly getTemplate: (
    repositoryId: string,
    templateId: string,
  ) => Effect.Effect<IssueTemplateDocument | null, DatabaseFailure>;
  readonly getUser: (
    repositoryId: string,
    userId: string,
  ) => Effect.Effect<UserProfileDocument | null, DatabaseFailure>;
  readonly getView: (
    repositoryId: string,
    viewId: string,
  ) => Effect.Effect<SavedViewDocument | null, DatabaseFailure>;
  readonly listLabels: (
    repositoryId: string,
    query?: LabelDefinitionQuery,
  ) => Effect.Effect<LabelDefinitionPage, DatabaseFailure>;
  readonly listTemplates: (
    repositoryId: string,
    query?: IssueTemplateQuery,
  ) => Effect.Effect<IssueTemplatePage, DatabaseFailure>;
  readonly listUsers: (
    repositoryId: string,
    query?: UserProfileQuery,
  ) => Effect.Effect<UserProfilePage, DatabaseFailure>;
  readonly listViews: (
    repositoryId: string,
    query?: SavedViewQuery,
  ) => Effect.Effect<SavedViewPage, DatabaseFailure>;
  readonly upsertLabel: (input: {
    readonly label: LabelDefinitionDocument;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }) => Effect.Effect<void, DatabaseFailure>;
  readonly upsertTemplate: (input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly template: IssueTemplateDocument;
  }) => Effect.Effect<void, DatabaseFailure>;
  readonly upsertUser: (input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly user: UserProfileDocument;
  }) => Effect.Effect<void, DatabaseFailure>;
  readonly upsertView: (input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly view: SavedViewDocument;
  }) => Effect.Effect<void, DatabaseFailure>;
  readonly usersByRecipientLookupKeys: (
    repositoryId: string,
    lookupKeys: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<UserProfileDocument>, DatabaseFailure>;
};

export class ProjectionCatalogStore extends Context.Service<
  ProjectionCatalogStore,
  ProjectionCatalogStoreShape
>()("@cycle/database/internals/projection/ProjectionCatalogStore") {}

export const ProjectionCatalogStoreLive = Layer.effect(
  ProjectionCatalogStore,
  Effect.gen(function* () {
    const client = yield* SqlClient.SqlClient;
    const sql = makeProjectionSql(client);

    const decodeDocument = <S extends Schema.Top>(operation: string, schema: S, raw: unknown) =>
      decodeValue(`${operation} row`, DocumentRowSchema, raw).pipe(
        Effect.flatMap((row) => decodeJson(operation, schema, row.document_json)),
      );

    const upsertUser = Effect.fn("ProjectionCatalogStore.upsertUser")(function* (input: {
      readonly repositoryId: string;
      readonly snapshotId: string;
      readonly user: UserProfileDocument;
    }) {
      const user = input.user;
      const profileJson = yield* encodeJson("user profile", UserProfileDocumentSchema, user);
      const aliasesJson = user.aliases === undefined ? null : JSON.stringify(user.aliases);
      yield* sql.run(
        "upsert user profile",
        `INSERT INTO users (
          repository_id, user_id, snapshot_id, email, display_name, avatar_url, timezone, source,
          disabled_at, aliases_json, created_at, updated_at, profile_json, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, user_id) DO UPDATE SET
          snapshot_id = excluded.snapshot_id,
          email = excluded.email,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          timezone = excluded.timezone,
          source = excluded.source,
          disabled_at = excluded.disabled_at,
          aliases_json = excluded.aliases_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          profile_json = excluded.profile_json,
          schema_version = excluded.schema_version`,
        [
          input.repositoryId,
          user.id,
          input.snapshotId,
          user.email,
          user.displayName,
          user.avatarUrl ?? null,
          user.timezone ?? null,
          user.source,
          user.disabledAt ?? null,
          aliasesJson,
          user.createdAt,
          user.updatedAt,
          profileJson,
          user.schemaVersion,
        ],
      );
    });

    const deleteUser = Effect.fn("ProjectionCatalogStore.deleteUser")(function* (
      repositoryId: string,
      userId: string,
    ) {
      yield* sql.run(
        "delete user profile",
        "DELETE FROM users WHERE repository_id = ? AND user_id = ?",
        [repositoryId, userId],
      );
    });

    const upsertLabel = Effect.fn("ProjectionCatalogStore.upsertLabel")(function* (input: {
      readonly label: LabelDefinitionDocument;
      readonly repositoryId: string;
      readonly snapshotId: string;
    }) {
      const label = input.label;
      const labelJson = yield* encodeJson("label definition", LabelDefinitionDocumentSchema, label);
      yield* sql.run(
        "upsert label definition",
        `INSERT INTO labels (
          repository_id, label_id, snapshot_id, name, color, description, archived_at,
          created_by_name, created_by_email, created_by_type, created_at, updated_at,
          label_json, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, label_id) DO UPDATE SET
          snapshot_id = excluded.snapshot_id,
          name = excluded.name,
          color = excluded.color,
          description = excluded.description,
          archived_at = excluded.archived_at,
          created_by_name = excluded.created_by_name,
          created_by_email = excluded.created_by_email,
          created_by_type = excluded.created_by_type,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          label_json = excluded.label_json,
          schema_version = excluded.schema_version`,
        [
          input.repositoryId,
          label.id,
          input.snapshotId,
          label.name,
          label.color,
          label.description ?? null,
          label.archivedAt ?? null,
          label.createdBy.name,
          label.createdBy.email ?? null,
          label.createdBy.type,
          label.createdAt,
          label.updatedAt,
          labelJson,
          label.schemaVersion,
        ],
      );
    });

    const deleteLabel = Effect.fn("ProjectionCatalogStore.deleteLabel")(function* (
      repositoryId: string,
      labelId: string,
    ) {
      yield* sql.run(
        "delete label definition",
        "DELETE FROM labels WHERE repository_id = ? AND label_id = ?",
        [repositoryId, labelId],
      );
    });

    const upsertView = Effect.fn("ProjectionCatalogStore.upsertView")(function* (input: {
      readonly repositoryId: string;
      readonly snapshotId: string;
      readonly view: SavedViewDocument;
    }) {
      const view = input.view;
      const viewJson = yield* encodeJson("saved view", SavedViewDocumentSchema, view);
      yield* sql.run(
        "upsert saved view",
        `INSERT INTO saved_views (
          repository_id, view_id, snapshot_id, name, kind, group_by, pinned, built_in,
          owner_user_id, created_by_name, created_by_email, created_by_type, created_at,
          updated_at, view_json, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, view_id) DO UPDATE SET
          snapshot_id = excluded.snapshot_id,
          name = excluded.name,
          kind = excluded.kind,
          group_by = excluded.group_by,
          pinned = excluded.pinned,
          built_in = excluded.built_in,
          owner_user_id = excluded.owner_user_id,
          created_by_name = excluded.created_by_name,
          created_by_email = excluded.created_by_email,
          created_by_type = excluded.created_by_type,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          view_json = excluded.view_json,
          schema_version = excluded.schema_version`,
        [
          input.repositoryId,
          view.id,
          input.snapshotId,
          view.name,
          view.kind,
          view.groupBy,
          view.pinned ? 1 : 0,
          view.builtIn === true ? 1 : 0,
          view.ownerUserId ?? null,
          view.createdBy.name,
          view.createdBy.email ?? null,
          view.createdBy.type,
          view.createdAt,
          view.updatedAt,
          viewJson,
          view.schemaVersion,
        ],
      );
    });

    const deleteView = Effect.fn("ProjectionCatalogStore.deleteView")(function* (
      repositoryId: string,
      viewId: string,
    ) {
      yield* sql.run(
        "delete saved view",
        "DELETE FROM saved_views WHERE repository_id = ? AND view_id = ?",
        [repositoryId, viewId],
      );
    });

    const upsertTemplate = Effect.fn("ProjectionCatalogStore.upsertTemplate")(function* (input: {
      readonly repositoryId: string;
      readonly snapshotId: string;
      readonly template: IssueTemplateDocument;
    }) {
      const template = input.template;
      const templateJson = yield* encodeJson(
        "issue template",
        IssueTemplateDocumentSchema,
        template,
      );
      yield* sql.run(
        "upsert issue template",
        `INSERT INTO issue_templates (
          repository_id, template_id, snapshot_id, name, kind, active, created_by_name,
          created_by_email, created_by_type, created_at, updated_at, template_json, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, template_id) DO UPDATE SET
          snapshot_id = excluded.snapshot_id,
          name = excluded.name,
          kind = excluded.kind,
          active = excluded.active,
          created_by_name = excluded.created_by_name,
          created_by_email = excluded.created_by_email,
          created_by_type = excluded.created_by_type,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          template_json = excluded.template_json,
          schema_version = excluded.schema_version`,
        [
          input.repositoryId,
          template.id,
          input.snapshotId,
          template.name,
          template.kind,
          template.active ? 1 : 0,
          template.createdBy.name,
          template.createdBy.email ?? null,
          template.createdBy.type,
          template.createdAt,
          template.updatedAt,
          templateJson,
          template.schemaVersion,
        ],
      );
    });

    const deleteTemplate = Effect.fn("ProjectionCatalogStore.deleteTemplate")(function* (
      repositoryId: string,
      templateId: string,
    ) {
      yield* sql.run(
        "delete issue template",
        "DELETE FROM issue_templates WHERE repository_id = ? AND template_id = ?",
        [repositoryId, templateId],
      );
    });

    const getDocument = <S extends Schema.Top>(
      operation: string,
      schema: S,
      table: string,
      idColumn: string,
      repositoryId: string,
      id: string,
    ) =>
      Effect.gen(function* () {
        const raw = yield* sql.get(
          operation,
          `SELECT ${
            table === "users"
              ? "profile_json"
              : table === "labels"
                ? "label_json"
                : table === "saved_views"
                  ? "view_json"
                  : "template_json"
          } AS document_json FROM ${table} WHERE repository_id = ? AND ${idColumn} = ?`,
          [repositoryId, id],
        );
        return raw === undefined ? null : yield* decodeDocument(operation, schema, raw);
      });

    const getUser = Effect.fn("ProjectionCatalogStore.getUser")(
      (repositoryId: string, userId: string) =>
        getDocument(
          "get user profile",
          UserProfileDocumentSchema,
          "users",
          "user_id",
          repositoryId,
          userId,
        ),
    );
    const getView = Effect.fn("ProjectionCatalogStore.getView")(
      (repositoryId: string, viewId: string) =>
        getDocument(
          "get saved view",
          SavedViewDocumentSchema,
          "saved_views",
          "view_id",
          repositoryId,
          viewId,
        ),
    );
    const getTemplate = Effect.fn("ProjectionCatalogStore.getTemplate")(
      (repositoryId: string, templateId: string) =>
        getDocument(
          "get issue template",
          IssueTemplateDocumentSchema,
          "issue_templates",
          "template_id",
          repositoryId,
          templateId,
        ),
    );

    const listDocuments = <S extends Schema.Top>(options: {
      readonly operation: string;
      readonly params: ReadonlyArray<SqlValue>;
      readonly result: S;
      readonly source: string;
    }) =>
      sql
        .all(options.operation, options.source, options.params)
        .pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) => decodeDocument(options.operation, options.result, row)),
          ),
        );

    const usersByRecipientLookupKeys = Effect.fn(
      "ProjectionCatalogStore.usersByRecipientLookupKeys",
    )(function* (repositoryId: string, lookupKeys: ReadonlyArray<string>) {
      const normalized = [
        ...new Set(
          lookupKeys.map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0),
        ),
      ];
      if (normalized.length === 0) return [];

      const lookupPlaceholders = placeholders(normalized.length);
      const aliasFilters = normalized.map(() => "lower(aliases_json) LIKE ?").join(" OR ");
      const aliasParams = normalized.map((key) => `%"${key.replaceAll('"', '\\"')}"%`);
      return yield* listDocuments({
        operation: "find users by recipient keys",
        params: [repositoryId, ...normalized, ...normalized, ...normalized, ...aliasParams],
        result: UserProfileDocumentSchema,
        source: `SELECT profile_json AS document_json FROM users
           WHERE repository_id = ?
             AND disabled_at IS NULL
             AND (
               lower(user_id) IN (${lookupPlaceholders})
               OR lower(email) IN (${lookupPlaceholders})
               OR lower(display_name) IN (${lookupPlaceholders})
               OR (${aliasFilters})
             )
           ORDER BY user_id ASC`,
      });
    });

    const listUsers = Effect.fn("ProjectionCatalogStore.listUsers")(function* (
      repositoryId: string,
      query: UserProfileQuery = {},
    ) {
      const limit = normalizeLimit(query.limit);
      const cursor = yield* decodeCursor(query.cursor);
      const filters = ["repository_id = ?"];
      const params: Array<SqlValue> = [repositoryId];
      if (query.disabled === true) filters.push("disabled_at IS NOT NULL");
      else if (query.disabled === false) filters.push("disabled_at IS NULL");
      if (query.text !== undefined && query.text.trim().length > 0) {
        filters.push("(lower(display_name) LIKE ? ESCAPE '\\' OR lower(email) LIKE ? ESCAPE '\\')");
        const pattern = searchPattern(query.text);
        params.push(pattern, pattern);
      }
      const entries = yield* listDocuments({
        operation: "list user profiles",
        params: [...params, limit + 1, cursor.offset],
        result: UserProfileDocumentSchema,
        source: `SELECT profile_json AS document_json FROM users
           WHERE ${filters.join(" AND ")}
           ORDER BY disabled_at IS NOT NULL ASC, display_name ASC, user_id ASC
           LIMIT ? OFFSET ?`,
      });
      return {
        entries: entries.slice(0, limit),
        ...(entries.length > limit ? { nextCursor: encodeCursor(cursor.offset + limit) } : {}),
      };
    });

    const listLabels = Effect.fn("ProjectionCatalogStore.listLabels")(function* (
      repositoryId: string,
      query: LabelDefinitionQuery = {},
    ) {
      const limit = normalizeLimit(query.limit);
      const cursor = yield* decodeCursor(query.cursor);
      const filters = ["repository_id = ?"];
      const params: Array<SqlValue> = [repositoryId];
      if (query.archived === true) filters.push("archived_at IS NOT NULL");
      else if (query.archived !== undefined) filters.push("archived_at IS NULL");
      if (query.text !== undefined && query.text.trim().length > 0) {
        filters.push("(lower(name) LIKE ? ESCAPE '\\' OR lower(label_id) LIKE ? ESCAPE '\\')");
        const pattern = searchPattern(query.text);
        params.push(pattern, pattern);
      }
      const entries = yield* listDocuments({
        operation: "list label definitions",
        params: [...params, limit + 1, cursor.offset],
        result: LabelDefinitionDocumentSchema,
        source: `SELECT label_json AS document_json FROM labels
           WHERE ${filters.join(" AND ")}
           ORDER BY archived_at IS NOT NULL ASC, name ASC, label_id ASC
           LIMIT ? OFFSET ?`,
      });
      return {
        entries: entries.slice(0, limit),
        ...(entries.length > limit ? { nextCursor: encodeCursor(cursor.offset + limit) } : {}),
      };
    });

    const listViews = Effect.fn("ProjectionCatalogStore.listViews")(function* (
      repositoryId: string,
      query: SavedViewQuery = {},
    ) {
      const limit = normalizeLimit(query.limit);
      const cursor = yield* decodeCursor(query.cursor);
      const filters = ["repository_id = ?"];
      const params: Array<SqlValue> = [repositoryId];
      if (query.kind !== undefined) {
        filters.push("kind = ?");
        params.push(query.kind);
      }
      if (query.pinned !== undefined) {
        filters.push("pinned = ?");
        params.push(query.pinned ? 1 : 0);
      }
      if (query.text !== undefined && query.text.trim().length > 0) {
        filters.push("lower(name) LIKE ? ESCAPE '\\'");
        params.push(searchPattern(query.text));
      }
      const entries = yield* listDocuments({
        operation: "list saved views",
        params: [...params, limit + 1, cursor.offset],
        result: SavedViewDocumentSchema,
        source: `SELECT view_json AS document_json FROM saved_views
           WHERE ${filters.join(" AND ")}
           ORDER BY pinned DESC, built_in DESC, name ASC, view_id ASC
           LIMIT ? OFFSET ?`,
      });
      return {
        entries: entries.slice(0, limit),
        ...(entries.length > limit ? { nextCursor: encodeCursor(cursor.offset + limit) } : {}),
      };
    });

    const listTemplates = Effect.fn("ProjectionCatalogStore.listTemplates")(function* (
      repositoryId: string,
      query: IssueTemplateQuery = {},
    ) {
      const limit = normalizeLimit(query.limit);
      const cursor = yield* decodeCursor(query.cursor);
      const filters = ["repository_id = ?"];
      const params: Array<SqlValue> = [repositoryId];
      if (query.kind !== undefined) {
        filters.push("kind = ?");
        params.push(query.kind);
      }
      if (query.active !== undefined) {
        filters.push("active = ?");
        params.push(query.active ? 1 : 0);
      }
      if (query.text !== undefined && query.text.trim().length > 0) {
        filters.push("lower(name) LIKE ? ESCAPE '\\'");
        params.push(searchPattern(query.text));
      }
      const entries = yield* listDocuments({
        operation: "list issue templates",
        params: [...params, limit + 1, cursor.offset],
        result: IssueTemplateDocumentSchema,
        source: `SELECT template_json AS document_json FROM issue_templates
           WHERE ${filters.join(" AND ")}
           ORDER BY active DESC, kind ASC, name ASC, template_id ASC
           LIMIT ? OFFSET ?`,
      });
      return {
        entries: entries.slice(0, limit),
        ...(entries.length > limit ? { nextCursor: encodeCursor(cursor.offset + limit) } : {}),
      };
    });

    return ProjectionCatalogStore.of({
      deleteLabel,
      deleteTemplate,
      deleteUser,
      deleteView,
      getTemplate,
      getUser,
      getView,
      listLabels,
      listTemplates,
      listUsers,
      listViews,
      upsertLabel,
      upsertTemplate,
      upsertUser,
      upsertView,
      usersByRecipientLookupKeys,
    });
  }),
);
