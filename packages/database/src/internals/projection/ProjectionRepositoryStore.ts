import { Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type {
  CycleRepositoryMetadata,
  MaterializationWarning,
  RepositoryInput,
  RepositoryMetadata,
  RepositoryStatus,
  RepositoryStatusValue,
} from "../../domain/index.ts";
import type { DatabaseFailure } from "../../DatabaseErrors.ts";
import { decodeJson, decodeValue, encodeJson } from "./JsonCodec.ts";
import { makeProjectionSql } from "./ProjectionSql.ts";

const WATCHED_REF = "refs/gitdb/cycle/main";

const NullOrString = Schema.NullOr(Schema.String);
const RepositoryStatusValueSchema = Schema.Literals([
  "degraded",
  "empty",
  "failed",
  "ready",
  "syncing",
]);
const RepositoryRemoteSchema = Schema.Struct({
  name: Schema.String,
  url: Schema.optional(Schema.String),
});
const RepositoryRemotesSchema = Schema.Array(RepositoryRemoteSchema);
const CycleRepositoryMetadataSchema = Schema.Struct({
  createdAt: Schema.String,
  schemaVersion: Schema.Literal(1),
  ticketIdFormat: Schema.Literal("prefix-base36-5+"),
  ticketPrefix: Schema.String,
  updatedAt: Schema.String,
});
const RepositoryRowSchema = Schema.Struct({
  active_generation: Schema.Int,
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
  sync_status: RepositoryStatusValueSchema,
  warning_count: Schema.Int,
  worktree_path: NullOrString,
});
const WarningRowSchema = Schema.Struct({
  created_at: Schema.String,
  message: Schema.String,
  object_id: NullOrString,
  object_type: Schema.String,
  path: Schema.String,
  reason: Schema.String,
  repository_id: Schema.String,
  snapshot_id: Schema.String,
});
const CommitSequenceRowSchema = Schema.Struct({ sequence: Schema.NullOr(Schema.Int) });
const WarningCountRowSchema = Schema.Struct({ count: Schema.Int });
const repositoryColumns = `
  repository_id, active_snapshot_id, active_generation, sync_status,
  last_sync_started_at, last_sync_completed_at, last_sync_error, warning_count,
  cycle_metadata_json, current_branch, default_remote, default_remote_url,
  metadata_updated_at, remotes_json, git_dir, worktree_path
`;

type RepositoryRow = typeof RepositoryRowSchema.Type;

export type ProjectionCommit = {
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
};

export type ProjectionCommitChanges = {
  readonly changes: ReadonlyArray<{
    readonly changeType: "added" | "deleted" | "modified";
    readonly objectId?: string;
    readonly objectType: string;
    readonly path: string;
    readonly ticketId?: string;
  }>;
  readonly repositoryId: string;
  readonly snapshotId: string;
};

export type ProjectionRepositoryStoreShape = {
  readonly activateSnapshot: (input: {
    readonly completedAt: string;
    readonly repositoryId: string;
    readonly snapshotId: string | null;
  }) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly addWarning: (warning: MaterializationWarning) => Effect.Effect<void, DatabaseFailure>;
  readonly list: Effect.Effect<ReadonlyArray<RepositoryStatus>, DatabaseFailure>;
  readonly markSyncFailed: (
    repositoryId: string,
    message: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly markSyncStarted: (
    repositoryId: string,
    now: string,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly maxCommitSequence: (repositoryId: string) => Effect.Effect<number, DatabaseFailure>;
  readonly register: (input: RepositoryInput) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly replaceCommitChanges: (
    input: ProjectionCommitChanges,
  ) => Effect.Effect<void, DatabaseFailure>;
  readonly setCycleMetadata: (
    repositoryId: string,
    metadata: CycleRepositoryMetadata | undefined,
  ) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly status: (repositoryId: string) => Effect.Effect<RepositoryStatus, DatabaseFailure>;
  readonly upsertCommit: (input: ProjectionCommit) => Effect.Effect<void, DatabaseFailure>;
  readonly warnings: (
    repositoryId: string,
  ) => Effect.Effect<ReadonlyArray<MaterializationWarning>, DatabaseFailure>;
};

export class ProjectionRepositoryStore extends Context.Service<
  ProjectionRepositoryStore,
  ProjectionRepositoryStoreShape
>()("@cycle/database/internals/projection/ProjectionRepositoryStore") {}

const normalizeRepositoryMetadata = (input: RepositoryInput): RepositoryMetadata => ({
  currentBranch: input.metadata?.currentBranch,
  defaultRemote: input.metadata?.defaultRemote,
  defaultRemoteUrl: input.metadata?.defaultRemoteUrl,
  gitDir: input.metadata?.gitDir ?? input.gitDir,
  inspectedAt: input.metadata?.inspectedAt,
  remotes: input.metadata?.remotes ?? [],
  worktreePath: input.metadata?.worktreePath ?? input.worktreePath,
});

const metadataFromRow = (
  row: RepositoryRow,
  remotes: RepositoryMetadata["remotes"],
): RepositoryMetadata | undefined => {
  const metadata: RepositoryMetadata = {
    ...(row.current_branch === null ? {} : { currentBranch: row.current_branch }),
    ...(row.default_remote === null ? {} : { defaultRemote: row.default_remote }),
    ...(row.default_remote_url === null ? {} : { defaultRemoteUrl: row.default_remote_url }),
    ...(row.git_dir === null ? {} : { gitDir: row.git_dir }),
    ...(row.metadata_updated_at === null ? {} : { inspectedAt: row.metadata_updated_at }),
    remotes,
    ...(row.worktree_path === null ? {} : { worktreePath: row.worktree_path }),
  };

  return metadata.currentBranch === undefined &&
    metadata.defaultRemote === undefined &&
    metadata.defaultRemoteUrl === undefined &&
    metadata.gitDir === undefined &&
    metadata.inspectedAt === undefined &&
    metadata.remotes.length === 0 &&
    metadata.worktreePath === undefined
    ? undefined
    : metadata;
};

const emptyStatus = (repositoryId: string): RepositoryStatus => ({
  activeGeneration: 0,
  activeSnapshotId: null,
  repositoryId,
  status: "empty",
  warningCount: 0,
});

export const ProjectionRepositoryStoreLive = Layer.effect(
  ProjectionRepositoryStore,
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient.SqlClient;
    const sql = makeProjectionSql(sqlClient);

    const status = Effect.fn("ProjectionRepositoryStore.status")(function* (repositoryId: string) {
      const raw = yield* sql.get(
        "repository status",
        `SELECT ${repositoryColumns} FROM repositories WHERE repository_id = ?`,
        [repositoryId],
      );
      if (raw === undefined) return emptyStatus(repositoryId);

      const row = yield* decodeValue("repository status row", RepositoryRowSchema, raw);
      const remotes =
        row.remotes_json === null
          ? []
          : yield* decodeJson("repository remotes", RepositoryRemotesSchema, row.remotes_json);
      const cycleMetadata =
        row.cycle_metadata_json === null
          ? undefined
          : yield* decodeJson(
              "Cycle repository metadata",
              CycleRepositoryMetadataSchema,
              row.cycle_metadata_json,
            );
      const metadata = metadataFromRow(row, remotes);

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
      } satisfies RepositoryStatus;
    });

    const register = Effect.fn("ProjectionRepositoryStore.register")(function* (
      input: RepositoryInput,
    ) {
      const metadata = normalizeRepositoryMetadata(input);
      const remotesJson = yield* encodeJson(
        "repository remotes",
        RepositoryRemotesSchema,
        metadata.remotes,
      );

      yield* sql.run(
        "register repository",
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
          remotesJson,
        ],
      );
      return yield* status(input.repositoryId);
    });

    const setCycleMetadata = Effect.fn("ProjectionRepositoryStore.setCycleMetadata")(function* (
      repositoryId: string,
      metadata: CycleRepositoryMetadata | undefined,
    ) {
      const encoded =
        metadata === undefined
          ? null
          : yield* encodeJson("Cycle repository metadata", CycleRepositoryMetadataSchema, metadata);
      yield* sql.run(
        "set Cycle repository metadata",
        "UPDATE repositories SET cycle_metadata_json = ? WHERE repository_id = ?",
        [encoded, repositoryId],
      );
      return yield* status(repositoryId);
    });

    const list = sql
      .all(
        "list repositories",
        `SELECT ${repositoryColumns} FROM repositories ORDER BY repository_id ASC`,
      )
      .pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) =>
            decodeValue("repository list row", RepositoryRowSchema, row).pipe(
              Effect.flatMap((decoded) => status(decoded.repository_id)),
            ),
          ),
        ),
      );

    const maxCommitSequence = Effect.fn("ProjectionRepositoryStore.maxCommitSequence")(function* (
      repositoryId: string,
    ) {
      const raw = yield* sql.get(
        "max commit sequence",
        "SELECT MAX(sequence) AS sequence FROM commits WHERE repository_id = ?",
        [repositoryId],
      );
      if (raw === undefined) return 0;
      const row = yield* decodeValue("max commit sequence row", CommitSequenceRowSchema, raw);
      return row.sequence ?? 0;
    });

    const markSyncStarted = Effect.fn("ProjectionRepositoryStore.markSyncStarted")(function* (
      repositoryId: string,
      now: string,
    ) {
      yield* sql.run(
        "mark sync started",
        `UPDATE repositories
           SET sync_status = 'syncing', last_sync_started_at = ?, last_sync_error = NULL
           WHERE repository_id = ?`,
        [now, repositoryId],
      );
    });

    const markSyncFailed = Effect.fn("ProjectionRepositoryStore.markSyncFailed")(function* (
      repositoryId: string,
      message: string,
    ) {
      yield* sql.run(
        "mark sync failed",
        `UPDATE repositories
           SET sync_status = 'failed', last_sync_error = ?
           WHERE repository_id = ?`,
        [message, repositoryId],
      );
    });

    const warningCount = Effect.fn("ProjectionRepositoryStore.warningCount")(function* (
      repositoryId: string,
      snapshotId: string | null,
    ) {
      if (snapshotId === null) return 0;
      const raw = yield* sql.get(
        "projection warning count",
        `SELECT COUNT(*) AS count
           FROM materialization_warnings
           WHERE repository_id = ? AND snapshot_id = ?`,
        [repositoryId, snapshotId],
      );
      if (raw === undefined) return 0;
      return (yield* decodeValue("warning count row", WarningCountRowSchema, raw)).count;
    });

    const activateSnapshot = Effect.fn("ProjectionRepositoryStore.activateSnapshot")(
      function* (input: {
        readonly completedAt: string;
        readonly repositoryId: string;
        readonly snapshotId: string | null;
      }) {
        const count = yield* warningCount(input.repositoryId, input.snapshotId);
        const nextStatus: RepositoryStatusValue =
          input.snapshotId === null ? "empty" : count > 0 ? "degraded" : "ready";
        yield* sql.run(
          "activate projection snapshot",
          `UPDATE repositories
             SET active_snapshot_id = ?,
                 active_generation = active_generation + 1,
                 sync_status = ?,
                 last_sync_completed_at = ?,
                 last_sync_error = NULL,
                 warning_count = ?
             WHERE repository_id = ?`,
          [input.snapshotId, nextStatus, input.completedAt, count, input.repositoryId],
        );
        return yield* status(input.repositoryId);
      },
    );

    const upsertCommit = Effect.fn("ProjectionRepositoryStore.upsertCommit")(function* (
      input: ProjectionCommit,
    ) {
      yield* sql.run(
        "upsert projection commit",
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
      yield* sql.run(
        "replace projection commit parents",
        "DELETE FROM commit_parents WHERE repository_id = ? AND snapshot_id = ?",
        [input.repositoryId, input.snapshotId],
      );
      yield* Effect.forEach(
        input.parentIds,
        (parentId) =>
          sql.run(
            "insert projection commit parent",
            `INSERT OR IGNORE INTO commit_parents (repository_id, snapshot_id, parent_snapshot_id)
               VALUES (?, ?, ?)`,
            [input.repositoryId, input.snapshotId, parentId],
          ),
        { discard: true },
      );
    });

    const replaceCommitChanges = Effect.fn("ProjectionRepositoryStore.replaceCommitChanges")(
      function* (input: ProjectionCommitChanges) {
        yield* sql.run(
          "replace projection commit changes",
          "DELETE FROM commit_changes WHERE repository_id = ? AND snapshot_id = ?",
          [input.repositoryId, input.snapshotId],
        );
        yield* Effect.forEach(
          input.changes,
          (change) =>
            sql.run(
              "insert projection commit change",
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
            ),
          { discard: true },
        );
      },
    );

    const addWarning = Effect.fn("ProjectionRepositoryStore.addWarning")(function* (
      warning: MaterializationWarning,
    ) {
      yield* sql.run(
        "insert materialization warning",
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
    });

    const warnings = Effect.fn("ProjectionRepositoryStore.warnings")(function* (
      repositoryId: string,
    ) {
      const rows = yield* sql.all(
        "list materialization warnings",
        `SELECT repository_id, snapshot_id, path, object_type, object_id, reason, message, created_at
           FROM materialization_warnings
           WHERE repository_id = ?
           ORDER BY created_at ASC, path ASC`,
        [repositoryId],
      );
      return yield* Effect.forEach(rows, (raw) =>
        decodeValue("materialization warning row", WarningRowSchema, raw).pipe(
          Effect.map(
            (row): MaterializationWarning => ({
              createdAt: row.created_at,
              message: row.message,
              objectId: row.object_id ?? undefined,
              objectType: row.object_type,
              path: row.path,
              reason: row.reason,
              repositoryId: row.repository_id,
              snapshotId: row.snapshot_id,
            }),
          ),
        ),
      );
    });

    return ProjectionRepositoryStore.of({
      activateSnapshot,
      addWarning,
      list,
      markSyncFailed,
      markSyncStarted,
      maxCommitSequence,
      register,
      replaceCommitChanges,
      setCycleMetadata,
      status,
      upsertCommit,
      warnings,
    });
  }),
);
