import { DatabaseSync } from "node:sqlite";
import { cycleDatabasePath, ensureDatabaseParentDirectorySync } from "../paths.ts";
import type {
  CycleRepositoryMetadata,
  HistoryCommit,
  HistoryPage,
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
} from "../domain/index.ts";
import { normalizeKey, ticketReferenceKey } from "../domain/index.ts";

type SqlValue = null | number | string;

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

const WATCHED_REF = "refs/gitdb/cycle/main";
const CURRENT_PROJECTION_SCHEMA_VERSION = 3;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

export class Projection {
  readonly db: DatabaseSync;

  constructor(path = cycleDatabasePath()) {
    ensureDatabaseParentDirectorySync(path);
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.initializeSchema();
  }

  close(): void {
    this.db.close();
  }

  private initializeSchema(): void {
    const version = this.userVersion();

    if (version > CURRENT_PROJECTION_SCHEMA_VERSION) {
      throw new Error(
        `Projection schema version ${version} is newer than supported version ${CURRENT_PROJECTION_SCHEMA_VERSION}`,
      );
    }

    const hasRepositories = this.hasTable("repositories");

    if (!hasRepositories) {
      this.db.exec(schemaSql);
      this.db.exec(`PRAGMA user_version = ${CURRENT_PROJECTION_SCHEMA_VERSION}`);
      return;
    }

    this.ensureRepositoryMetadataColumns();
    this.ensureSharedMetadataTables();
    if (version < CURRENT_PROJECTION_SCHEMA_VERSION) {
      this.db.exec(`PRAGMA user_version = ${CURRENT_PROJECTION_SCHEMA_VERSION}`);
    }
  }

  private userVersion(): number {
    const row = this.db.prepare("PRAGMA user_version").get() as
      | { readonly user_version: number }
      | undefined;

    return row?.user_version ?? 0;
  }

  private hasTable(name: string): boolean {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) as { readonly name: string } | undefined;

    return row !== undefined;
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as unknown as ReadonlyArray<{
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

  registerRepository(input: RepositoryInput): RepositoryStatus {
    const metadata = normalizeRepositoryMetadata(input);

    this.db
      .prepare(
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
      )
      .run(
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
      );

    return this.repositoryStatus(input.repositoryId);
  }

  updateCycleRepositoryMetadata(
    repositoryId: string,
    metadata: CycleRepositoryMetadata,
  ): RepositoryStatus {
    this.db
      .prepare("UPDATE repositories SET cycle_metadata_json = ? WHERE repository_id = ?")
      .run(JSON.stringify(metadata), repositoryId);

    return this.repositoryStatus(repositoryId);
  }

  clearCycleRepositoryMetadata(repositoryId: string): RepositoryStatus {
    this.db
      .prepare("UPDATE repositories SET cycle_metadata_json = NULL WHERE repository_id = ?")
      .run(repositoryId);

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
    const row = this.db
      .prepare("SELECT * FROM repositories WHERE repository_id = ?")
      .get(repositoryId) as RepositoryRow | undefined;

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
    const rows = this.db
      .prepare("SELECT * FROM repositories ORDER BY repository_id ASC")
      .all() as unknown as ReadonlyArray<RepositoryRow>;

    return rows.map(repositoryStatusFromRow);
  }

  markSyncStarted(repositoryId: string, now: string): void {
    this.db
      .prepare(
        `UPDATE repositories
         SET sync_status = 'syncing', last_sync_started_at = ?, last_sync_error = NULL
         WHERE repository_id = ?`,
      )
      .run(now, repositoryId);
  }

  markSyncFailed(repositoryId: string, message: string): void {
    this.db
      .prepare(
        `UPDATE repositories
         SET sync_status = 'failed', last_sync_error = ?
         WHERE repository_id = ?`,
      )
      .run(message, repositoryId);
  }

  activateSnapshot(input: {
    readonly repositoryId: string;
    readonly snapshotId: string | null;
    readonly completedAt: string;
  }): RepositoryStatus {
    const warningCount = this.warningCount(input.repositoryId, input.snapshotId);
    const status: RepositoryStatusValue =
      input.snapshotId === null ? "empty" : warningCount > 0 ? "degraded" : "ready";

    this.db
      .prepare(
        `UPDATE repositories
         SET active_snapshot_id = ?,
             active_generation = active_generation + 1,
             sync_status = ?,
             last_sync_completed_at = ?,
             last_sync_error = NULL,
             warning_count = ?
         WHERE repository_id = ?`,
      )
      .run(input.snapshotId, status, input.completedAt, warningCount, input.repositoryId);

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
      "materialization_warnings",
      "search_documents",
      "search_fts",
    ];

    for (const table of tables) {
      this.db.prepare(`DELETE FROM ${table} WHERE repository_id = ?`).run(repositoryId);
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

    this.db
      .prepare(
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
      )
      .run(
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
      );

    this.db
      .prepare("DELETE FROM ticket_labels WHERE repository_id = ? AND ticket_id = ?")
      .run(input.repositoryId, ticket.id);
    for (const label of labels) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO ticket_labels (repository_id, ticket_id, label)
           VALUES (?, ?, ?)`,
        )
        .run(input.repositoryId, ticket.id, label);
    }

    this.db
      .prepare("DELETE FROM ticket_external_links WHERE repository_id = ? AND ticket_id = ?")
      .run(input.repositoryId, ticket.id);
    for (const link of frontmatter.externalLinks ?? []) {
      this.db
        .prepare(
          `INSERT INTO ticket_external_links (repository_id, ticket_id, source, title, url)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(input.repositoryId, ticket.id, link.source ?? null, link.title ?? null, link.url);
    }

    this.db
      .prepare("DELETE FROM ticket_relations WHERE repository_id = ? AND ticket_id = ?")
      .run(input.repositoryId, ticket.id);
    for (const relation of relations) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO ticket_relations (
            repository_id, ticket_id, related_issue_id, relation_type
          ) VALUES (?, ?, ?, ?)`,
        )
        .run(input.repositoryId, ticket.id, relation.issueId, relation.type);
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
    this.db
      .prepare("DELETE FROM tickets WHERE repository_id = ? AND ticket_id = ?")
      .run(repositoryId, ticketId);
    this.db
      .prepare("DELETE FROM ticket_labels WHERE repository_id = ? AND ticket_id = ?")
      .run(repositoryId, ticketId);
    this.db
      .prepare("DELETE FROM ticket_external_links WHERE repository_id = ? AND ticket_id = ?")
      .run(repositoryId, ticketId);
    this.db
      .prepare("DELETE FROM ticket_relations WHERE repository_id = ? AND ticket_id = ?")
      .run(repositoryId, ticketId);
    this.deleteSearchDocument(repositoryId, `ticket:${ticketId}`);
  }

  upsertRecord(input: {
    readonly record: LinkedRecord;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }): void {
    const record = input.record;

    this.db
      .prepare(
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
      )
      .run(
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
      );

    if (normalizeKey(record.recordType) === "comment") {
      const body = commentBody(record.payload);
      this.db
        .prepare(
          `INSERT INTO comments (repository_id, record_id, ticket_id, body, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(repository_id, record_id) DO UPDATE SET
             ticket_id = excluded.ticket_id,
             body = excluded.body,
             created_at = excluded.created_at`,
        )
        .run(input.repositoryId, record.id, record.issueId, body, record.createdAt);
      this.upsertSearchDocument({
        body,
        documentId: `comment:${record.id}`,
        repositoryId: input.repositoryId,
        sourceType: "comment",
        ticketId: record.issueId,
        title: "",
      });
    } else {
      this.db
        .prepare("DELETE FROM comments WHERE repository_id = ? AND record_id = ?")
        .run(input.repositoryId, record.id);
      this.deleteSearchDocument(input.repositoryId, `comment:${record.id}`);
    }
  }

  deleteRecord(repositoryId: string, recordId: string): void {
    this.db
      .prepare("DELETE FROM records WHERE repository_id = ? AND record_id = ?")
      .run(repositoryId, recordId);
    this.db
      .prepare("DELETE FROM comments WHERE repository_id = ? AND record_id = ?")
      .run(repositoryId, recordId);
    this.deleteSearchDocument(repositoryId, `comment:${recordId}`);
  }

  upsertUser(input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly user: UserProfileDocument;
  }): void {
    const user = input.user;

    this.db
      .prepare(
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
      )
      .run(
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
      );
  }

  deleteUser(repositoryId: string, userId: string): void {
    this.db
      .prepare("DELETE FROM users WHERE repository_id = ? AND user_id = ?")
      .run(repositoryId, userId);
  }

  upsertLabel(input: {
    readonly label: LabelDefinitionDocument;
    readonly repositoryId: string;
    readonly snapshotId: string;
  }): void {
    const label = input.label;

    this.db
      .prepare(
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
      )
      .run(
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
      );
  }

  deleteLabel(repositoryId: string, labelId: string): void {
    this.db
      .prepare("DELETE FROM labels WHERE repository_id = ? AND label_id = ?")
      .run(repositoryId, labelId);
  }

  upsertView(input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly view: SavedViewDocument;
  }): void {
    const view = input.view;

    this.db
      .prepare(
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
      )
      .run(
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
      );
  }

  deleteView(repositoryId: string, viewId: string): void {
    this.db
      .prepare("DELETE FROM saved_views WHERE repository_id = ? AND view_id = ?")
      .run(repositoryId, viewId);
  }

  upsertTemplate(input: {
    readonly repositoryId: string;
    readonly snapshotId: string;
    readonly template: IssueTemplateDocument;
  }): void {
    const template = input.template;

    this.db
      .prepare(
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
      )
      .run(
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
      );
  }

  deleteTemplate(repositoryId: string, templateId: string): void {
    this.db
      .prepare("DELETE FROM issue_templates WHERE repository_id = ? AND template_id = ?")
      .run(repositoryId, templateId);
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
    this.db
      .prepare(
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
      )
      .run(
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
      );

    this.db
      .prepare("DELETE FROM commit_parents WHERE repository_id = ? AND snapshot_id = ?")
      .run(input.repositoryId, input.snapshotId);
    for (const parentId of input.parentIds) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO commit_parents (repository_id, snapshot_id, parent_snapshot_id)
           VALUES (?, ?, ?)`,
        )
        .run(input.repositoryId, input.snapshotId, parentId);
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
    this.db
      .prepare("DELETE FROM commit_changes WHERE repository_id = ? AND snapshot_id = ?")
      .run(input.repositoryId, input.snapshotId);

    for (const change of input.changes) {
      this.db
        .prepare(
          `INSERT INTO commit_changes (
            repository_id, snapshot_id, change_type, object_type, object_id, ticket_id, path
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.repositoryId,
          input.snapshotId,
          change.changeType,
          change.objectType,
          change.objectId ?? null,
          change.ticketId ?? null,
          change.path,
        );
    }
  }

  addWarning(warning: MaterializationWarning): void {
    this.db
      .prepare(
        `INSERT INTO materialization_warnings (
          repository_id, snapshot_id, path, object_type, object_id, reason, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        warning.repositoryId,
        warning.snapshotId,
        warning.path,
        warning.objectType,
        warning.objectId ?? null,
        warning.reason,
        warning.message,
        warning.createdAt,
      );
  }

  warnings(repositoryId: string): ReadonlyArray<MaterializationWarning> {
    return this.db
      .prepare(
        `SELECT repository_id, snapshot_id, path, object_type, object_id, reason, message, created_at
         FROM materialization_warnings
         WHERE repository_id = ?
         ORDER BY created_at ASC, path ASC`,
      )
      .all(repositoryId)
      .map((row) => {
        const warning = row as {
          readonly created_at: string;
          readonly message: string;
          readonly object_id: string | null;
          readonly object_type: string;
          readonly path: string;
          readonly reason: string;
          readonly repository_id: string;
          readonly snapshot_id: string;
        };

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

  getTicket(repositoryId: string, ticketId: string): TicketDocument | null {
    const row = this.db
      .prepare("SELECT * FROM tickets WHERE repository_id = ? AND ticket_id = ?")
      .get(repositoryId, ticketId) as TicketRow | undefined;

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
    const rows = this.db
      .prepare(
        `SELECT t.*
         FROM tickets t
         ${where}
         ORDER BY t.${orderColumn} ${direction}, t.ticket_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, cursor.offset) as unknown as ReadonlyArray<TicketRow>;
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

    const rows = this.db
      .prepare(
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
      )
      .all(...params, limit + 1, cursor.offset) as unknown as ReadonlyArray<{
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
    const row = this.db
      .prepare("SELECT * FROM users WHERE repository_id = ? AND user_id = ?")
      .get(repositoryId, userId) as UserRow | undefined;

    return row === undefined ? null : userFromRow(row);
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

    const rows = this.db
      .prepare(
        `SELECT * FROM users
         WHERE ${filters.join(" AND ")}
         ORDER BY disabled_at IS NOT NULL ASC, display_name ASC, user_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, cursor.offset) as unknown as ReadonlyArray<UserRow>;

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

    const rows = this.db
      .prepare(
        `SELECT * FROM labels
         WHERE ${filters.join(" AND ")}
         ORDER BY archived_at IS NOT NULL ASC, name ASC, label_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, cursor.offset) as unknown as ReadonlyArray<LabelRow>;

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

    const rows = this.db
      .prepare(
        `SELECT * FROM saved_views
         WHERE ${filters.join(" AND ")}
         ORDER BY pinned DESC, built_in DESC, name ASC, view_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, cursor.offset) as unknown as ReadonlyArray<SavedViewRow>;

    return {
      entries: rows.slice(0, limit).map(viewFromRow),
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  getView(repositoryId: string, viewId: string): SavedViewDocument | null {
    const row = this.db
      .prepare("SELECT * FROM saved_views WHERE repository_id = ? AND view_id = ?")
      .get(repositoryId, viewId) as SavedViewRow | undefined;

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

    const rows = this.db
      .prepare(
        `SELECT * FROM issue_templates
         WHERE ${filters.join(" AND ")}
         ORDER BY active DESC, kind ASC, name ASC, template_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, cursor.offset) as unknown as ReadonlyArray<IssueTemplateRow>;

    return {
      entries: rows.slice(0, limit).map(templateFromRow),
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  getTemplate(repositoryId: string, templateId: string): IssueTemplateDocument | null {
    const row = this.db
      .prepare("SELECT * FROM issue_templates WHERE repository_id = ? AND template_id = ?")
      .get(repositoryId, templateId) as IssueTemplateRow | undefined;

    return row === undefined ? null : templateFromRow(row);
  }

  ticketRecords(repositoryId: string, ticketId: string, query: RecordQuery = {}): RecordPage {
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const params: Array<SqlValue> = [repositoryId, ticketId];
    const filter = query.recordType === undefined ? "" : "AND record_type = ?";

    if (query.recordType !== undefined) params.push(normalizeKey(query.recordType));

    const rows = this.db
      .prepare(
        `SELECT * FROM records
         WHERE repository_id = ? AND ticket_id = ?
         ${filter}
         ORDER BY created_at ASC, record_id ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit + 1, cursor.offset) as unknown as ReadonlyArray<RecordRow>;
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

    const rows = this.db
      .prepare(
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
      )
      .all(...params, limit + 1, cursor.offset) as unknown as ReadonlyArray<HistoryRow>;
    const entries = rows.slice(0, limit).map(historyFromRow);

    return {
      entries,
      nextCursor: rows.length > limit ? encodeCursor(cursor.offset + limit) : undefined,
    };
  }

  ticketVisible(repositoryId: string, ticketId: string): boolean {
    return this.getTicket(repositoryId, ticketId) !== null;
  }

  recordVisible(repositoryId: string, recordId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM records WHERE repository_id = ? AND record_id = ?")
      .get(repositoryId, recordId);

    return row !== undefined;
  }

  transaction<A>(f: () => A): A {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = f();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private warningCount(repositoryId: string, snapshotId: string | null): number {
    if (snapshotId === null) return 0;

    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM materialization_warnings
         WHERE repository_id = ? AND snapshot_id = ?`,
      )
      .get(repositoryId, snapshotId) as { readonly count: number } | undefined;

    return row?.count ?? 0;
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
    this.db
      .prepare(
        `INSERT INTO search_documents (
          repository_id, document_id, ticket_id, source_type, title, body
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.repositoryId,
        input.documentId,
        input.ticketId,
        input.sourceType,
        input.title,
        input.body,
      );
    this.db
      .prepare(
        `INSERT INTO search_fts (repository_id, document_id, ticket_id, title, body)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.repositoryId, input.documentId, input.ticketId, input.title, input.body);
  }

  private deleteSearchDocument(repositoryId: string, documentId: string): void {
    this.db
      .prepare("DELETE FROM search_documents WHERE repository_id = ? AND document_id = ?")
      .run(repositoryId, documentId);
    this.db
      .prepare("DELETE FROM search_fts WHERE repository_id = ? AND document_id = ?")
      .run(repositoryId, documentId);
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

    const comments = this.db
      .prepare("SELECT body FROM comments WHERE repository_id = ? AND ticket_id = ?")
      .all(repositoryId, ticketId) as unknown as ReadonlyArray<{ readonly body: string }>;

    if (comments.some((comment) => comment.body.toLowerCase().includes(needle))) {
      fields.add("comment");
    }

    return [...fields];
  }
}

const schemaSql = `
CREATE TABLE repositories (
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

CREATE TABLE tickets (
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
CREATE INDEX tickets_active_updated ON tickets(repository_id, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX tickets_active_created ON tickets(repository_id, archived_at, deleted_at, created_at, ticket_id);
CREATE INDEX tickets_active_due_date ON tickets(repository_id, archived_at, deleted_at, due_date, ticket_id);
CREATE INDEX tickets_active_priority_order ON tickets(repository_id, archived_at, deleted_at, priority, ticket_id);
CREATE INDEX tickets_active_title ON tickets(repository_id, archived_at, deleted_at, title, ticket_id);
CREATE INDEX tickets_repository_status ON tickets(repository_id, status, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX tickets_repository_priority ON tickets(repository_id, priority, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX tickets_repository_type ON tickets(repository_id, type, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX tickets_repository_assignee ON tickets(repository_id, assignee, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX tickets_repository_parent ON tickets(repository_id, parent_id, archived_at, deleted_at, updated_at, ticket_id);
CREATE INDEX tickets_repository_due_range ON tickets(repository_id, due_date, archived_at, deleted_at, ticket_id);
CREATE INDEX tickets_repository_estimate ON tickets(repository_id, estimate, archived_at, deleted_at, ticket_id);

CREATE TABLE users (
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
CREATE INDEX users_repository_display_name ON users(repository_id, disabled_at, display_name, user_id);
CREATE INDEX users_repository_email ON users(repository_id, email, user_id);

CREATE TABLE labels (
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
CREATE INDEX labels_repository_name ON labels(repository_id, archived_at, name, label_id);

CREATE TABLE saved_views (
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
CREATE INDEX saved_views_repository_order ON saved_views(repository_id, pinned, built_in, name, view_id);

CREATE TABLE issue_templates (
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
CREATE INDEX issue_templates_repository_kind ON issue_templates(repository_id, active, kind, name, template_id);

CREATE TABLE ticket_labels (
  repository_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (repository_id, ticket_id, label)
);
CREATE INDEX ticket_labels_lookup ON ticket_labels(repository_id, label, ticket_id);

CREATE TABLE ticket_external_links (
  repository_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  source TEXT,
  title TEXT,
  url TEXT NOT NULL
);

CREATE TABLE ticket_relations (
  repository_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  related_issue_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  PRIMARY KEY (repository_id, ticket_id, related_issue_id, relation_type)
);
CREATE INDEX ticket_relations_source_lookup ON ticket_relations(repository_id, ticket_id, relation_type, related_issue_id);
CREATE INDEX ticket_relations_related_lookup ON ticket_relations(repository_id, related_issue_id, relation_type, ticket_id);

CREATE TABLE records (
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
CREATE INDEX records_ticket_created ON records(repository_id, ticket_id, created_at, record_id);
CREATE INDEX records_ticket_type_created ON records(repository_id, ticket_id, record_type, created_at, record_id);

CREATE TABLE comments (
  repository_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (repository_id, record_id)
);
CREATE INDEX comments_ticket_created ON comments(repository_id, ticket_id, created_at, record_id);

CREATE TABLE commits (
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
CREATE INDEX commits_repository_sequence ON commits(repository_id, sequence DESC, snapshot_id);

CREATE TABLE commit_parents (
  repository_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  parent_snapshot_id TEXT NOT NULL,
  PRIMARY KEY (repository_id, snapshot_id, parent_snapshot_id)
);
CREATE INDEX commit_parents_snapshot ON commit_parents(repository_id, snapshot_id, parent_snapshot_id);

CREATE TABLE commit_changes (
  repository_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  ticket_id TEXT,
  path TEXT NOT NULL
);
CREATE INDEX commit_changes_snapshot_ticket ON commit_changes(repository_id, snapshot_id, ticket_id);
CREATE INDEX commit_changes_ticket ON commit_changes(repository_id, ticket_id, snapshot_id);

CREATE TABLE materialization_warnings (
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
CREATE INDEX materialization_warnings_snapshot ON materialization_warnings(repository_id, snapshot_id);
CREATE INDEX materialization_warnings_repository_created ON materialization_warnings(repository_id, created_at, path);

CREATE TABLE search_documents (
  repository_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (repository_id, document_id)
);

CREATE VIRTUAL TABLE search_fts USING fts5(
  repository_id UNINDEXED,
  document_id UNINDEXED,
  ticket_id UNINDEXED,
  title,
  body
);
`;

const sharedMetadataSchemaSql = `
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
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((remote) => {
      if (remote === null || typeof remote !== "object") return [];
      const record = remote as Readonly<Record<string, unknown>>;
      if (typeof record.name !== "string") return [];

      return [
        {
          name: record.name,
          ...(typeof record.url === "string" ? { url: record.url } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
};

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
    if (parsed === null || typeof parsed !== "object") return undefined;

    const value = parsed as Partial<CycleRepositoryMetadata>;
    if (
      value.schemaVersion !== 1 ||
      value.ticketIdFormat !== "prefix-base36-5+" ||
      typeof value.ticketPrefix !== "string" ||
      typeof value.createdAt !== "string" ||
      typeof value.updatedAt !== "string"
    ) {
      return undefined;
    }

    return {
      createdAt: value.createdAt,
      schemaVersion: 1,
      ticketIdFormat: "prefix-base36-5+",
      ticketPrefix: value.ticketPrefix,
      updatedAt: value.updatedAt,
    };
  } catch {
    return undefined;
  }
};

const repositoryStatusFromRow = (row: RepositoryRow): RepositoryStatus => {
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

const ticketFromRow = (row: TicketRow): TicketDocument => {
  const frontmatter = JSON.parse(row.frontmatter_json) as TicketDocument["frontmatter"];

  return {
    archivedAt: row.archived_at ?? undefined,
    assignee: row.assignee ?? undefined,
    body: row.body,
    bodyFormat: row.body_format,
    createdBy: frontmatter.createdBy?.email ?? frontmatter.createdBy?.name ?? "",
    deletedAt: row.deleted_at ?? undefined,
    dueDate: row.due_date ?? undefined,
    estimate: frontmatter.estimate ?? undefined,
    frontmatter,
    id: row.ticket_id,
    labels: row.labels_json === null ? undefined : JSON.parse(row.labels_json),
    parent: row.parent_id,
    priority: row.priority,
    relations:
      row.relation_summary_json === null ? undefined : JSON.parse(row.relation_summary_json),
    repository: row.repository_key ?? undefined,
    repositoryId: row.repository_id,
    schemaVersion: 1,
    status: row.status,
    title: row.title,
    type: row.type,
    updatedDate: row.updated_at.slice(0, 10),
  };
};

const recordFromRow = (row: RecordRow): LinkedRecord => ({
  createdAt: row.created_at,
  createdBy: {
    email: row.created_by_email ?? undefined,
    name: row.created_by_name,
    type: row.created_by_type as LinkedRecord["createdBy"]["type"],
  },
  createdDate: row.created_date,
  id: row.record_id,
  issueId: row.ticket_id,
  payload: JSON.parse(row.payload_json),
  recordType: row.record_type,
  schemaVersion: 1,
});

const userFromRow = (row: UserRow): UserProfileDocument =>
  JSON.parse(row.profile_json) as UserProfileDocument;

const labelFromRow = (row: LabelRow): LabelDefinitionDocument =>
  JSON.parse(row.label_json) as LabelDefinitionDocument;

const viewFromRow = (row: SavedViewRow): SavedViewDocument =>
  JSON.parse(row.view_json) as SavedViewDocument;

const templateFromRow = (row: IssueTemplateRow): IssueTemplateDocument =>
  JSON.parse(row.template_json) as IssueTemplateDocument;

const historyFromRow = (row: HistoryRow): HistoryCommit => ({
  authorEmail: row.author_email ?? undefined,
  authorName: row.author_name ?? undefined,
  changedTicketIds: JSON.parse(row.changed_ticket_ids ?? "[]").filter(
    (value: unknown): value is string => typeof value === "string",
  ),
  committedAt: row.committed_at ?? undefined,
  message: row.message ?? undefined,
  parentIds: JSON.parse(row.parent_ids ?? "[]").filter(
    (value: unknown): value is string => typeof value === "string",
  ),
  sequence: row.sequence,
  snapshotId: row.snapshot_id,
  warningCount: row.warning_count,
});

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

    return typeof parsed.offset === "number" && parsed.offset >= 0
      ? { offset: Math.trunc(parsed.offset) }
      : { offset: 0 };
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
