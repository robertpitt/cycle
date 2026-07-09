import { makeSqliteLayer } from "@cycle/sqlite";
import { Context, Effect, Exit, Layer, Schema, Scope } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type {
  CycleRepositoryMetadata,
  HistoryCommit,
  HistoryPage,
  InboxEntry,
  InboxItem,
  InboxMutationInput,
  InboxMutationResult,
  InboxPage,
  InboxQuery,
  InboxReason,
  InboxSourceState,
  InboxStatus,
  InboxSummary,
  IssueTemplateDocument,
  IssueTemplatePage,
  IssueTemplateQuery,
  LabelDefinitionDocument,
  LabelDefinitionPage,
  LabelDefinitionQuery,
  LinkedRecord,
  MaterializationWarning,
  RecordPage,
  RecordQuery,
  RepositoryHistoryQuery,
  RepositoryInput,
  RepositoryMetadata,
  RepositoryStatus,
  RepositoryStatusValue,
  SavedViewDocument,
  SavedViewPage,
  SavedViewQuery,
  SearchTicketsQuery,
  TicketDocument,
  TicketPage,
  TicketQuery,
  TicketSearchPage,
  UserProfileDocument,
  UserProfilePage,
  UserProfileQuery,
} from "./domain/index.ts";
import { makeIssueFrontmatter, normalizeKey, ticketReferenceKey } from "./domain/index.ts";
import { DatabaseSqliteError } from "./DatabaseErrors.ts";

type SqlValue = null | number | string;

type SqliteRunResult = {
  readonly changes?: bigint | number;
  readonly lastInsertRowid?: bigint | number;
};

type SqliteDatabaseLike = {
  readonly all: <A extends object = Record<string, unknown>>(
    source: string,
    params?: ReadonlyArray<unknown>,
  ) => ReadonlyArray<A>;
  readonly close: () => void;
  readonly exec: (source: string) => void;
  readonly get: <A extends object = Record<string, unknown>>(
    source: string,
    params?: ReadonlyArray<unknown>,
  ) => A | undefined;
  readonly run: (source: string, params?: ReadonlyArray<unknown>) => SqliteRunResult;
  readonly transaction: <A>(f: () => A) => A;
};

type TicketRow = {
  readonly archived_at: string | null;
  readonly assignee: string | null;
  readonly body: string;
  readonly body_format: "markdown";
  readonly created_at: string;
  readonly created_by_email: string | null;
  readonly created_by_name: string;
  readonly created_by_type: string;
  readonly deleted_at: string | null;
  readonly document_path: string;
  readonly due_date: string | null;
  readonly estimate: string | null;
  readonly frontmatter_json: string;
  readonly labels_json: string | null;
  readonly parent_id: string;
  readonly priority: string;
  readonly relation_summary_json: string | null;
  readonly repository_id: string;
  readonly repository_key: string | null;
  readonly schema_version: number;
  readonly snapshot_id: string;
  readonly status: string;
  readonly ticket_id: string;
  readonly title: string;
  readonly type: string;
  readonly updated_at: string;
};

type RecordRow = {
  readonly created_at: string;
  readonly created_by_email: string | null;
  readonly created_by_name: string;
  readonly created_by_type: string;
  readonly created_date: string;
  readonly payload_json: string;
  readonly record_id: string;
  readonly record_type: string;
  readonly repository_id: string;
  readonly schema_version: number;
  readonly ticket_id: string;
};

type UserRow = {
  readonly aliases_json: string | null;
  readonly avatar_url: string | null;
  readonly created_at: string;
  readonly disabled_at: string | null;
  readonly display_name: string;
  readonly email: string;
  readonly profile_json: string;
  readonly repository_id: string;
  readonly schema_version: number;
  readonly source: string;
  readonly timezone: string | null;
  readonly updated_at: string;
  readonly user_id: string;
};

type LabelRow = {
  readonly archived_at: string | null;
  readonly color: string;
  readonly created_at: string;
  readonly created_by_email: string | null;
  readonly created_by_name: string;
  readonly created_by_type: string;
  readonly description: string | null;
  readonly label_id: string;
  readonly label_json: string;
  readonly name: string;
  readonly repository_id: string;
  readonly schema_version: number;
  readonly updated_at: string;
};

type SavedViewRow = {
  readonly built_in: number;
  readonly created_at: string;
  readonly created_by_email: string | null;
  readonly created_by_name: string;
  readonly created_by_type: string;
  readonly group_by: string;
  readonly kind: string;
  readonly name: string;
  readonly owner_user_id: string | null;
  readonly pinned: number;
  readonly repository_id: string;
  readonly schema_version: number;
  readonly updated_at: string;
  readonly view_id: string;
  readonly view_json: string;
};

type IssueTemplateRow = {
  readonly active: number;
  readonly created_at: string;
  readonly created_by_email: string | null;
  readonly created_by_name: string;
  readonly created_by_type: string;
  readonly kind: string;
  readonly name: string;
  readonly repository_id: string;
  readonly schema_version: number;
  readonly template_id: string;
  readonly template_json: string;
  readonly updated_at: string;
};

type RepositoryRow = {
  readonly active_generation: number;
  readonly active_snapshot_id: string | null;
  readonly current_branch: string | null;
  readonly cycle_metadata_json: string | null;
  readonly default_remote: string | null;
  readonly default_remote_url: string | null;
  readonly git_dir: string | null;
  readonly last_sync_completed_at: string | null;
  readonly last_sync_error: string | null;
  readonly last_sync_started_at: string | null;
  readonly metadata_updated_at: string | null;
  readonly remotes_json: string | null;
  readonly repository_id: string;
  readonly sync_status: RepositoryStatusValue;
  readonly warning_count: number;
  readonly worktree_path: string | null;
};

type HistoryRow = {
  readonly author_email: string | null;
  readonly author_name: string | null;
  readonly changed_ticket_ids: string | null;
  readonly committed_at: string | null;
  readonly message: string | null;
  readonly parent_ids: string | null;
  readonly sequence: number;
  readonly snapshot_id: string;
  readonly warning_count: number;
};

type InboxItemRow = {
  readonly actor_email: string | null;
  readonly actor_name: string | null;
  readonly body_excerpt: string | null;
  readonly created_at: string;
  readonly event_path: string;
  readonly item_id: string;
  readonly metadata_json: string | null;
  readonly reason: InboxReason;
  readonly record_id: string | null;
  readonly repository_id: string;
  readonly sequence: number;
  readonly snapshot_id: string;
  readonly ticket_id: string;
  readonly title: string;
  readonly user_id: string;
};

type InboxListRow = InboxItemRow & {
  readonly archived_at: string | null;
  readonly deleted_at: string | null;
  readonly local_archived_at: string | null;
  readonly local_read_at: string | null;
  readonly local_snoozed_until: string | null;
  readonly local_updated_at: string | null;
  readonly status: InboxStatus;
};

const WATCHED_REF = "refs/gitdb/cycle/main";
export const CURRENT_PROJECTION_SCHEMA_VERSION = 5;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const StrictDecodeOptions = { onExcessProperty: "error" } as const;
const NonNegativeInteger = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);
const JsonValue = Schema.Json;
const StringListJson = Schema.Array(Schema.String);
const EstimateValueJson = Schema.Union([Schema.Finite, Schema.String]);
const NullableEstimateValueJson = Schema.NullOr(EstimateValueJson);
const ActorJson = Schema.Struct({
  email: Schema.optional(Schema.String),
  name: Schema.String,
  provider: Schema.optional(Schema.String),
  type: Schema.Literals(["agent", "human", "import"]),
});
const ExternalLinkJson = Schema.Struct({
  source: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.String,
});
const IssueRelationTypeJson = Schema.Literals(["blocked-by", "blocking", "duplicate", "related"]);
const IssueRelationJson = Schema.Struct({
  issueId: Schema.String,
  type: IssueRelationTypeJson,
});
const TicketQueryJson = Schema.Struct({
  archived: Schema.optional(Schema.Boolean),
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  assigneeIn: Schema.optional(StringListJson),
  blocked: Schema.optional(Schema.Boolean),
  cursor: Schema.optional(Schema.String),
  deleted: Schema.optional(Schema.Boolean),
  dueAfter: Schema.optional(Schema.String),
  dueBefore: Schema.optional(Schema.String),
  estimate: Schema.optional(EstimateValueJson),
  hasAssignee: Schema.optional(Schema.Boolean),
  hasDueDate: Schema.optional(Schema.Boolean),
  hasEstimate: Schema.optional(Schema.Boolean),
  hasLabels: Schema.optional(Schema.Boolean),
  label: Schema.optional(Schema.String),
  labelIn: Schema.optional(StringListJson),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  orderBy: Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ),
  orderDirection: Schema.optional(Schema.Literals(["asc", "desc"])),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  priority: Schema.optional(Schema.String),
  priorityIn: Schema.optional(StringListJson),
  relation: Schema.optional(
    Schema.Struct({
      issueId: Schema.optional(Schema.String),
      type: Schema.optional(IssueRelationTypeJson),
    }),
  ),
  repositoryIds: Schema.optional(StringListJson),
  staleBefore: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  statusIn: Schema.optional(StringListJson),
  text: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  updatedAfter: Schema.optional(Schema.String),
  updatedBefore: Schema.optional(Schema.String),
});
const IssueFrontmatterJson = Schema.StructWithRest(
  Schema.Struct({
    agentProvenance: Schema.optional(JsonRecord),
    archivedAt: Schema.optional(Schema.NullOr(Schema.String)),
    archivedBy: Schema.optional(Schema.NullOr(ActorJson)),
    assignee: Schema.optional(Schema.NullOr(Schema.Union([Schema.String, ActorJson]))),
    children: Schema.optional(StringListJson),
    createdAt: Schema.String,
    createdBy: ActorJson,
    deletedAt: Schema.optional(Schema.NullOr(Schema.String)),
    deletedBy: Schema.optional(Schema.NullOr(ActorJson)),
    duplicateOf: Schema.optional(Schema.NullOr(Schema.String)),
    dueDate: Schema.optional(Schema.NullOr(Schema.String)),
    estimate: Schema.optional(NullableEstimateValueJson),
    externalLinks: Schema.optional(Schema.Array(ExternalLinkJson)),
    id: Schema.String,
    labels: Schema.optional(StringListJson),
    parent: Schema.optional(Schema.NullOr(Schema.String)),
    planAcceptedAt: Schema.optional(Schema.String),
    planAcceptedBy: Schema.optional(ActorJson),
    planningNotRequired: Schema.optional(Schema.Boolean),
    priority: Schema.String,
    relations: Schema.optional(Schema.Array(IssueRelationJson)),
    repository: Schema.optional(Schema.String),
    status: Schema.String,
    title: Schema.String,
    type: Schema.String,
    updatedAt: Schema.String,
  }),
  [JsonRecord],
);
const UserProfileDocumentJson = Schema.StructWithRest(
  Schema.Struct({
    aliases: Schema.optional(StringListJson),
    avatarUrl: Schema.optional(Schema.String),
    createdAt: Schema.String,
    disabledAt: Schema.optional(Schema.String),
    displayName: Schema.String,
    email: Schema.String,
    id: Schema.String,
    schemaVersion: Schema.Literal(1),
    source: Schema.Literals(["import", "local-profile", "manual"]),
    timezone: Schema.optional(Schema.String),
    updatedAt: Schema.String,
  }),
  [JsonRecord],
);
const LabelDefinitionDocumentJson = Schema.StructWithRest(
  Schema.Struct({
    archivedAt: Schema.optional(Schema.String),
    color: Schema.String,
    createdAt: Schema.String,
    createdBy: ActorJson,
    description: Schema.optional(Schema.String),
    id: Schema.String,
    name: Schema.String,
    schemaVersion: Schema.Literal(1),
    updatedAt: Schema.String,
  }),
  [JsonRecord],
);
const SavedViewSortJson = Schema.Struct({
  direction: Schema.optional(Schema.Literals(["asc", "desc"])),
  field: Schema.optional(
    Schema.Literals(["createdAt", "dueDate", "priority", "title", "updatedAt"]),
  ),
});
const SavedViewDisplayJson = Schema.Struct({
  density: Schema.optional(Schema.Literals(["comfortable", "compact"])),
  properties: Schema.optional(
    Schema.Array(
      Schema.Literals(["assignee", "dueDate", "estimate", "labels", "priority", "status"]),
    ),
  ),
});
const SavedViewDocumentJson = Schema.StructWithRest(
  Schema.Struct({
    builtIn: Schema.optional(Schema.Boolean),
    createdAt: Schema.String,
    createdBy: ActorJson,
    description: Schema.optional(Schema.String),
    display: Schema.optional(SavedViewDisplayJson),
    groupBy: Schema.Literals([
      "assignee",
      "dueDate",
      "label",
      "none",
      "parent",
      "priority",
      "status",
    ]),
    id: Schema.String,
    kind: Schema.Literals(["board", "list"]),
    name: Schema.String,
    ownerUserId: Schema.optional(Schema.String),
    pinned: Schema.Boolean,
    query: TicketQueryJson,
    repositoryScope: Schema.optional(Schema.Literal("current-repository")),
    schemaVersion: Schema.Literal(1),
    sort: Schema.optional(SavedViewSortJson),
    updatedAt: Schema.String,
  }),
  [JsonRecord],
);
const IssueTemplateDefaultsJson = Schema.Struct({
  assignee: Schema.optional(Schema.NullOr(Schema.String)),
  body: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.NullOr(Schema.String)),
  estimate: Schema.optional(NullableEstimateValueJson),
  externalLinks: Schema.optional(Schema.Array(ExternalLinkJson)),
  labels: Schema.optional(StringListJson),
  parent: Schema.optional(Schema.NullOr(Schema.String)),
  planningNotRequired: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.String),
  repository: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
});
const IssueTemplateDocumentJson = Schema.StructWithRest(
  Schema.Struct({
    active: Schema.Boolean,
    bodyTemplate: Schema.String,
    childTemplates: Schema.optional(StringListJson),
    createdAt: Schema.String,
    createdBy: ActorJson,
    defaults: Schema.optional(IssueTemplateDefaultsJson),
    description: Schema.optional(Schema.String),
    id: Schema.String,
    kind: Schema.Literals([
      "bug",
      "feature",
      "implementation",
      "initiative",
      "qa",
      "specification",
      "story",
    ]),
    name: Schema.String,
    schemaVersion: Schema.Literal(1),
    titleTemplate: Schema.String,
    updatedAt: Schema.String,
  }),
  [JsonRecord],
);
const RepositoryRemoteJson = Schema.Struct({
  name: Schema.String,
  url: Schema.optional(Schema.String),
});
const RepositoryRemotesJson = Schema.Array(RepositoryRemoteJson);
const CycleRepositoryMetadataJson = Schema.Struct({
  createdAt: Schema.String,
  schemaVersion: Schema.Literal(1),
  ticketIdFormat: Schema.Literal("prefix-base36-5+"),
  ticketPrefix: Schema.String,
  updatedAt: Schema.String,
});
const ProjectionCursorJson = Schema.Struct({
  offset: NonNegativeInteger,
});

const NullOrString = Schema.NullOr(Schema.String);
const SqlInteger = Schema.Int;
const RepositoryStatusValueSql = Schema.Literals([
  "degraded",
  "empty",
  "failed",
  "ready",
  "syncing",
]);
const InboxReasonSql = Schema.Literals([
  "assigned",
  "comment_assigned",
  "comment_created",
  "mention",
]);
const InboxStatusSql = Schema.Literals(["archived", "read", "snoozed", "unread"]);

const TicketRowSql = Schema.Struct({
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
  schema_version: SqlInteger,
  snapshot_id: Schema.String,
  status: Schema.String,
  ticket_id: Schema.String,
  title: Schema.String,
  type: Schema.String,
  updated_at: Schema.String,
});

const RecordRowSql = Schema.Struct({
  created_at: Schema.String,
  created_by_email: NullOrString,
  created_by_name: Schema.String,
  created_by_type: Schema.String,
  created_date: Schema.String,
  payload_json: Schema.String,
  record_id: Schema.String,
  record_type: Schema.String,
  repository_id: Schema.String,
  schema_version: SqlInteger,
  ticket_id: Schema.String,
});

const UserRowSql = Schema.Struct({
  aliases_json: NullOrString,
  avatar_url: NullOrString,
  created_at: Schema.String,
  disabled_at: NullOrString,
  display_name: Schema.String,
  email: Schema.String,
  profile_json: Schema.String,
  repository_id: Schema.String,
  schema_version: SqlInteger,
  source: Schema.String,
  timezone: NullOrString,
  updated_at: Schema.String,
  user_id: Schema.String,
});

const LabelRowSql = Schema.Struct({
  archived_at: NullOrString,
  color: Schema.String,
  created_at: Schema.String,
  created_by_email: NullOrString,
  created_by_name: Schema.String,
  created_by_type: Schema.String,
  description: NullOrString,
  label_id: Schema.String,
  label_json: Schema.String,
  name: Schema.String,
  repository_id: Schema.String,
  schema_version: SqlInteger,
  updated_at: Schema.String,
});

const SavedViewRowSql = Schema.Struct({
  built_in: SqlInteger,
  created_at: Schema.String,
  created_by_email: NullOrString,
  created_by_name: Schema.String,
  created_by_type: Schema.String,
  group_by: Schema.String,
  kind: Schema.String,
  name: Schema.String,
  owner_user_id: NullOrString,
  pinned: SqlInteger,
  repository_id: Schema.String,
  schema_version: SqlInteger,
  updated_at: Schema.String,
  view_id: Schema.String,
  view_json: Schema.String,
});

const IssueTemplateRowSql = Schema.Struct({
  active: SqlInteger,
  created_at: Schema.String,
  created_by_email: NullOrString,
  created_by_name: Schema.String,
  created_by_type: Schema.String,
  kind: Schema.String,
  name: Schema.String,
  repository_id: Schema.String,
  schema_version: SqlInteger,
  template_id: Schema.String,
  template_json: Schema.String,
  updated_at: Schema.String,
});

const RepositoryRowSql = Schema.Struct({
  active_generation: SqlInteger,
  active_snapshot_id: NullOrString,
  current_branch: NullOrString,
  cycle_metadata_json: NullOrString,
  default_remote: NullOrString,
  default_remote_url: NullOrString,
  git_dir: NullOrString,
  last_sync_completed_at: NullOrString,
  last_sync_error: NullOrString,
  last_sync_started_at: NullOrString,
  metadata_updated_at: NullOrString,
  remotes_json: NullOrString,
  repository_id: Schema.String,
  sync_status: RepositoryStatusValueSql,
  warning_count: SqlInteger,
  worktree_path: NullOrString,
});

const HistoryRowSql = Schema.Struct({
  author_email: NullOrString,
  author_name: NullOrString,
  changed_ticket_ids: NullOrString,
  committed_at: NullOrString,
  message: NullOrString,
  parent_ids: NullOrString,
  sequence: SqlInteger,
  snapshot_id: Schema.String,
  warning_count: SqlInteger,
});

const InboxListRowSql = Schema.Struct({
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
  reason: InboxReasonSql,
  record_id: NullOrString,
  repository_id: Schema.String,
  sequence: SqlInteger,
  snapshot_id: Schema.String,
  status: InboxStatusSql,
  ticket_id: Schema.String,
  title: Schema.String,
  user_id: Schema.String,
});

const MaterializationWarningRowSql = Schema.Struct({
  created_at: Schema.String,
  message: Schema.String,
  object_id: NullOrString,
  object_type: Schema.String,
  path: Schema.String,
  reason: Schema.String,
  repository_id: Schema.String,
  snapshot_id: Schema.String,
});

const sqlStatements = (source: string): ReadonlyArray<string> =>
  source
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const makeSqlClientDatabase = (
  sql: SqlClient.SqlClient,
  closeEffect: Effect.Effect<void> = Effect.void,
): SqliteDatabaseLike => {
  let transactionContext: Context.Context<never> | undefined;
  const runSync = <A>(effect: Effect.Effect<A, unknown>): A =>
    Effect.runSync(
      transactionContext === undefined ? effect : Effect.provideContext(effect, transactionContext),
    );

  return {
    all: <A extends object = Record<string, unknown>>(
      source: string,
      params: readonly unknown[] = [],
    ) => runSync(sql.unsafe<A>(source, params)),
    close: () => {
      runSync(closeEffect);
    },
    exec: (source) => {
      for (const statement of sqlStatements(source)) {
        runSync(sql.unsafe(statement).pipe(Effect.asVoid));
      }
    },
    get: <A extends object = Record<string, unknown>>(
      source: string,
      params: readonly unknown[] = [],
    ) => runSync(sql.unsafe<A>(source, params)).at(0),
    run: (source, params: readonly unknown[] = []) =>
      runSync(sql.unsafe(source, params).raw) as SqliteRunResult,
    transaction: (f) =>
      Effect.runSync(
        sql.withTransaction(
          Effect.gen(function* () {
            const previousContext = transactionContext;
            transactionContext = yield* Effect.context<never>();
            try {
              return f();
            } finally {
              transactionContext = previousContext;
            }
          }),
        ),
      ),
  };
};

const makeEffectSqliteDatabase = (filename: string): SqliteDatabaseLike => {
  const scope = Effect.runSync(Scope.make("sequential"));
  const context = Effect.runSync(
    Layer.buildWithScope(
      makeSqliteLayer({
        filename,
      }),
      scope,
    ),
  );
  const sql = Context.get(context, SqlClient.SqlClient);

  return makeSqlClientDatabase(sql, Scope.close(scope, Exit.void));
};

export class Projection {
  readonly db: SqliteDatabaseLike;

  constructor(pathOrDatabase: string | SqliteDatabaseLike = ":memory:") {
    this.db =
      typeof pathOrDatabase === "string"
        ? makeEffectSqliteDatabase(pathOrDatabase)
        : pathOrDatabase;
    this.initializeSchema();
  }

  static fromSqlClient(sql: SqlClient.SqlClient): Projection {
    return new Projection(makeSqlClientDatabase(sql));
  }

  close(): void {
    this.db.close();
  }

  private initializeSchema(): void {
    const version = this.userVersion();

    if (version > CURRENT_PROJECTION_SCHEMA_VERSION) {
      throw new DatabaseSqliteError({
        message: `Projection schema version ${version} is newer than supported version ${CURRENT_PROJECTION_SCHEMA_VERSION}`,
        operation: "initializeProjectionSchema",
      });
    }

    const hasRepositories = this.hasTable("repositories");

    if (!hasRepositories) {
      this.db.exec(schemaSql);
      this.db.exec(`PRAGMA user_version = ${CURRENT_PROJECTION_SCHEMA_VERSION}`);
      return;
    }

    this.ensureRepositoryMetadataColumns();
    this.ensureSharedMetadataTables();
    this.ensureInboxTables();
    if (version < CURRENT_PROJECTION_SCHEMA_VERSION) {
      this.db.exec(`PRAGMA user_version = ${CURRENT_PROJECTION_SCHEMA_VERSION}`);
    }
  }

  private userVersion(): number {
    const row = this.db.get("PRAGMA user_version") as { readonly user_version: number } | undefined;

    return row?.user_version ?? 0;
  }

  private hasTable(name: string): boolean {
    const row = this.db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
      name,
    ]) as { readonly name: string } | undefined;

    return row !== undefined;
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.all(`PRAGMA table_info(${table})`) as unknown as ReadonlyArray<{
      readonly name: string;
    }>;

    return rows.some((row) => row.name === column);
  }

  private ensureRepositoryMetadataColumns(): void {
    const columns = [
      ["current_branch", "TEXT"],
      ["cycle_metadata_json", "TEXT"],
      ["default_remote", "TEXT"],
      ["default_remote_url", "TEXT"],
      ["metadata_updated_at", "TEXT"],
      ["remotes_json", "TEXT"],
    ] as const;

    for (const [column, definition] of columns) {
      if (!this.hasColumn("repositories", column)) {
        this.db.exec(`ALTER TABLE repositories ADD COLUMN ${column} ${definition}`);
      }
    }
  }

  private ensureSharedMetadataTables(): void {
    this.db.exec(sharedMetadataSchemaSql);
  }

  private ensureInboxTables(): void {
    this.db.exec(inboxSchemaSql);
  }

  registerRepository(input: RepositoryInput): RepositoryStatus {
    const metadata = normalizeRepositoryMetadata(input);

    this.db.run(
      `INSERT INTO repositories (
          repository_id, display_name, worktree_path, git_dir, watched_ref, sync_status,
          active_generation, warning_count, current_branch, default_remote, default_remote_url,
          metadata_updated_at, remotes_json
        ) VALUES (?, ?, ?, ?, ?, 'empty', 0, 0, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id) DO UPDATE SET
          display_name = excluded.display_name,
          worktree_path = excluded.worktree_path,
          git_dir = excluded.git_dir,
          watched_ref = excluded.watched_ref,
          current_branch = excluded.current_branch,
          default_remote = excluded.default_remote,
          default_remote_url = excluded.default_remote_url,
          metadata_updated_at = excluded.metadata_updated_at,
          remotes_json = excluded.remotes_json`,
      [
        input.repositoryId,
        input.displayName ?? input.repositoryId,
        metadata.worktreePath ?? input.worktreePath ?? null,
        metadata.gitDir ?? input.gitDir ?? null,
        WATCHED_REF,
        metadata.currentBranch ?? null,
        metadata.defaultRemote ?? null,
        metadata.defaultRemoteUrl ?? null,
        metadata.inspectedAt ?? null,
        JSON.stringify(metadata.remotes),
      ],
    );

    return this.repositoryStatus(input.repositoryId);
  }

  updateCycleRepositoryMetadata(
    repositoryId: string,
    metadata: CycleRepositoryMetadata,
  ): RepositoryStatus {
    this.db.run("UPDATE repositories SET cycle_metadata_json = ? WHERE repository_id = ?", [
      JSON.stringify(metadata),
      repositoryId,
    ]);

    return this.repositoryStatus(repositoryId);
  }

  clearCycleRepositoryMetadata(repositoryId: string): RepositoryStatus {
    this.db.run("UPDATE repositories SET cycle_metadata_json = NULL WHERE repository_id = ?", [
      repositoryId,
    ]);

    return this.repositoryStatus(repositoryId);
  }

  setCycleRepositoryMetadata(
    repositoryId: string,
    metadata: CycleRepositoryMetadata | undefined,
  ): RepositoryStatus {
    return metadata === undefined
      ? this.clearCycleRepositoryMetadata(repositoryId)
      : this.updateCycleRepositoryMetadata(repositoryId, metadata);
  }

  repositoryStatus(repositoryId: string): RepositoryStatus {
    const row = this.db.get("SELECT * FROM repositories WHERE repository_id = ?", [
      repositoryId,
    ]) as RepositoryRow | undefined;

    if (row === undefined) {
      return {
        activeGeneration: 0,
        activeSnapshotId: null,
        repositoryId,
        status: "empty",
        warningCount: 0,
      };
    }

    return repositoryStatusFromRow(row);
  }

  listRepositories(): ReadonlyArray<RepositoryStatus> {
    const rows = this.db.all(
      "SELECT * FROM repositories ORDER BY repository_id ASC",
    ) as unknown as ReadonlyArray<RepositoryRow>;

    return rows.map(repositoryStatusFromRow);
  }

  maxCommitSequence(repositoryId: string): number {
    const row = this.db.get(
      "SELECT MAX(sequence) AS sequence FROM commits WHERE repository_id = ?",
      [repositoryId],
    ) as { readonly sequence: number | null } | undefined;

    return row?.sequence ?? 0;
  }

  markSyncStarted(repositoryId: string, now: string): void {
    this.db.run(
      `UPDATE repositories
         SET sync_status = 'syncing', last_sync_started_at = ?, last_sync_error = NULL
         WHERE repository_id = ?`,
      [now, repositoryId],
    );
  }

  markSyncFailed(repositoryId: string, message: string): void {
    this.db.run(
      `UPDATE repositories
         SET sync_status = 'failed', last_sync_error = ?
         WHERE repository_id = ?`,
      [message, repositoryId],
    );
  }

  activateSnapshot(input: {
    readonly repositoryId: string;
    readonly snapshotId: string | null;
    readonly completedAt: string;
  }): RepositoryStatus {
    const warningCount = this.warningCount(input.repositoryId, input.snapshotId);
    const status: RepositoryStatusValue =
      input.snapshotId === null ? "empty" : warningCount > 0 ? "degraded" : "ready";

    this.db.run(
      `UPDATE repositories
         SET active_snapshot_id = ?,
             active_generation = active_generation + 1,
             sync_status = ?,
             last_sync_completed_at = ?,
             last_sync_error = NULL,
             warning_count = ?
         WHERE repository_id = ?`,
      [input.snapshotId, status, input.completedAt, warningCount, input.repositoryId],
    );

    return this.repositoryStatus(input.repositoryId);
  }

  clearRepositoryProjection(repositoryId: string): void {
    const tables = [
      "users",
      "labels",
      "saved_views",
      "issue_templates",
      "ticket_labels",
      "ticket_external_links",
      "comments",
      "records",
      "ticket_relations",
      "tickets",
      "commit_parents",
      "commit_changes",
      "commits",
      "inbox_items",
      "materialization_warnings",
      "search_documents",
      "search_fts",
    ];

    for (const table of tables) {
      this.db.run(`DELETE FROM ${table} WHERE repository_id = ?`, [repositoryId]);
    }
  }

  upsertTicket(input: {
    readonly path: string;
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly ticket: TicketDocument;
  }): void {
    const ticket = input.ticket;
    const frontmatter = ticket.frontmatter;
    const labels = ticket.labels ?? [];
    const relations = frontmatter.relations ?? [];

    this.db.run(
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
        JSON.stringify(labels),
        JSON.stringify(frontmatter),
        ticket.schemaVersion,
        frontmatter.dueDate ?? null,
        frontmatter.estimate === null || frontmatter.estimate === undefined
          ? null
          : String(frontmatter.estimate),
        frontmatter.archivedAt ?? null,
        frontmatter.deletedAt ?? null,
        relations.length === 0 ? null : JSON.stringify(relations),
      ],
    );

    this.db.run("DELETE FROM ticket_labels WHERE repository_id = ? AND ticket_id = ?", [
      input.repositoryId,
      ticket.id,
    ]);
    for (const label of labels) {
      this.db.run(
        `INSERT OR IGNORE INTO ticket_labels (repository_id, ticket_id, label)
           VALUES (?, ?, ?)`,
        [input.repositoryId, ticket.id, label],
      );
    }

    this.db.run("DELETE FROM ticket_external_links WHERE repository_id = ? AND ticket_id = ?", [
      input.repositoryId,
      ticket.id,
    ]);
    for (const link of frontmatter.externalLinks ?? []) {
      this.db.run(
        `INSERT INTO ticket_external_links (repository_id, ticket_id, source, title, url)
           VALUES (?, ?, ?, ?, ?)`,
        [input.repositoryId, ticket.id, link.source ?? null, link.title ?? null, link.url],
      );
    }

    this.db.run("DELETE FROM ticket_relations WHERE repository_id = ? AND ticket_id = ?", [
      input.repositoryId,
      ticket.id,
    ]);
    for (const relation of relations) {
      this.db.run(
        `INSERT OR IGNORE INTO ticket_relations (
            repository_id, ticket_id, related_issue_id, relation_type
          ) VALUES (?, ?, ?, ?)`,
        [input.repositoryId, ticket.id, relation.issueId, relation.type],
      );
    }

    this.upsertSearchDocument({
      body: ticket.body,
      documentId: `ticket:${ticket.id}`,
      repositoryId: input.repositoryId,
      sourceType: "ticket",
      ticketId: ticket.id,
      title: frontmatter.title,
    });
  }

  deleteTicket(repositoryId: string, ticketId: string): void {
    this.db.run("DELETE FROM tickets WHERE repository_id = ? AND ticket_id = ?", [
      repositoryId,
      ticketId,
    ]);
    this.db.run("DELETE FROM ticket_labels WHERE repository_id = ? AND ticket_id = ?", [
      repositoryId,
      ticketId,
    ]);
    this.db.run("DELETE FROM ticket_external_links WHERE repository_id = ? AND ticket_id = ?", [
      repositoryId,
      ticketId,
    ]);
    this.db.run("DELETE FROM ticket_relations WHERE repository_id = ? AND ticket_id = ?", [
      repositoryId,
      ticketId,
    ]);
    this.deleteSearchDocument(repositoryId, `ticket:${ticketId}`);
  }

  upsertRecord(input: {
    readonly record: LinkedRecord;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }): void {
    const record = input.record;

    this.db.run(
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
        JSON.stringify(record.payload),
        record.schemaVersion,
      ],
    );

    if (normalizeKey(record.recordType) === "comment") {
      const body = commentBody(record.payload);
      this.db.run(
        `INSERT INTO comments (repository_id, record_id, ticket_id, body, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(repository_id, record_id) DO UPDATE SET
             ticket_id = excluded.ticket_id,
             body = excluded.body,
             created_at = excluded.created_at`,
        [input.repositoryId, record.id, record.issueId, body, record.createdAt],
      );
      this.upsertSearchDocument({
        body,
        documentId: `comment:${record.id}`,
        repositoryId: input.repositoryId,
        sourceType: "comment",
        ticketId: record.issueId,
        title: "",
      });
    } else {
      this.db.run("DELETE FROM comments WHERE repository_id = ? AND record_id = ?", [
        input.repositoryId,
        record.id,
      ]);
      this.deleteSearchDocument(input.repositoryId, `comment:${record.id}`);
    }
  }

  deleteRecord(repositoryId: string, recordId: string): void {
    this.db.run("DELETE FROM records WHERE repository_id = ? AND record_id = ?", [
      repositoryId,
      recordId,
    ]);
    this.db.run("DELETE FROM comments WHERE repository_id = ? AND record_id = ?", [
      repositoryId,
      recordId,
    ]);
    this.deleteSearchDocument(repositoryId, `comment:${recordId}`);
  }

  upsertUser(input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly user: UserProfileDocument;
  }): void {
    const user = input.user;

    this.db.run(
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
        user.aliases === undefined ? null : JSON.stringify(user.aliases),
        user.createdAt,
        user.updatedAt,
        JSON.stringify(user),
        user.schemaVersion,
      ],
    );
  }

  deleteUser(repositoryId: string, userId: string): void {
    this.db.run("DELETE FROM users WHERE repository_id = ? AND user_id = ?", [
      repositoryId,
      userId,
    ]);
  }

  upsertLabel(input: {
    readonly label: LabelDefinitionDocument;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }): void {
    const label = input.label;

    this.db.run(
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
        JSON.stringify(label),
        label.schemaVersion,
      ],
    );
  }

  deleteLabel(repositoryId: string, labelId: string): void {
    this.db.run("DELETE FROM labels WHERE repository_id = ? AND label_id = ?", [
      repositoryId,
      labelId,
    ]);
  }

  upsertView(input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly view: SavedViewDocument;
  }): void {
    const view = input.view;

    this.db.run(
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
        JSON.stringify(view),
        view.schemaVersion,
      ],
    );
  }

  deleteView(repositoryId: string, viewId: string): void {
    this.db.run("DELETE FROM saved_views WHERE repository_id = ? AND view_id = ?", [
      repositoryId,
      viewId,
    ]);
  }

  upsertTemplate(input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly template: IssueTemplateDocument;
  }): void {
    const template = input.template;

    this.db.run(
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
        JSON.stringify(template),
        template.schemaVersion,
      ],
    );
  }

  deleteTemplate(repositoryId: string, templateId: string): void {
    this.db.run("DELETE FROM issue_templates WHERE repository_id = ? AND template_id = ?", [
      repositoryId,
      templateId,
    ]);
  }

  upsertCommit(input: {
    readonly authorEmail?: string;
    readonly authorName?: string;
    readonly committedAt?: string;
    readonly committerEmail?: string;
    readonly committerName?: string;
    readonly message?: string;
    readonly parentIds: ReadonlyArray<string>;
    readonly repositoryId: string;
    readonly rootTreeId: string;
    readonly sequence: number;
    readonly snapshotId: string;
  }): void {
    this.db.run(
      `INSERT INTO commits (
          repository_id, snapshot_id, root_tree_id, author_name, author_email, committed_at,
          committer_name, committer_email, message, sequence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(repository_id, snapshot_id) DO UPDATE SET
          root_tree_id = excluded.root_tree_id,
          author_name = excluded.author_name,
          author_email = excluded.author_email,
          committed_at = excluded.committed_at,
          committer_name = excluded.committer_name,
          committer_email = excluded.committer_email,
          message = excluded.message,
          sequence = excluded.sequence`,
      [
        input.repositoryId,
        input.snapshotId,
        input.rootTreeId,
        input.authorName ?? null,
        input.authorEmail ?? null,
        input.committedAt ?? null,
        input.committerName ?? null,
        input.committerEmail ?? null,
        input.message ?? null,
        input.sequence,
      ],
    );

    this.db.run("DELETE FROM commit_parents WHERE repository_id = ? AND snapshot_id = ?", [
      input.repositoryId,
      input.snapshotId,
    ]);
    for (const parentId of input.parentIds) {
      this.db.run(
        `INSERT OR IGNORE INTO commit_parents (repository_id, snapshot_id, parent_snapshot_id)
           VALUES (?, ?, ?)`,
        [input.repositoryId, input.snapshotId, parentId],
      );
    }
  }

  replaceCommitChanges(input: {
    readonly changes: ReadonlyArray<{
      readonly changeType: "added" | "deleted" | "modified";
      readonly objectId?: string;
      readonly objectType: string;
      readonly path: string;
      readonly ticketId?: string;
    }>;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }): void {
    this.db.run("DELETE FROM commit_changes WHERE repository_id = ? AND snapshot_id = ?", [
      input.repositoryId,
      input.snapshotId,
    ]);

    for (const change of input.changes) {
      this.db.run(
        `INSERT INTO commit_changes (
            repository_id, snapshot_id, change_type, object_type, object_id, ticket_id, path
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.repositoryId,
          input.snapshotId,
          change.changeType,
          change.objectType,
          change.objectId ?? null,
          change.ticketId ?? null,
          change.path,
        ],
      );
    }
  }

  addWarning(warning: MaterializationWarning): void {
    this.db.run(
      `INSERT INTO materialization_warnings (
          repository_id, snapshot_id, path, object_type, object_id, reason, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        warning.repositoryId,
        warning.snapshotId,
        warning.path,
        warning.objectType,
        warning.objectId ?? null,
        warning.reason,
        warning.message,
        warning.createdAt,
      ],
    );
  }

  warnings(repositoryId: string): ReadonlyArray<MaterializationWarning> {
    return this.db
      .all(
        `SELECT repository_id, snapshot_id, path, object_type, object_id, reason, message, created_at
         FROM materialization_warnings
         WHERE repository_id = ?
         ORDER BY created_at ASC, path ASC`,
        [repositoryId],
      )
      .map((row) => {
        const warning = decodeSqlRow<{
          readonly created_at: string;
          readonly message: string;
          readonly object_id: string | null;
          readonly object_type: string;
          readonly path: string;
          readonly reason: string;
          readonly repository_id: string;
          readonly snapshot_id: string;
        }>(MaterializationWarningRowSql, row);

        return {
          createdAt: warning.created_at,
          message: warning.message,
          objectId: warning.object_id ?? undefined,
          objectType: warning.object_type,
          path: warning.path,
          reason: warning.reason,
          repositoryId: warning.repository_id,
          snapshotId: warning.snapshot_id,
        };
      });
  }

  upsertInboxItem(item: InboxItem): void {
    this.db.run(
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
  }

  listInbox(query: InboxQuery): InboxPage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const filtered = this.inboxFilters(query, true);
    const rows = this.db.all(
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
    ) as unknown as ReadonlyArray<InboxListRow>;
    const entries = rows.slice(0, limit).map(inboxEntryFromRow);

    return {
      activeSnapshotIds: this.inboxActiveSnapshotIds(query.repositoryIds),
      entries,
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  inboxSummary(query: InboxQuery): InboxSummary {
    const filtered = this.inboxFilters(query, false);
    const rows = this.db.all(
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
      [...filtered.params],
    ) as unknown as ReadonlyArray<{
      readonly count: number;
      readonly latest: string | null;
      readonly reason: InboxReason;
      readonly repository_id: string;
      readonly status: InboxStatus;
    }>;
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
      repositories: this.inboxRepositorySummaries(query.repositoryIds),
      unreadCount,
    };
  }

  markInboxRead(input: InboxMutationInput, now: string): InboxMutationResult {
    return this.setInboxItemStatus(input, "read", now);
  }

  markInboxUnread(input: InboxMutationInput, now: string): InboxMutationResult {
    return this.setInboxItemStatus(input, "unread", now);
  }

  archiveInboxItems(input: InboxMutationInput, now: string): InboxMutationResult {
    return this.setInboxItemStatus(input, "archived", now);
  }

  getTicket(repositoryId: string, ticketId: string): TicketDocument | null {
    const row = this.db.get("SELECT * FROM tickets WHERE repository_id = ? AND ticket_id = ?", [
      repositoryId,
      ticketId,
    ]) as TicketRow | undefined;

    return row === undefined ? null : ticketFromRow(row);
  }

  listTickets(query: TicketQuery = {}): TicketPage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const filters: Array<string> = [];
    const params: Array<SqlValue> = [];

    if (query.repositoryIds !== undefined && query.repositoryIds.length > 0) {
      filters.push(`t.repository_id IN (${placeholders(query.repositoryIds.length)})`);
      params.push(...query.repositoryIds);
    }
    if (query.archived === true) {
      filters.push("t.archived_at IS NOT NULL");
    } else {
      filters.push("t.archived_at IS NULL");
    }
    if (query.deleted === true) {
      filters.push("t.deleted_at IS NOT NULL");
    } else {
      filters.push("t.deleted_at IS NULL");
    }
    if (query.status !== undefined) {
      filters.push("t.status = ?");
      params.push(normalizeKey(query.status));
    }
    if (query.statusIn !== undefined && query.statusIn.length > 0) {
      filters.push(`t.status IN (${placeholders(query.statusIn.length)})`);
      params.push(...query.statusIn.map((status) => normalizeKey(status)));
    }
    if (query.priority !== undefined) {
      filters.push("t.priority = ?");
      params.push(normalizeKey(query.priority));
    }
    if (query.priorityIn !== undefined && query.priorityIn.length > 0) {
      filters.push(`t.priority IN (${placeholders(query.priorityIn.length)})`);
      params.push(...query.priorityIn.map((priority) => normalizeKey(priority)));
    }
    if (query.type !== undefined) {
      filters.push("t.type = ?");
      params.push(normalizeKey(query.type));
    }
    if (query.assignee !== undefined) {
      if (query.assignee === null) {
        filters.push("(t.assignee IS NULL OR t.assignee = 'none')");
      } else {
        filters.push("t.assignee = ?");
        params.push(normalizeKey(query.assignee));
      }
    }
    if (query.assigneeIn !== undefined && query.assigneeIn.length > 0) {
      filters.push(`t.assignee IN (${placeholders(query.assigneeIn.length)})`);
      params.push(...query.assigneeIn.map((assignee) => normalizeKey(assignee)));
    }
    if (query.hasAssignee === true) {
      filters.push("t.assignee IS NOT NULL AND t.assignee != 'none'");
    } else if (query.hasAssignee === false) {
      filters.push("(t.assignee IS NULL OR t.assignee = 'none')");
    }
    if (query.parent !== undefined) {
      filters.push("t.parent_id = ?");
      params.push(ticketReferenceKey(query.parent));
    }
    if (query.label !== undefined) {
      filters.push(
        `EXISTS (
          SELECT 1 FROM ticket_labels l
          WHERE l.repository_id = t.repository_id
            AND l.ticket_id = t.ticket_id
            AND l.label = ?
        )`,
      );
      params.push(normalizeKey(query.label));
    }
    if (query.labelIn !== undefined && query.labelIn.length > 0) {
      filters.push(
        `EXISTS (
          SELECT 1 FROM ticket_labels l
          WHERE l.repository_id = t.repository_id
            AND l.ticket_id = t.ticket_id
            AND l.label IN (${placeholders(query.labelIn.length)})
        )`,
      );
      params.push(...query.labelIn.map((label) => normalizeKey(label)));
    }
    if (query.hasLabels === true) {
      filters.push(
        `EXISTS (
          SELECT 1 FROM ticket_labels l
          WHERE l.repository_id = t.repository_id
            AND l.ticket_id = t.ticket_id
        )`,
      );
    } else if (query.hasLabels === false) {
      filters.push(
        `NOT EXISTS (
          SELECT 1 FROM ticket_labels l
          WHERE l.repository_id = t.repository_id
            AND l.ticket_id = t.ticket_id
        )`,
      );
    }
    if (query.dueAfter !== undefined) {
      filters.push("t.due_date >= ?");
      params.push(query.dueAfter);
    }
    if (query.dueBefore !== undefined) {
      filters.push("t.due_date <= ?");
      params.push(query.dueBefore);
    }
    if (query.estimate !== undefined) {
      filters.push("t.estimate = ?");
      params.push(String(query.estimate));
    }
    if (query.hasDueDate === true) {
      filters.push("t.due_date IS NOT NULL");
    } else if (query.hasDueDate === false) {
      filters.push("t.due_date IS NULL");
    }
    if (query.hasEstimate === true) {
      filters.push("t.estimate IS NOT NULL");
    } else if (query.hasEstimate === false) {
      filters.push("t.estimate IS NULL");
    }
    if (query.relation !== undefined) {
      const relationFilters = ["r.repository_id = t.repository_id", "r.ticket_id = t.ticket_id"];

      if (query.relation.issueId !== undefined) {
        relationFilters.push("r.related_issue_id = ?");
        params.push(query.relation.issueId);
      }
      if (query.relation.type !== undefined) {
        relationFilters.push("r.relation_type = ?");
        params.push(query.relation.type);
      }

      filters.push(
        `EXISTS (
          SELECT 1 FROM ticket_relations r
          WHERE ${relationFilters.join(" AND ")}
        )`,
      );
    }
    if (query.blocked === true) {
      filters.push(
        `EXISTS (
          SELECT 1 FROM ticket_relations r
          WHERE r.repository_id = t.repository_id
            AND r.ticket_id = t.ticket_id
            AND r.relation_type = 'blocked-by'
        )`,
      );
    } else if (query.blocked === false) {
      filters.push(
        `NOT EXISTS (
          SELECT 1 FROM ticket_relations r
          WHERE r.repository_id = t.repository_id
            AND r.ticket_id = t.ticket_id
            AND r.relation_type = 'blocked-by'
        )`,
      );
    }
    if (query.text !== undefined && query.text.trim().length > 0) {
      const pattern = `%${query.text.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      filters.push("(lower(t.title) LIKE ? ESCAPE '\\' OR lower(t.body) LIKE ? ESCAPE '\\')");
      params.push(pattern, pattern);
    }
    if (query.updatedAfter !== undefined) {
      filters.push("t.updated_at >= ?");
      params.push(query.updatedAfter);
    }
    if (query.updatedBefore !== undefined) {
      filters.push("t.updated_at <= ?");
      params.push(query.updatedBefore);
    }
    if (query.staleBefore !== undefined) {
      filters.push("t.updated_at < ?");
      params.push(query.staleBefore);
    }

    const orderColumn =
      query.orderBy === "createdAt"
        ? "created_at"
        : query.orderBy === "dueDate"
          ? "due_date"
          : query.orderBy === "priority"
            ? "priority"
            : query.orderBy === "title"
              ? "title"
              : "updated_at";
    const direction = query.orderDirection === "asc" ? "ASC" : "DESC";
    const where = filters.length === 0 ? "" : `WHERE ${filters.join(" AND ")}`;
    const rows = this.db.all(
      `SELECT t.*
         FROM tickets t
         ${where}
         ORDER BY t.${orderColumn} ${direction}, t.ticket_id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit + 1, cursor.offset],
    ) as unknown as ReadonlyArray<TicketRow>;
    const entries = rows.slice(0, limit).map(ticketFromRow);

    return {
      entries,
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  searchTickets(query: SearchTicketsQuery): TicketSearchPage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const params: Array<SqlValue> = [toFtsQuery(query.text)];
    const repositoryFilter =
      query.repositoryIds !== undefined && query.repositoryIds.length > 0
        ? `AND f.repository_id IN (${placeholders(query.repositoryIds.length)})`
        : "";

    if (query.repositoryIds !== undefined && query.repositoryIds.length > 0) {
      params.push(...query.repositoryIds);
    }

    const rows = this.db.all(
      `SELECT DISTINCT f.repository_id, f.ticket_id
         FROM search_fts f
         JOIN tickets t
           ON t.repository_id = f.repository_id AND t.ticket_id = f.ticket_id
         WHERE search_fts MATCH ?
         AND t.archived_at IS NULL
         AND t.deleted_at IS NULL
         ${repositoryFilter}
         ORDER BY f.ticket_id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit + 1, cursor.offset],
    ) as unknown as ReadonlyArray<{
      readonly repository_id: string;
      readonly ticket_id: string;
    }>;
    const pageRows = rows.slice(0, limit);

    return {
      entries: pageRows.flatMap((row) => {
        const ticket = this.getTicket(row.repository_id, row.ticket_id);

        if (ticket === null) return [];

        return [
          {
            matchedFields: this.matchedFields(row.repository_id, row.ticket_id, query.text),
            ticket,
          },
        ];
      }),
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  getUser(repositoryId: string, userId: string): UserProfileDocument | null {
    const row = this.db.get("SELECT * FROM users WHERE repository_id = ? AND user_id = ?", [
      repositoryId,
      userId,
    ]) as UserRow | undefined;

    return row === undefined ? null : userFromRow(row);
  }

  usersByRecipientLookupKeys(
    repositoryId: string,
    lookupKeys: ReadonlyArray<string>,
  ): ReadonlyArray<UserProfileDocument> {
    const normalized = [
      ...new Set(lookupKeys.map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0)),
    ];

    if (normalized.length === 0) return [];

    const lookupPlaceholders = placeholders(normalized.length);
    const aliasFilters = normalized.map(() => "lower(aliases_json) LIKE ?").join(" OR ");
    const aliasParams = normalized.map((key) => `%"${key.replaceAll('"', '\\"')}"%`);
    const rows = this.db.all(
      `SELECT * FROM users
         WHERE repository_id = ?
           AND disabled_at IS NULL
           AND (
             lower(user_id) IN (${lookupPlaceholders})
             OR lower(email) IN (${lookupPlaceholders})
             OR lower(display_name) IN (${lookupPlaceholders})
             OR (${aliasFilters})
           )
         ORDER BY user_id ASC`,
      [repositoryId, ...normalized, ...normalized, ...normalized, ...aliasParams],
    ) as unknown as ReadonlyArray<UserRow>;

    return rows.map(userFromRow);
  }

  listUsers(repositoryId: string, query: UserProfileQuery = {}): UserProfilePage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const filters = ["repository_id = ?"];
    const params: Array<SqlValue> = [repositoryId];

    if (query.disabled === true) {
      filters.push("disabled_at IS NOT NULL");
    } else if (query.disabled === false) {
      filters.push("disabled_at IS NULL");
    }
    if (query.text !== undefined && query.text.trim().length > 0) {
      const pattern = `%${query.text.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      filters.push("(lower(display_name) LIKE ? ESCAPE '\\' OR lower(email) LIKE ? ESCAPE '\\')");
      params.push(pattern, pattern);
    }

    const rows = this.db.all(
      `SELECT * FROM users
         WHERE ${filters.join(" AND ")}
         ORDER BY disabled_at IS NOT NULL ASC, display_name ASC, user_id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit + 1, cursor.offset],
    ) as unknown as ReadonlyArray<UserRow>;

    return {
      entries: rows.slice(0, limit).map(userFromRow),
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  listLabels(repositoryId: string, query: LabelDefinitionQuery = {}): LabelDefinitionPage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const filters = ["repository_id = ?"];
    const params: Array<SqlValue> = [repositoryId];

    if (query.archived === true) {
      filters.push("archived_at IS NOT NULL");
    } else if (query.archived !== undefined) {
      filters.push("archived_at IS NULL");
    }
    if (query.text !== undefined && query.text.trim().length > 0) {
      const pattern = `%${query.text.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      filters.push("(lower(name) LIKE ? ESCAPE '\\' OR lower(label_id) LIKE ? ESCAPE '\\')");
      params.push(pattern, pattern);
    }

    const rows = this.db.all(
      `SELECT * FROM labels
         WHERE ${filters.join(" AND ")}
         ORDER BY archived_at IS NOT NULL ASC, name ASC, label_id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit + 1, cursor.offset],
    ) as unknown as ReadonlyArray<LabelRow>;

    return {
      entries: rows.slice(0, limit).map(labelFromRow),
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  listViews(repositoryId: string, query: SavedViewQuery = {}): SavedViewPage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
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
      const pattern = `%${query.text.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      filters.push("lower(name) LIKE ? ESCAPE '\\'");
      params.push(pattern);
    }

    const rows = this.db.all(
      `SELECT * FROM saved_views
         WHERE ${filters.join(" AND ")}
         ORDER BY pinned DESC, built_in DESC, name ASC, view_id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit + 1, cursor.offset],
    ) as unknown as ReadonlyArray<SavedViewRow>;

    return {
      entries: rows.slice(0, limit).map(viewFromRow),
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  getView(repositoryId: string, viewId: string): SavedViewDocument | null {
    const row = this.db.get("SELECT * FROM saved_views WHERE repository_id = ? AND view_id = ?", [
      repositoryId,
      viewId,
    ]) as SavedViewRow | undefined;

    return row === undefined ? null : viewFromRow(row);
  }

  listTemplates(repositoryId: string, query: IssueTemplateQuery = {}): IssueTemplatePage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
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
      const pattern = `%${query.text.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      filters.push("lower(name) LIKE ? ESCAPE '\\'");
      params.push(pattern);
    }

    const rows = this.db.all(
      `SELECT * FROM issue_templates
         WHERE ${filters.join(" AND ")}
         ORDER BY active DESC, kind ASC, name ASC, template_id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit + 1, cursor.offset],
    ) as unknown as ReadonlyArray<IssueTemplateRow>;

    return {
      entries: rows.slice(0, limit).map(templateFromRow),
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  getTemplate(repositoryId: string, templateId: string): IssueTemplateDocument | null {
    const row = this.db.get(
      "SELECT * FROM issue_templates WHERE repository_id = ? AND template_id = ?",
      [repositoryId, templateId],
    ) as IssueTemplateRow | undefined;

    return row === undefined ? null : templateFromRow(row);
  }

  ticketRecords(repositoryId: string, ticketId: string, query: RecordQuery = {}): RecordPage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const params: Array<SqlValue> = [repositoryId, ticketId];
    const filter = query.recordType === undefined ? "" : "AND record_type = ?";

    if (query.recordType !== undefined) params.push(normalizeKey(query.recordType));

    const rows = this.db.all(
      `SELECT * FROM records
         WHERE repository_id = ? AND ticket_id = ?
         ${filter}
         ORDER BY created_at ASC, record_id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit + 1, cursor.offset],
    ) as unknown as ReadonlyArray<RecordRow>;
    const entries = rows.slice(0, limit).map(recordFromRow);

    return {
      entries,
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  ticketComments(repositoryId: string, ticketId: string, query: RecordQuery = {}): RecordPage {
    return this.ticketRecords(repositoryId, ticketId, {
      ...query,
      recordType: "comment",
    });
  }

  repositoryHistory(repositoryId: string, query: RepositoryHistoryQuery = {}): HistoryPage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
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

    const rows = this.db.all(
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
    ) as unknown as ReadonlyArray<HistoryRow>;
    const entries = rows.slice(0, limit).map(historyFromRow);

    return {
      entries,
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  ticketVisible(repositoryId: string, ticketId: string): boolean {
    const row = this.db.get("SELECT 1 FROM tickets WHERE repository_id = ? AND ticket_id = ?", [
      repositoryId,
      ticketId,
    ]);

    return row !== undefined;
  }

  recordVisible(repositoryId: string, recordId: string): boolean {
    const row = this.db.get("SELECT 1 FROM records WHERE repository_id = ? AND record_id = ?", [
      repositoryId,
      recordId,
    ]);

    return row !== undefined;
  }

  transaction<A>(f: () => A): A {
    return this.db.transaction(f);
  }

  private warningCount(repositoryId: string, snapshotId: string | null): number {
    if (snapshotId === null) return 0;

    const row = this.db.get(
      `SELECT COUNT(*) AS count
         FROM materialization_warnings
         WHERE repository_id = ? AND snapshot_id = ?`,
      [repositoryId, snapshotId],
    ) as { readonly count: number } | undefined;

    return row?.count ?? 0;
  }

  private inboxFilters(
    query: InboxQuery,
    includeStatusFilter: boolean,
  ): {
    readonly params: ReadonlyArray<SqlValue>;
    readonly where: string;
  } {
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
      filters.push("t.archived_at IS NULL");
      filters.push("t.deleted_at IS NULL");
    }
    if (includeStatusFilter && query.status !== "all") {
      filters.push("COALESCE(s.status, 'unread') = ?");
      params.push(query.status ?? "unread");
    }

    return {
      params,
      where: filters.join(" AND "),
    };
  }

  private inboxActiveSnapshotIds(
    repositoryIds: ReadonlyArray<string> | undefined,
  ): Readonly<Record<string, string | null>> {
    const rows =
      repositoryIds !== undefined && repositoryIds.length > 0
        ? (this.db.all(
            `SELECT repository_id, active_snapshot_id
               FROM repositories
               WHERE repository_id IN (${placeholders(repositoryIds.length)})
               ORDER BY repository_id ASC`,
            [...repositoryIds],
          ) as unknown as ReadonlyArray<{
            readonly active_snapshot_id: string | null;
            readonly repository_id: string;
          }>)
        : (this.db.all(`SELECT repository_id, active_snapshot_id
               FROM repositories
               ORDER BY repository_id ASC`) as unknown as ReadonlyArray<{
            readonly active_snapshot_id: string | null;
            readonly repository_id: string;
          }>);

    return Object.fromEntries(rows.map((row) => [row.repository_id, row.active_snapshot_id]));
  }

  private inboxRepositorySummaries(
    repositoryIds: ReadonlyArray<string> | undefined,
  ): InboxSummary["repositories"] {
    const rows =
      repositoryIds !== undefined && repositoryIds.length > 0
        ? (this.db.all(
            `SELECT repository_id, active_snapshot_id, sync_status, warning_count
               FROM repositories
               WHERE repository_id IN (${placeholders(repositoryIds.length)})
               ORDER BY repository_id ASC`,
            [...repositoryIds],
          ) as unknown as ReadonlyArray<RepositoryRow>)
        : (this.db.all(`SELECT repository_id, active_snapshot_id, sync_status, warning_count
               FROM repositories
               ORDER BY repository_id ASC`) as unknown as ReadonlyArray<RepositoryRow>);

    return rows.map((row) => ({
      activeSnapshotId: row.active_snapshot_id,
      repositoryId: row.repository_id,
      status: row.sync_status,
      warningCount: row.warning_count,
    }));
  }

  private setInboxItemStatus(
    input: InboxMutationInput,
    status: InboxStatus,
    now: string,
  ): InboxMutationResult {
    if (input.itemIds.length === 0) {
      return {
        matchedCount: 0,
        missingItemIds: [],
        status,
        updatedCount: 0,
      };
    }

    const rows = this.db.all(
      `SELECT repository_id, item_id
         FROM inbox_items
         WHERE user_id = ? AND item_id IN (${placeholders(input.itemIds.length)})
         ORDER BY repository_id ASC, item_id ASC`,
      [input.userId, ...input.itemIds],
    ) as unknown as ReadonlyArray<{
      readonly item_id: string;
      readonly repository_id: string;
    }>;
    const foundIds = new Set(rows.map((row) => row.item_id));
    const missingItemIds = input.itemIds.filter((itemId) => !foundIds.has(itemId));

    if (missingItemIds.length > 0 && input.allowMissing !== true) {
      throw new DatabaseSqliteError({
        message: `unknown inbox item ids: ${missingItemIds.join(", ")}`,
        operation: "setInboxItemStatus",
      });
    }

    if (status === "unread") {
      for (const row of rows) {
        this.db.run(
          `DELETE FROM inbox_item_state
             WHERE repository_id = ? AND user_id = ? AND item_id = ?`,
          [row.repository_id, input.userId, row.item_id],
        );
      }
    } else {
      for (const row of rows) {
        this.db.run(
          `INSERT INTO inbox_item_state (
              repository_id, user_id, item_id, status, read_at, archived_at, snoozed_until,
              updated_at
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
        );
      }
    }

    return {
      matchedCount: rows.length,
      missingItemIds,
      status,
      updatedCount: rows.length,
    };
  }

  private upsertSearchDocument(input: {
    readonly body: string;
    readonly documentId: string;
    readonly repositoryId: string;
    readonly sourceType: "comment" | "ticket";
    readonly ticketId: string;
    readonly title: string;
  }): void {
    this.deleteSearchDocument(input.repositoryId, input.documentId);
    this.db.run(
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
    this.db.run(
      `INSERT INTO search_fts (repository_id, document_id, ticket_id, title, body)
         VALUES (?, ?, ?, ?, ?)`,
      [input.repositoryId, input.documentId, input.ticketId, input.title, input.body],
    );
  }

  private deleteSearchDocument(repositoryId: string, documentId: string): void {
    this.db.run("DELETE FROM search_documents WHERE repository_id = ? AND document_id = ?", [
      repositoryId,
      documentId,
    ]);
    this.db.run("DELETE FROM search_fts WHERE repository_id = ? AND document_id = ?", [
      repositoryId,
      documentId,
    ]);
  }

  private matchedFields(
    repositoryId: string,
    ticketId: string,
    text: string,
  ): ReadonlyArray<"body" | "comment" | "title"> {
    const needle = text.toLowerCase();
    const fields = new Set<"body" | "comment" | "title">();
    const ticket = this.getTicket(repositoryId, ticketId);

    if (ticket?.frontmatter.title.toLowerCase().includes(needle) === true) fields.add("title");
    if (ticket?.body.toLowerCase().includes(needle) === true) fields.add("body");

    const comments = this.db.all(
      "SELECT body FROM comments WHERE repository_id = ? AND ticket_id = ?",
      [repositoryId, ticketId],
    ) as unknown as ReadonlyArray<{ readonly body: string }>;

    if (comments.some((comment) => comment.body.toLowerCase().includes(needle))) {
      fields.add("comment");
    }

    return [...fields];
  }
}

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

const normalizeRepositoryMetadata = (input: RepositoryInput): RepositoryMetadata => ({
  currentBranch: input.metadata?.currentBranch,
  defaultRemote: input.metadata?.defaultRemote,
  defaultRemoteUrl: input.metadata?.defaultRemoteUrl,
  gitDir: input.metadata?.gitDir ?? input.gitDir,
  inspectedAt: input.metadata?.inspectedAt,
  remotes: input.metadata?.remotes ?? [],
  worktreePath: input.metadata?.worktreePath ?? input.worktreePath,
});

const parseRemotes = (value: string | null): RepositoryMetadata["remotes"] => {
  if (value === null) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Schema.decodeUnknownSync(RepositoryRemotesJson, StrictDecodeOptions)(parsed);
  } catch {
    return [];
  }
};

const decodeSqlRow = <A>(schema: Schema.Top, row: unknown): A =>
  Schema.decodeUnknownSync(schema as never)(row) as A;

const metadataFromRepositoryRow = (row: RepositoryRow): RepositoryMetadata | undefined => {
  const remotes = parseRemotes(row.remotes_json);
  const metadata: RepositoryMetadata = {
    ...(row.current_branch === null ? {} : { currentBranch: row.current_branch }),
    ...(row.default_remote === null ? {} : { defaultRemote: row.default_remote }),
    ...(row.default_remote_url === null ? {} : { defaultRemoteUrl: row.default_remote_url }),
    ...(row.git_dir === null ? {} : { gitDir: row.git_dir }),
    ...(row.metadata_updated_at === null ? {} : { inspectedAt: row.metadata_updated_at }),
    remotes,
    ...(row.worktree_path === null ? {} : { worktreePath: row.worktree_path }),
  };

  if (
    metadata.currentBranch === undefined &&
    metadata.defaultRemote === undefined &&
    metadata.defaultRemoteUrl === undefined &&
    metadata.gitDir === undefined &&
    metadata.inspectedAt === undefined &&
    metadata.remotes.length === 0 &&
    metadata.worktreePath === undefined
  ) {
    return undefined;
  }

  return metadata;
};

const cycleMetadataFromRepositoryRow = (
  row: RepositoryRow,
): CycleRepositoryMetadata | undefined => {
  if (row.cycle_metadata_json === null) return undefined;

  try {
    const parsed = JSON.parse(row.cycle_metadata_json) as unknown;
    return Schema.decodeUnknownSync(CycleRepositoryMetadataJson, StrictDecodeOptions)(parsed);
  } catch {
    return undefined;
  }
};

const repositoryStatusFromRow = (raw: RepositoryRow): RepositoryStatus => {
  const row = decodeSqlRow<RepositoryRow>(RepositoryRowSql, raw);
  const metadata = metadataFromRepositoryRow(row);
  const cycleMetadata = cycleMetadataFromRepositoryRow(row);

  return {
    activeGeneration: row.active_generation,
    activeSnapshotId: row.active_snapshot_id,
    ...(cycleMetadata === undefined ? {} : { cycleMetadata }),
    lastSyncCompletedAt: row.last_sync_completed_at ?? undefined,
    lastSyncError: row.last_sync_error ?? undefined,
    lastSyncStartedAt: row.last_sync_started_at ?? undefined,
    ...(metadata === undefined ? {} : { metadata }),
    repositoryId: row.repository_id,
    status: row.sync_status,
    warningCount: row.warning_count,
  };
};

const decodeJson = <S extends Schema.Top>(schema: S, value: string): S["Type"] =>
  Schema.decodeUnknownSync(schema as never, StrictDecodeOptions)(JSON.parse(value)) as S["Type"];

const ticketFromRow = (raw: TicketRow): TicketDocument => {
  const row = decodeSqlRow<TicketRow>(TicketRowSql, raw);
  const frontmatter = makeIssueFrontmatter(
    decodeJson(
      IssueFrontmatterJson,
      row.frontmatter_json,
    ) as unknown as TicketDocument["frontmatter"],
  );

  const labels = row.labels_json === null ? undefined : decodeJson(StringListJson, row.labels_json);
  const relations =
    row.relation_summary_json === null
      ? undefined
      : (decodeJson(
          Schema.Array(IssueRelationJson),
          row.relation_summary_json,
        ) as unknown as TicketDocument["relations"]);
  return {
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
  };
};

const recordFromRow = (raw: RecordRow): LinkedRecord => {
  const row = decodeSqlRow<RecordRow>(RecordRowSql, raw);

  return {
    createdAt: row.created_at,
    createdBy: {
      email: row.created_by_email ?? undefined,
      name: row.created_by_name,
      type: row.created_by_type as LinkedRecord["createdBy"]["type"],
    },
    createdDate: row.created_date,
    id: row.record_id,
    issueId: row.ticket_id,
    payload: decodeJson(JsonValue, row.payload_json),
    recordType: row.record_type,
    schemaVersion: 1,
  };
};

const userFromRow = (raw: UserRow): UserProfileDocument => {
  const row = decodeSqlRow<UserRow>(UserRowSql, raw);
  return decodeJson(UserProfileDocumentJson, row.profile_json) as unknown as UserProfileDocument;
};

const labelFromRow = (raw: LabelRow): LabelDefinitionDocument => {
  const row = decodeSqlRow<LabelRow>(LabelRowSql, raw);
  return decodeJson(
    LabelDefinitionDocumentJson,
    row.label_json,
  ) as unknown as LabelDefinitionDocument;
};

const viewFromRow = (raw: SavedViewRow): SavedViewDocument => {
  const row = decodeSqlRow<SavedViewRow>(SavedViewRowSql, raw);
  return decodeJson(SavedViewDocumentJson, row.view_json) as unknown as SavedViewDocument;
};

const templateFromRow = (raw: IssueTemplateRow): IssueTemplateDocument => {
  const row = decodeSqlRow<IssueTemplateRow>(IssueTemplateRowSql, raw);
  return decodeJson(
    IssueTemplateDocumentJson,
    row.template_json,
  ) as unknown as IssueTemplateDocument;
};

const historyFromRow = (raw: HistoryRow): HistoryCommit => {
  const row = decodeSqlRow<HistoryRow>(HistoryRowSql, raw);

  return {
    authorEmail: row.author_email ?? undefined,
    authorName: row.author_name ?? undefined,
    changedTicketIds: parseStringListJson(row.changed_ticket_ids),
    committedAt: row.committed_at ?? undefined,
    message: row.message ?? undefined,
    parentIds: parseStringListJson(row.parent_ids),
    sequence: row.sequence,
    snapshotId: row.snapshot_id,
    warningCount: row.warning_count,
  };
};

const inboxEntryFromRow = (raw: InboxListRow): InboxEntry => {
  const row = decodeSqlRow<InboxListRow>(InboxListRowSql, raw);
  const actor: InboxEntry["actor"] = {
    ...(row.actor_email === null ? {} : { email: row.actor_email }),
    ...(row.actor_name === null ? {} : { name: row.actor_name }),
  };
  const metadata = parseInboxMetadata(row.metadata_json);

  return {
    actor,
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
    sourceState: inboxSourceState(row),
    status: row.status,
    ticketId: row.ticket_id,
    title: row.title,
    ...(row.local_updated_at === null ? {} : { updatedAt: row.local_updated_at }),
  };
};

const inboxSourceState = (row: InboxListRow): InboxSourceState =>
  row.deleted_at !== null
    ? "source_deleted"
    : row.archived_at !== null
      ? "source_archived"
      : "active";

const parseInboxMetadata = (
  value: string | null,
): Readonly<Record<string, unknown>> | undefined => {
  if (value === null) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    return Schema.decodeUnknownSync(JsonRecord, StrictDecodeOptions)(parsed);
  } catch {
    return undefined;
  }
};

const parseStringListJson = (value: string | null): ReadonlyArray<string> => {
  if (value === null) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Schema.decodeUnknownSync(StringListJson, StrictDecodeOptions)(parsed);
  } catch {
    return [];
  }
};

const commentBody = (payload: unknown): string => {
  if (typeof payload === "string") return payload;

  if (payload !== null && typeof payload === "object") {
    const record = payload as Readonly<Record<string, unknown>>;

    if (typeof record.body === "string") return record.body;
    if (typeof record.text === "string") return record.text;
    if (typeof record.markdown === "string") return record.markdown;
    if (typeof record.comment === "string") return record.comment;
  }

  return JSON.stringify(payload);
};

const normalizeLimit = (limit: number | undefined): number =>
  Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));

const encodeCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");

const decodeCursor = (cursor: string | undefined): { readonly offset: number } => {
  if (cursor === undefined) return { offset: 0 };

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      readonly offset?: unknown;
    };
    const decoded = Schema.decodeUnknownSync(ProjectionCursorJson, StrictDecodeOptions)(parsed);

    return { offset: decoded.offset };
  } catch {
    return { offset: 0 };
  }
};

const placeholders = (count: number): string => Array.from({ length: count }, () => "?").join(", ");

const toFtsQuery = (text: string): string => {
  const terms = text
    .trim()
    .split(/\s+/u)
    .map((term) => term.replaceAll('"', '""'))
    .filter((term) => term.length > 0);

  return terms.length === 0 ? '""' : terms.map((term) => `"${term}"`).join(" AND ");
};
