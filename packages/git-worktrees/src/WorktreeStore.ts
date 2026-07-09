import { makeSqliteLayer } from "@cycle/sqlite";
import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import { Context, Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import {
  WorktreeLeaseConflictError,
  WorktreeNotFoundError,
  WorktreeStateConflictError,
  WorktreeStoreError,
} from "./WorktreeErrors.ts";
import {
  BranchAssociation,
  BranchAssociationId,
  JobId,
  RepositoryId,
  TicketId,
  WorktreeHandoverId,
  WorktreeHandoverRecord,
  WorktreeHandoverStep,
  WorktreeId,
  WorktreeLastError,
  WorktreeLease,
  WorktreeLeaseId,
  WorktreeLeasePurpose,
  WorktreeLifecycleEvent,
  WorktreeMode,
  WorktreeRecord,
  WorktreeRetention,
  WorktreeSetupRun,
  WorktreeSetupRunId,
  WorktreeStatus,
  type BranchAssociationStatus,
  type ObjectId,
  type WorktreeCleanupPolicy,
  type WorktreeLeaseStatus,
  type WorktreeSetupStatus,
} from "./WorktreeSchemas.ts";
import { WorktreeConfig } from "./WorktreeConfig.ts";
import { newLifecycleEventId, newWorktreeLeaseId } from "./internal/ids.ts";
import { validateTransition } from "./internal/state-machine.ts";

export type CreateWorktreeRecordInput = Omit<WorktreeRecord, "createdAt" | "updatedAt"> & {
  readonly createdAt?: string;
  readonly updatedAt?: string;
};

export type TransitionWithEventInput = {
  readonly actor: string;
  readonly dedupeKey?: string | undefined;
  readonly eventType: string;
  readonly expectedStatus: WorktreeStatus;
  readonly fencingToken?: number | undefined;
  readonly nextStatus: WorktreeStatus;
  readonly payload?: unknown;
  readonly worktreeId: WorktreeId;
};

export type AcquireLeaseInput = {
  readonly actor: string;
  readonly heartbeatDeadline: string;
  readonly ownerId: string;
  readonly purpose: WorktreeLeasePurpose;
  readonly worktreeId: WorktreeId;
};

export type WorktreeStoreShape = {
  readonly acquireLease: (
    input: AcquireLeaseInput,
  ) => Effect.Effect<
    WorktreeLease,
    | WorktreeStoreError
    | WorktreeLeaseConflictError
    | WorktreeNotFoundError
    | WorktreeStateConflictError
  >;
  readonly createBranchAssociation: (
    association: BranchAssociation,
  ) => Effect.Effect<BranchAssociation, WorktreeStoreError>;
  readonly createHandover: (
    record: WorktreeHandoverRecord,
  ) => Effect.Effect<WorktreeHandoverRecord, WorktreeStoreError>;
  readonly createSetupRun: (
    run: WorktreeSetupRun,
  ) => Effect.Effect<WorktreeSetupRun, WorktreeStoreError>;
  readonly createWorktreeRecord: (
    input: CreateWorktreeRecordInput,
  ) => Effect.Effect<WorktreeRecord, WorktreeStoreError>;
  readonly findBranchAssociationByBranch: (
    repositoryId: RepositoryId,
    branchName: string,
  ) => Effect.Effect<BranchAssociation | null, WorktreeStoreError>;
  readonly findByJob: (
    repositoryId: RepositoryId,
    jobId: JobId,
  ) => Effect.Effect<ReadonlyArray<WorktreeRecord>, WorktreeStoreError>;
  readonly get: (
    worktreeId: WorktreeId,
  ) => Effect.Effect<WorktreeRecord, WorktreeStoreError | WorktreeNotFoundError>;
  readonly heartbeatLease: (
    leaseId: WorktreeLeaseId,
    fencingToken: number,
    heartbeatDeadline: string,
  ) => Effect.Effect<WorktreeLease, WorktreeStoreError | WorktreeLeaseConflictError>;
  readonly listActive: (
    repositoryId: RepositoryId,
  ) => Effect.Effect<ReadonlyArray<WorktreeRecord>, WorktreeStoreError>;
  readonly listStaleLeases: (
    now: string,
  ) => Effect.Effect<ReadonlyArray<WorktreeLease>, WorktreeStoreError>;
  readonly publishBranchAssociation: (input: {
    readonly association: BranchAssociation;
    readonly fencingToken?: number | undefined;
    readonly worktreeId: WorktreeId;
  }) => Effect.Effect<
    BranchAssociation,
    | WorktreeStoreError
    | WorktreeLeaseConflictError
    | WorktreeNotFoundError
    | WorktreeStateConflictError
  >;
  readonly recordSetupResult: (input: {
    readonly fencingToken?: number | undefined;
    readonly run: WorktreeSetupRun;
    readonly worktreeId: WorktreeId;
  }) => Effect.Effect<
    WorktreeRecord,
    | WorktreeStoreError
    | WorktreeLeaseConflictError
    | WorktreeNotFoundError
    | WorktreeStateConflictError
  >;
  readonly releaseLease: (
    leaseId: WorktreeLeaseId,
    fencingToken: number,
  ) => Effect.Effect<WorktreeLease, WorktreeStoreError | WorktreeLeaseConflictError>;
  readonly transitionWithEvent: (
    input: TransitionWithEventInput,
  ) => Effect.Effect<
    WorktreeRecord,
    | WorktreeStoreError
    | WorktreeNotFoundError
    | WorktreeStateConflictError
    | WorktreeLeaseConflictError
  >;
  readonly updateHandoverStep: (input: {
    readonly backupBranchName?: string | undefined;
    readonly branchAssociationId?: BranchAssociationId | undefined;
    readonly branchName?: string | undefined;
    readonly commentId?: string | undefined;
    readonly commits?: ReadonlyArray<ObjectId> | undefined;
    readonly completedStep?: WorktreeHandoverStep | undefined;
    readonly currentStep?: WorktreeHandoverStep | undefined;
    readonly fencingToken?: number | undefined;
    readonly handoverId: WorktreeHandoverId;
    readonly lastError?: WorktreeLastError | undefined;
    readonly pullRequestUrl?: string | undefined;
    readonly remoteName?: string | undefined;
    readonly remoteRef?: string | undefined;
    readonly remoteUrl?: string | undefined;
    readonly status?: "in_progress" | "completed" | "failed" | undefined;
    readonly summary?: string | undefined;
    readonly targetStatus?: string | undefined;
    readonly validation?: string | undefined;
    readonly worktreeId: WorktreeId;
  }) => Effect.Effect<
    WorktreeHandoverRecord,
    | WorktreeStoreError
    | WorktreeLeaseConflictError
    | WorktreeStateConflictError
    | WorktreeNotFoundError
  >;
  readonly updateSetupRun: (
    run: WorktreeSetupRun,
  ) => Effect.Effect<WorktreeSetupRun, WorktreeStoreError>;
};

export class WorktreeStore extends Context.Service<WorktreeStore, WorktreeStoreShape>()(
  "@cycle/git-worktrees/WorktreeStore",
) {}

type WorktreeRecordRow = {
  readonly agent_run_id: string | null;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly branch_association_id: string | null;
  readonly cleanup_policy: WorktreeCleanupPolicy;
  readonly common_git_dir: string;
  readonly created_at: string;
  readonly desired_branch_name: string | null;
  readonly git_dir: string;
  readonly job_id: string;
  readonly last_error_json: string | null;
  readonly last_reconciled_at: string | null;
  readonly mode: WorktreeMode;
  readonly path: string;
  readonly ready_sha: string | null;
  readonly remote_branch_ref: string | null;
  readonly remote_name: string | null;
  readonly repository_id: string;
  readonly repository_path: string;
  readonly retention_json: string | null;
  readonly setup_artifact_paths_json: string | null;
  readonly setup_dirty_policy: "require_clean" | "record_generated_changes";
  readonly setup_generated_changes_summary: string | null;
  readonly setup_profile_id: string | null;
  readonly setup_run_id: string | null;
  readonly status: WorktreeStatus;
  readonly storage_root: string;
  readonly ticket_id: string | null;
  readonly ticket_slug_source: string | null;
  readonly ticket_type: string | null;
  readonly updated_at: string;
  readonly worktree_id: string;
};

type LeaseRow = {
  readonly acquired_at: string;
  readonly actor: string;
  readonly fencing_token: number;
  readonly heartbeat_at: string;
  readonly heartbeat_deadline: string;
  readonly lease_id: string;
  readonly owner_id: string;
  readonly purpose: WorktreeLeasePurpose;
  readonly released_at: string | null;
  readonly repository_id: string;
  readonly status: WorktreeLeaseStatus;
  readonly worktree_id: string;
};

type BranchAssociationRow = {
  readonly base_sha: string;
  readonly branch_association_id: string;
  readonly branch_name: string;
  readonly branch_ref: string;
  readonly created_at: string;
  readonly handover_id: string | null;
  readonly head_sha: string;
  readonly job_id: string;
  readonly pushed_at: string | null;
  readonly remote_name: string | null;
  readonly remote_ref: string | null;
  readonly repository_id: string;
  readonly status: BranchAssociationStatus;
  readonly ticket_id: string;
  readonly updated_at: string;
  readonly worktree_id: string;
};

type SetupRunRow = {
  readonly artifact_paths_json: string | null;
  readonly commands_json: string;
  readonly completed_at: string | null;
  readonly dirty_policy: "require_clean" | "record_generated_changes";
  readonly generated_changes_summary: string | null;
  readonly last_error_json: string | null;
  readonly output_summary: string | null;
  readonly profile_id: string;
  readonly ready_sha: string | null;
  readonly redacted_environment_json: string | null;
  readonly setup_run_id: string;
  readonly started_at: string;
  readonly status: WorktreeSetupStatus;
  readonly worktree_id: string;
};

type HandoverRow = {
  readonly backup_branch_name: string | null;
  readonly branch_association_id: string | null;
  readonly branch_name: string | null;
  readonly comment_id: string | null;
  readonly commits_json: string;
  readonly completed_at: string | null;
  readonly completed_steps_json: string;
  readonly created_at: string;
  readonly current_step: WorktreeHandoverStep | null;
  readonly handover_id: string;
  readonly job_id: string;
  readonly last_error_json: string | null;
  readonly pull_request_url: string | null;
  readonly remote_name: string | null;
  readonly remote_ref: string | null;
  readonly remote_url: string | null;
  readonly repository_id: string;
  readonly status: "in_progress" | "completed" | "failed";
  readonly summary: string | null;
  readonly target_status: string | null;
  readonly ticket_id: string | null;
  readonly updated_at: string;
  readonly validation: string | null;
  readonly worktree_id: string;
};

const RowByWorktreeId = Schema.Struct({ worktree_id: WorktreeId });
const WorktreeRecordRowSchema = Schema.Struct({
  agent_run_id: Schema.NullOr(Schema.String),
  base_ref: Schema.String,
  base_sha: Schema.String,
  branch_association_id: Schema.NullOr(Schema.String),
  cleanup_policy: Schema.String,
  common_git_dir: Schema.String,
  created_at: Schema.String,
  desired_branch_name: Schema.NullOr(Schema.String),
  git_dir: Schema.String,
  job_id: Schema.String,
  last_error_json: Schema.NullOr(Schema.String),
  last_reconciled_at: Schema.NullOr(Schema.String),
  mode: Schema.String,
  path: Schema.String,
  ready_sha: Schema.NullOr(Schema.String),
  remote_branch_ref: Schema.NullOr(Schema.String),
  remote_name: Schema.NullOr(Schema.String),
  repository_id: Schema.String,
  repository_path: Schema.String,
  retention_json: Schema.NullOr(Schema.String),
  setup_artifact_paths_json: Schema.NullOr(Schema.String),
  setup_dirty_policy: Schema.String,
  setup_generated_changes_summary: Schema.NullOr(Schema.String),
  setup_profile_id: Schema.NullOr(Schema.String),
  setup_run_id: Schema.NullOr(Schema.String),
  status: Schema.String,
  storage_root: Schema.String,
  ticket_id: Schema.NullOr(Schema.String),
  ticket_slug_source: Schema.NullOr(Schema.String),
  ticket_type: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
  worktree_id: Schema.String,
});

const nowIso = (): string => new Date().toISOString();

const parseJson = <A>(schema: Schema.Top, value: string | null): A | undefined => {
  if (value === null) return undefined;
  return Schema.decodeUnknownSync(schema as never)(JSON.parse(value)) as A;
};

const stringifyJson = (value: unknown | undefined): string | null =>
  value === undefined ? null : JSON.stringify(value);

const rowToRecord = (row: WorktreeRecordRow): WorktreeRecord => {
  const lastError = parseJson<WorktreeLastError>(WorktreeLastError, row.last_error_json);
  const retention = parseJson<WorktreeRetention>(WorktreeRetention, row.retention_json);
  const artifactPaths = parseJson<ReadonlyArray<string>>(
    Schema.Array(Schema.String),
    row.setup_artifact_paths_json,
  );

  return WorktreeRecord.make({
    baseRef: row.base_ref,
    baseSha: row.base_sha as ObjectId,
    cleanupPolicy: row.cleanup_policy,
    commonGitDir: row.common_git_dir,
    createdAt: row.created_at,
    gitDir: row.git_dir,
    jobId: row.job_id as JobId,
    mode: row.mode,
    path: row.path,
    repositoryId: row.repository_id as RepositoryId,
    repositoryPath: row.repository_path,
    setupDirtyPolicy: row.setup_dirty_policy,
    status: row.status,
    storageRoot: row.storage_root,
    updatedAt: row.updated_at,
    worktreeId: row.worktree_id as WorktreeId,
    ...(row.agent_run_id === null ? {} : { agentRunId: row.agent_run_id as never }),
    ...(row.branch_association_id === null
      ? {}
      : { branchAssociationId: row.branch_association_id as BranchAssociationId }),
    ...(row.desired_branch_name === null ? {} : { desiredBranchName: row.desired_branch_name }),
    ...(lastError === undefined ? {} : { lastError }),
    ...(row.last_reconciled_at === null ? {} : { lastReconciledAt: row.last_reconciled_at }),
    ...(row.ready_sha === null ? {} : { readySha: row.ready_sha as ObjectId }),
    ...(row.remote_branch_ref === null ? {} : { remoteBranchRef: row.remote_branch_ref }),
    ...(row.remote_name === null ? {} : { remoteName: row.remote_name }),
    ...(retention === undefined ? {} : { retention: retention as never }),
    ...(artifactPaths === undefined ? {} : { setupArtifactPaths: artifactPaths }),
    ...(row.setup_generated_changes_summary === null
      ? {}
      : { setupGeneratedChangesSummary: row.setup_generated_changes_summary }),
    ...(row.setup_profile_id === null ? {} : { setupProfileId: row.setup_profile_id }),
    ...(row.setup_run_id === null ? {} : { setupRunId: row.setup_run_id as WorktreeSetupRunId }),
    ...(row.ticket_id === null ? {} : { ticketId: row.ticket_id as TicketId }),
    ...(row.ticket_slug_source === null ? {} : { ticketSlugSource: row.ticket_slug_source }),
    ...(row.ticket_type === null ? {} : { ticketType: row.ticket_type }),
  });
};

const recordToRow = (record: WorktreeRecord): WorktreeRecordRow => ({
  agent_run_id: record.agentRunId ?? null,
  base_ref: record.baseRef,
  base_sha: record.baseSha,
  branch_association_id: record.branchAssociationId ?? null,
  cleanup_policy: record.cleanupPolicy,
  common_git_dir: record.commonGitDir,
  created_at: record.createdAt,
  desired_branch_name: record.desiredBranchName ?? null,
  git_dir: record.gitDir,
  job_id: record.jobId,
  last_error_json: stringifyJson(record.lastError),
  last_reconciled_at: record.lastReconciledAt ?? null,
  mode: record.mode,
  path: record.path,
  ready_sha: record.readySha ?? null,
  remote_branch_ref: record.remoteBranchRef ?? null,
  remote_name: record.remoteName ?? null,
  repository_id: record.repositoryId,
  repository_path: record.repositoryPath,
  retention_json: stringifyJson(record.retention),
  setup_artifact_paths_json: stringifyJson(record.setupArtifactPaths),
  setup_dirty_policy: record.setupDirtyPolicy,
  setup_generated_changes_summary: record.setupGeneratedChangesSummary ?? null,
  setup_profile_id: record.setupProfileId ?? null,
  setup_run_id: record.setupRunId ?? null,
  status: record.status,
  storage_root: record.storageRoot,
  ticket_id: record.ticketId ?? null,
  ticket_slug_source: record.ticketSlugSource ?? null,
  ticket_type: record.ticketType ?? null,
  updated_at: record.updatedAt,
  worktree_id: record.worktreeId,
});

const rowToLease = (row: LeaseRow): WorktreeLease =>
  WorktreeLease.make({
    acquiredAt: row.acquired_at,
    actor: row.actor,
    fencingToken: row.fencing_token,
    heartbeatAt: row.heartbeat_at,
    heartbeatDeadline: row.heartbeat_deadline,
    leaseId: row.lease_id as WorktreeLeaseId,
    ownerId: row.owner_id,
    purpose: row.purpose,
    repositoryId: row.repository_id as RepositoryId,
    status: row.status,
    worktreeId: row.worktree_id as WorktreeId,
    ...(row.released_at === null ? {} : { releasedAt: row.released_at }),
  });

const branchRowToAssociation = (row: BranchAssociationRow): BranchAssociation =>
  BranchAssociation.make({
    baseSha: row.base_sha as ObjectId,
    branchAssociationId: row.branch_association_id as BranchAssociationId,
    branchName: row.branch_name,
    branchRef: row.branch_ref,
    createdAt: row.created_at,
    headSha: row.head_sha as ObjectId,
    jobId: row.job_id as JobId,
    repositoryId: row.repository_id as RepositoryId,
    status: row.status,
    ticketId: row.ticket_id as TicketId,
    updatedAt: row.updated_at,
    worktreeId: row.worktree_id as WorktreeId,
    ...(row.handover_id === null ? {} : { handoverId: row.handover_id as WorktreeHandoverId }),
    ...(row.pushed_at === null ? {} : { pushedAt: row.pushed_at }),
    ...(row.remote_name === null ? {} : { remoteName: row.remote_name }),
    ...(row.remote_ref === null ? {} : { remoteRef: row.remote_ref }),
  });

const associationToRow = (association: BranchAssociation): BranchAssociationRow => ({
  base_sha: association.baseSha,
  branch_association_id: association.branchAssociationId,
  branch_name: association.branchName,
  branch_ref: association.branchRef,
  created_at: association.createdAt,
  handover_id: association.handoverId ?? null,
  head_sha: association.headSha,
  job_id: association.jobId,
  pushed_at: association.pushedAt ?? null,
  remote_name: association.remoteName ?? null,
  remote_ref: association.remoteRef ?? null,
  repository_id: association.repositoryId,
  status: association.status,
  ticket_id: association.ticketId,
  updated_at: association.updatedAt,
  worktree_id: association.worktreeId,
});

const setupRunToRow = (run: WorktreeSetupRun): SetupRunRow => ({
  artifact_paths_json: stringifyJson(run.artifactPaths),
  commands_json: JSON.stringify(run.commands),
  completed_at: run.completedAt ?? null,
  dirty_policy: run.dirtyPolicy,
  generated_changes_summary: run.generatedChangesSummary ?? null,
  last_error_json: stringifyJson(run.lastError),
  output_summary: run.outputSummary ?? null,
  profile_id: run.profileId,
  ready_sha: run.readySha ?? null,
  redacted_environment_json: stringifyJson(run.redactedEnvironment),
  setup_run_id: run.setupRunId,
  started_at: run.startedAt,
  status: run.status,
  worktree_id: run.worktreeId,
});

const handoverToRow = (record: WorktreeHandoverRecord): HandoverRow => ({
  backup_branch_name: record.backupBranchName ?? null,
  branch_association_id: record.branchAssociationId ?? null,
  branch_name: record.branchName ?? null,
  comment_id: record.commentId ?? null,
  commits_json: JSON.stringify(record.commits),
  completed_at: record.completedAt ?? null,
  completed_steps_json: JSON.stringify(record.completedSteps),
  created_at: record.createdAt,
  current_step: record.currentStep ?? null,
  handover_id: record.handoverId,
  job_id: record.jobId,
  last_error_json: stringifyJson(record.lastError),
  pull_request_url: record.pullRequestUrl ?? null,
  remote_name: record.remoteName ?? null,
  remote_ref: record.remoteRef ?? null,
  remote_url: record.remoteUrl ?? null,
  repository_id: record.repositoryId,
  status: record.status,
  summary: record.summary ?? null,
  target_status: record.targetStatus ?? null,
  ticket_id: record.ticketId ?? null,
  updated_at: record.updatedAt,
  validation: record.validation ?? null,
  worktree_id: record.worktreeId,
});

const rowToHandover = (row: HandoverRow): WorktreeHandoverRecord =>
  WorktreeHandoverRecord.make({
    commits: Schema.decodeUnknownSync(Schema.Array(Schema.String))(
      JSON.parse(row.commits_json),
    ) as ReadonlyArray<ObjectId>,
    completedSteps: Schema.decodeUnknownSync(Schema.Array(WorktreeHandoverStep))(
      JSON.parse(row.completed_steps_json),
    ),
    createdAt: row.created_at,
    handoverId: row.handover_id as WorktreeHandoverId,
    jobId: row.job_id as JobId,
    repositoryId: row.repository_id as RepositoryId,
    status: row.status,
    updatedAt: row.updated_at,
    worktreeId: row.worktree_id as WorktreeId,
    ...(row.backup_branch_name === null ? {} : { backupBranchName: row.backup_branch_name }),
    ...(row.branch_association_id === null
      ? {}
      : { branchAssociationId: row.branch_association_id as BranchAssociationId }),
    ...(row.branch_name === null ? {} : { branchName: row.branch_name }),
    ...(row.comment_id === null ? {} : { commentId: row.comment_id }),
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    ...(row.current_step === null ? {} : { currentStep: row.current_step }),
    ...(row.last_error_json === null
      ? {}
      : {
          lastError: Schema.decodeUnknownSync(WorktreeLastError)(JSON.parse(row.last_error_json)),
        }),
    ...(row.pull_request_url === null ? {} : { pullRequestUrl: row.pull_request_url }),
    ...(row.remote_name === null ? {} : { remoteName: row.remote_name }),
    ...(row.remote_ref === null ? {} : { remoteRef: row.remote_ref }),
    ...(row.remote_url === null ? {} : { remoteUrl: row.remote_url }),
    ...(row.summary === null ? {} : { summary: row.summary }),
    ...(row.target_status === null ? {} : { targetStatus: row.target_status }),
    ...(row.ticket_id === null ? {} : { ticketId: row.ticket_id as TicketId }),
    ...(row.validation === null ? {} : { validation: row.validation }),
  });

const mapSqlError = (operation: string, cause: unknown): WorktreeStoreError =>
  new WorktreeStoreError({
    cause,
    message: `Worktree store operation failed: ${operation}`,
    operation,
  });

const makeLifecycleEvent = (record: WorktreeRecord, input: TransitionWithEventInput, now: string) =>
  WorktreeLifecycleEvent.make({
    actor: input.actor,
    eventId: newLifecycleEventId(),
    eventType: input.eventType,
    nextStatus: input.nextStatus,
    occurredAt: now,
    previousStatus: input.expectedStatus,
    repositoryId: record.repositoryId,
    sequence: 0,
    worktreeId: record.worktreeId,
    ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
    ...(record.jobId === undefined ? {} : { jobId: record.jobId }),
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    ...(record.ticketId === undefined ? {} : { ticketId: record.ticketId }),
  });

export const WorktreeStoreSqliteLive = Layer.effect(
  WorktreeStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const worktreeByIdQuery = SqlSchema.findOneOption({
      Request: RowByWorktreeId,
      Result: WorktreeRecordRowSchema,
      execute: (request) =>
        sql<WorktreeRecordRow>`
          SELECT * FROM worktree_records WHERE worktree_id = ${request.worktree_id}
        `,
    });

    const mapTransactionError = (operation: string) =>
      Effect.mapError((cause: unknown) =>
        cause instanceof WorktreeLeaseConflictError ||
        cause instanceof WorktreeNotFoundError ||
        cause instanceof WorktreeStateConflictError ||
        cause instanceof WorktreeStoreError
          ? cause
          : mapSqlError(operation, cause),
      );

    const get = Effect.fn("WorktreeStore.get")(function* (worktreeId: WorktreeId) {
      const row = yield* worktreeByIdQuery({ worktree_id: worktreeId }).pipe(
        Effect.mapError((cause) => mapSqlError("get", cause)),
      );

      if (Option.isNone(row)) {
        return yield* new WorktreeNotFoundError({
          message: `Worktree not found: ${worktreeId}`,
          worktreeId,
        });
      }

      return rowToRecord(row.value as WorktreeRecordRow);
    });

    const insertLifecycleEvent = (event: WorktreeLifecycleEvent) =>
      sql`
        INSERT INTO worktree_lifecycle_events (
          event_id, worktree_id, repository_id, job_id, ticket_id, event_type, occurred_at,
          actor, dedupe_key, previous_status, next_status, payload_json
        ) VALUES (
          ${event.eventId}, ${event.worktreeId}, ${event.repositoryId}, ${event.jobId ?? null},
          ${event.ticketId ?? null}, ${event.eventType}, ${event.occurredAt}, ${event.actor},
          ${event.dedupeKey ?? null}, ${event.previousStatus ?? null}, ${event.nextStatus ?? null},
          ${stringifyJson(event.payload)}
        )
      `;

    const createWorktreeRecord = Effect.fn("WorktreeStore.createWorktreeRecord")(function* (
      input: CreateWorktreeRecordInput,
    ) {
      const now = nowIso();
      const record = WorktreeRecord.make({
        ...input,
        createdAt: input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now,
      });
      const row = recordToRow(record);

      yield* sql`
        INSERT INTO worktree_records (
          worktree_id, repository_id, repository_path, git_dir, common_git_dir, job_id, mode,
          status, path, storage_root, base_ref, base_sha, ready_sha, created_at, updated_at,
          setup_profile_id, setup_run_id, setup_dirty_policy, setup_artifact_paths_json,
          setup_generated_changes_summary, agent_run_id, ticket_id, ticket_slug_source,
          ticket_type, desired_branch_name, branch_association_id, remote_name, remote_branch_ref,
          retention_json, cleanup_policy, last_error_json, last_reconciled_at
        ) VALUES (
          ${row.worktree_id}, ${row.repository_id}, ${row.repository_path}, ${row.git_dir},
          ${row.common_git_dir}, ${row.job_id}, ${row.mode}, ${row.status}, ${row.path},
          ${row.storage_root}, ${row.base_ref}, ${row.base_sha}, ${row.ready_sha},
          ${row.created_at}, ${row.updated_at}, ${row.setup_profile_id}, ${row.setup_run_id},
          ${row.setup_dirty_policy}, ${row.setup_artifact_paths_json},
          ${row.setup_generated_changes_summary}, ${row.agent_run_id}, ${row.ticket_id},
          ${row.ticket_slug_source}, ${row.ticket_type}, ${row.desired_branch_name},
          ${row.branch_association_id}, ${row.remote_name}, ${row.remote_branch_ref},
          ${row.retention_json}, ${row.cleanup_policy}, ${row.last_error_json},
          ${row.last_reconciled_at}
        )
      `.pipe(Effect.mapError((cause) => mapSqlError("createWorktreeRecord", cause)));

      return record;
    });

    const activeLeaseForUpdate = (
      worktreeId: WorktreeId,
      fencingToken: number,
    ): Effect.Effect<void, WorktreeStoreError | WorktreeLeaseConflictError> =>
      Effect.gen(function* () {
        const rows = yield* sql<{ readonly count: number }>`
          SELECT count(*) AS count FROM worktree_leases
          WHERE worktree_id = ${worktreeId}
            AND fencing_token = ${fencingToken}
            AND status = 'active'
        `.pipe(Effect.mapError((cause) => mapSqlError("activeLeaseForUpdate", cause)));
        if ((rows[0]?.count ?? 0) < 1) {
          return yield* new WorktreeLeaseConflictError({
            fencingToken,
            message: "No active lease owns the supplied fencing token.",
            worktreeId,
          });
        }
      });

    const transitionWithEvent = Effect.fn("WorktreeStore.transitionWithEvent")(function* (
      input: TransitionWithEventInput,
    ) {
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            if (input.fencingToken !== undefined) {
              yield* activeLeaseForUpdate(input.worktreeId, input.fencingToken);
            }

            const current = yield* get(input.worktreeId);
            if (current.status !== input.expectedStatus) {
              return yield* new WorktreeStateConflictError({
                currentStatus: current.status,
                expectedStatus: input.expectedStatus,
                message: `Expected worktree ${input.worktreeId} to be ${input.expectedStatus}, got ${current.status}.`,
                nextStatus: input.nextStatus,
                repositoryId: current.repositoryId,
                worktreeId: input.worktreeId,
              });
            }

            yield* validateTransition({
              from: input.expectedStatus,
              repositoryId: current.repositoryId,
              to: input.nextStatus,
              worktreeId: input.worktreeId,
            });

            const now = nowIso();
            const updateRows = yield* sql`
            UPDATE worktree_records
            SET status = ${input.nextStatus}, updated_at = ${now}
            WHERE worktree_id = ${input.worktreeId}
              AND status = ${input.expectedStatus}
          `.pipe(Effect.mapError((cause) => mapSqlError("transitionWithEvent", cause)));
            void updateRows;

            const updated = WorktreeRecord.make({
              ...current,
              status: input.nextStatus,
              updatedAt: now,
            });
            yield* insertLifecycleEvent(makeLifecycleEvent(updated, input, now)).pipe(
              Effect.mapError((cause) => mapSqlError("insertLifecycleEvent", cause)),
            );

            return updated;
          }),
        )
        .pipe(mapTransactionError("transitionWithEvent.transaction"));
    });

    const acquireLease = Effect.fn("WorktreeStore.acquireLease")(function* (
      input: AcquireLeaseInput,
    ) {
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const record = yield* get(input.worktreeId);
            const activeRows = yield* sql<{ readonly count: number }>`
            SELECT count(*) AS count FROM worktree_leases
            WHERE worktree_id = ${input.worktreeId} AND status = 'active'
          `.pipe(Effect.mapError((cause) => mapSqlError("acquireLease.active", cause)));
            if ((activeRows[0]?.count ?? 0) > 0) {
              return yield* new WorktreeLeaseConflictError({
                message: "Worktree already has an active lease.",
                purpose: input.purpose,
                repositoryId: record.repositoryId,
                worktreeId: input.worktreeId,
              });
            }

            const latestRows = yield* sql<{ readonly token: number | null }>`
            SELECT max(fencing_token) AS token FROM worktree_leases WHERE worktree_id = ${input.worktreeId}
          `.pipe(Effect.mapError((cause) => mapSqlError("acquireLease.token", cause)));
            const now = nowIso();
            const lease = WorktreeLease.make({
              acquiredAt: now,
              actor: input.actor,
              fencingToken: (latestRows[0]?.token ?? 0) + 1,
              heartbeatAt: now,
              heartbeatDeadline: input.heartbeatDeadline,
              leaseId: newWorktreeLeaseId(),
              ownerId: input.ownerId,
              purpose: input.purpose,
              repositoryId: record.repositoryId,
              status: "active",
              worktreeId: input.worktreeId,
            });

            yield* sql`
            INSERT INTO worktree_leases (
              lease_id, worktree_id, repository_id, purpose, owner_id, actor, fencing_token,
              acquired_at, heartbeat_at, heartbeat_deadline, released_at, status
            ) VALUES (
              ${lease.leaseId}, ${lease.worktreeId}, ${lease.repositoryId}, ${lease.purpose},
              ${lease.ownerId}, ${lease.actor}, ${lease.fencingToken}, ${lease.acquiredAt},
              ${lease.heartbeatAt}, ${lease.heartbeatDeadline}, NULL, ${lease.status}
            )
          `.pipe(Effect.mapError((cause) => mapSqlError("acquireLease.insert", cause)));

            return lease;
          }),
        )
        .pipe(mapTransactionError("acquireLease.transaction"));
    });

    const leaseById = Effect.fn("WorktreeStore.leaseById")(function* (leaseId: WorktreeLeaseId) {
      const rows =
        yield* sql<LeaseRow>`SELECT * FROM worktree_leases WHERE lease_id = ${leaseId}`.pipe(
          Effect.mapError((cause) => mapSqlError("leaseById", cause)),
        );
      const row = rows[0];
      if (row === undefined) {
        return yield* new WorktreeLeaseConflictError({
          message: `Lease not found: ${leaseId}`,
        });
      }
      return rowToLease(row);
    });

    const heartbeatLease = Effect.fn("WorktreeStore.heartbeatLease")(function* (
      leaseId: WorktreeLeaseId,
      fencingToken: number,
      heartbeatDeadline: string,
    ) {
      const now = nowIso();
      yield* sql`
        UPDATE worktree_leases
        SET heartbeat_at = ${now}, heartbeat_deadline = ${heartbeatDeadline}
        WHERE lease_id = ${leaseId}
          AND fencing_token = ${fencingToken}
          AND status = 'active'
      `.pipe(Effect.mapError((cause) => mapSqlError("heartbeatLease", cause)));
      const lease = yield* leaseById(leaseId).pipe(
        Effect.mapError((cause) =>
          cause instanceof WorktreeLeaseConflictError
            ? cause
            : mapSqlError("heartbeatLease.get", cause),
        ),
      );
      if (lease.fencingToken !== fencingToken || lease.status !== "active") {
        return yield* new WorktreeLeaseConflictError({
          fencingToken,
          message: "Heartbeat rejected by stale fencing token.",
          worktreeId: lease.worktreeId,
        });
      }
      return lease;
    });

    const releaseLease = Effect.fn("WorktreeStore.releaseLease")(function* (
      leaseId: WorktreeLeaseId,
      fencingToken: number,
    ) {
      const now = nowIso();
      yield* sql`
        UPDATE worktree_leases
        SET released_at = ${now}, status = 'released'
        WHERE lease_id = ${leaseId}
          AND fencing_token = ${fencingToken}
          AND status = 'active'
      `.pipe(Effect.mapError((cause) => mapSqlError("releaseLease", cause)));
      const lease = yield* leaseById(leaseId).pipe(
        Effect.mapError((cause) =>
          cause instanceof WorktreeLeaseConflictError
            ? cause
            : mapSqlError("releaseLease.get", cause),
        ),
      );
      if (lease.fencingToken !== fencingToken) {
        return yield* new WorktreeLeaseConflictError({
          fencingToken,
          message: "Release rejected by stale fencing token.",
          worktreeId: lease.worktreeId,
        });
      }
      return lease;
    });

    const createSetupRun = Effect.fn("WorktreeStore.createSetupRun")(function* (
      run: WorktreeSetupRun,
    ) {
      const row = setupRunToRow(run);
      yield* sql`
        INSERT INTO worktree_setup_runs (
          setup_run_id, worktree_id, profile_id, started_at, completed_at, status, commands_json,
          redacted_environment_json, output_summary, artifact_paths_json, ready_sha, dirty_policy,
          generated_changes_summary, last_error_json
        ) VALUES (
          ${row.setup_run_id}, ${row.worktree_id}, ${row.profile_id}, ${row.started_at},
          ${row.completed_at}, ${row.status}, ${row.commands_json}, ${row.redacted_environment_json},
          ${row.output_summary}, ${row.artifact_paths_json}, ${row.ready_sha}, ${row.dirty_policy},
          ${row.generated_changes_summary}, ${row.last_error_json}
        )
      `.pipe(Effect.mapError((cause) => mapSqlError("createSetupRun", cause)));
      return run;
    });

    const updateSetupRun = Effect.fn("WorktreeStore.updateSetupRun")(function* (
      run: WorktreeSetupRun,
    ) {
      const row = setupRunToRow(run);
      yield* sql`
        UPDATE worktree_setup_runs
        SET completed_at = ${row.completed_at}, status = ${row.status},
            output_summary = ${row.output_summary}, artifact_paths_json = ${row.artifact_paths_json},
            ready_sha = ${row.ready_sha}, dirty_policy = ${row.dirty_policy},
            generated_changes_summary = ${row.generated_changes_summary},
            last_error_json = ${row.last_error_json}
        WHERE setup_run_id = ${row.setup_run_id}
      `.pipe(Effect.mapError((cause) => mapSqlError("updateSetupRun", cause)));
      return run;
    });

    const recordSetupResult = Effect.fn("WorktreeStore.recordSetupResult")(function* (input: {
      readonly fencingToken?: number | undefined;
      readonly run: WorktreeSetupRun;
      readonly worktreeId: WorktreeId;
    }) {
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            if (input.fencingToken !== undefined) {
              yield* activeLeaseForUpdate(input.worktreeId, input.fencingToken);
            }
            yield* updateSetupRun(input.run);
            const now = nowIso();
            yield* sql`
            UPDATE worktree_records
            SET setup_run_id = ${input.run.setupRunId},
                setup_dirty_policy = ${input.run.dirtyPolicy},
                setup_artifact_paths_json = ${stringifyJson(input.run.artifactPaths)},
                setup_generated_changes_summary = ${input.run.generatedChangesSummary ?? null},
                ready_sha = ${input.run.readySha ?? null},
                updated_at = ${now}
            WHERE worktree_id = ${input.worktreeId}
              AND (${input.fencingToken ?? null} IS NULL OR EXISTS (
                SELECT 1 FROM worktree_leases
                WHERE worktree_id = ${input.worktreeId}
                  AND fencing_token = ${input.fencingToken ?? -1}
                  AND status = 'active'
              ))
          `.pipe(Effect.mapError((cause) => mapSqlError("recordSetupResult", cause)));
            return yield* get(input.worktreeId);
          }),
        )
        .pipe(mapTransactionError("recordSetupResult.transaction"));
    });

    const createBranchAssociation = Effect.fn("WorktreeStore.createBranchAssociation")(function* (
      association: BranchAssociation,
    ) {
      const row = associationToRow(association);
      yield* sql`
        INSERT INTO branch_associations (
          branch_association_id, repository_id, ticket_id, job_id, worktree_id, branch_name,
          branch_ref, base_sha, head_sha, remote_name, remote_ref, pushed_at, status, created_at,
          updated_at, handover_id
        ) VALUES (
          ${row.branch_association_id}, ${row.repository_id}, ${row.ticket_id}, ${row.job_id},
          ${row.worktree_id}, ${row.branch_name}, ${row.branch_ref}, ${row.base_sha},
          ${row.head_sha}, ${row.remote_name}, ${row.remote_ref}, ${row.pushed_at}, ${row.status},
          ${row.created_at}, ${row.updated_at}, ${row.handover_id}
        )
        ON CONFLICT(branch_association_id) DO UPDATE SET
          head_sha = excluded.head_sha,
          remote_name = excluded.remote_name,
          remote_ref = excluded.remote_ref,
          pushed_at = excluded.pushed_at,
          status = excluded.status,
          updated_at = excluded.updated_at,
          handover_id = excluded.handover_id
      `.pipe(Effect.mapError((cause) => mapSqlError("createBranchAssociation", cause)));
      return association;
    });

    const publishBranchAssociation = Effect.fn("WorktreeStore.publishBranchAssociation")(
      function* (input: {
        readonly association: BranchAssociation;
        readonly fencingToken?: number | undefined;
        readonly worktreeId: WorktreeId;
      }) {
        return yield* sql
          .withTransaction(
            Effect.gen(function* () {
              if (input.fencingToken !== undefined) {
                yield* activeLeaseForUpdate(input.worktreeId, input.fencingToken);
              }
              const association = yield* createBranchAssociation(input.association);
              yield* sql`
            UPDATE worktree_records
            SET branch_association_id = ${association.branchAssociationId},
                desired_branch_name = ${association.branchName},
                remote_name = ${association.remoteName ?? null},
                remote_branch_ref = ${association.remoteRef ?? null},
                updated_at = ${association.updatedAt}
            WHERE worktree_id = ${input.worktreeId}
          `.pipe(Effect.mapError((cause) => mapSqlError("publishBranchAssociation.record", cause)));
              return association;
            }),
          )
          .pipe(mapTransactionError("publishBranchAssociation.transaction"));
      },
    );

    const findBranchAssociationByBranch = Effect.fn("WorktreeStore.findBranchAssociationByBranch")(
      function* (repositoryId: RepositoryId, branchName: string) {
        const rows = yield* sql<BranchAssociationRow>`
        SELECT * FROM branch_associations
        WHERE repository_id = ${repositoryId} AND branch_name = ${branchName}
        ORDER BY updated_at DESC
        LIMIT 1
      `.pipe(Effect.mapError((cause) => mapSqlError("findBranchAssociationByBranch", cause)));
        return rows[0] === undefined ? null : branchRowToAssociation(rows[0]);
      },
    );

    const listActive = Effect.fn("WorktreeStore.listActive")(function* (
      repositoryId: RepositoryId,
    ) {
      const rows = yield* sql<WorktreeRecordRow>`
        SELECT * FROM worktree_records
        WHERE repository_id = ${repositoryId}
          AND status IN ('creating', 'initialising', 'ready', 'removing', 'retained', 'failed')
        ORDER BY created_at ASC
      `.pipe(Effect.mapError((cause) => mapSqlError("listActive", cause)));
      return rows.map(rowToRecord);
    });

    const findByJob = Effect.fn("WorktreeStore.findByJob")(function* (
      repositoryId: RepositoryId,
      jobId: JobId,
    ) {
      const rows = yield* sql<WorktreeRecordRow>`
        SELECT * FROM worktree_records
        WHERE repository_id = ${repositoryId} AND job_id = ${jobId}
        ORDER BY created_at ASC
      `.pipe(Effect.mapError((cause) => mapSqlError("findByJob", cause)));
      return rows.map(rowToRecord);
    });

    const listStaleLeases = Effect.fn("WorktreeStore.listStaleLeases")(function* (now: string) {
      const rows = yield* sql<LeaseRow>`
        SELECT * FROM worktree_leases
        WHERE status = 'active' AND heartbeat_deadline < ${now}
      `.pipe(Effect.mapError((cause) => mapSqlError("listStaleLeases", cause)));
      return rows.map(rowToLease);
    });

    const createHandover = Effect.fn("WorktreeStore.createHandover")(function* (
      record: WorktreeHandoverRecord,
    ) {
      const row = handoverToRow(record);
      yield* sql`
        INSERT INTO worktree_handovers (
          handover_id, worktree_id, repository_id, job_id, ticket_id, status, current_step,
          completed_steps_json, summary, validation, commits_json, branch_association_id,
          branch_name, remote_name, remote_ref, remote_url, backup_branch_name, target_status,
          comment_id, pull_request_url, created_at, updated_at, completed_at, last_error_json
        ) VALUES (
          ${row.handover_id}, ${row.worktree_id}, ${row.repository_id}, ${row.job_id},
          ${row.ticket_id}, ${row.status}, ${row.current_step}, ${row.completed_steps_json},
          ${row.summary}, ${row.validation}, ${row.commits_json}, ${row.branch_association_id},
          ${row.branch_name}, ${row.remote_name}, ${row.remote_ref}, ${row.remote_url},
          ${row.backup_branch_name}, ${row.target_status}, ${row.comment_id},
          ${row.pull_request_url}, ${row.created_at}, ${row.updated_at}, ${row.completed_at},
          ${row.last_error_json}
        )
        ON CONFLICT(handover_id) DO NOTHING
      `.pipe(Effect.mapError((cause) => mapSqlError("createHandover", cause)));
      return record;
    });

    const getHandover = Effect.fn("WorktreeStore.getHandover")(function* (
      handoverId: WorktreeHandoverId,
    ) {
      const rows = yield* sql<HandoverRow>`
        SELECT * FROM worktree_handovers WHERE handover_id = ${handoverId}
      `.pipe(Effect.mapError((cause) => mapSqlError("getHandover", cause)));
      const row = rows[0];
      if (row === undefined) {
        return yield* new WorktreeStoreError({
          message: `Handover not found: ${handoverId}`,
          operation: "getHandover",
        });
      }
      return rowToHandover(row);
    });

    const updateHandoverStep = Effect.fn("WorktreeStore.updateHandoverStep")(function* (input: {
      readonly backupBranchName?: string | undefined;
      readonly branchAssociationId?: BranchAssociationId | undefined;
      readonly branchName?: string | undefined;
      readonly commentId?: string | undefined;
      readonly commits?: ReadonlyArray<ObjectId> | undefined;
      readonly completedStep?: WorktreeHandoverStep | undefined;
      readonly currentStep?: WorktreeHandoverStep | undefined;
      readonly fencingToken?: number | undefined;
      readonly handoverId: WorktreeHandoverId;
      readonly lastError?: WorktreeLastError | undefined;
      readonly pullRequestUrl?: string | undefined;
      readonly remoteName?: string | undefined;
      readonly remoteRef?: string | undefined;
      readonly remoteUrl?: string | undefined;
      readonly status?: "in_progress" | "completed" | "failed" | undefined;
      readonly summary?: string | undefined;
      readonly targetStatus?: string | undefined;
      readonly validation?: string | undefined;
      readonly worktreeId: WorktreeId;
    }) {
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            if (input.fencingToken !== undefined) {
              yield* activeLeaseForUpdate(input.worktreeId, input.fencingToken);
            }
            const current = yield* getHandover(input.handoverId);
            const completedSteps =
              input.completedStep === undefined ||
              current.completedSteps.includes(input.completedStep)
                ? current.completedSteps
                : [...current.completedSteps, input.completedStep];
            const now = nowIso();
            const next = WorktreeHandoverRecord.make({
              ...current,
              completedSteps,
              updatedAt: now,
              ...(input.backupBranchName === undefined
                ? {}
                : { backupBranchName: input.backupBranchName }),
              ...(input.branchAssociationId === undefined
                ? {}
                : { branchAssociationId: input.branchAssociationId }),
              ...(input.branchName === undefined ? {} : { branchName: input.branchName }),
              ...(input.commentId === undefined ? {} : { commentId: input.commentId }),
              ...(input.commits === undefined ? {} : { commits: input.commits }),
              ...(input.currentStep === undefined ? {} : { currentStep: input.currentStep }),
              ...(input.lastError === undefined ? {} : { lastError: input.lastError }),
              ...(input.pullRequestUrl === undefined
                ? {}
                : { pullRequestUrl: input.pullRequestUrl }),
              ...(input.remoteName === undefined ? {} : { remoteName: input.remoteName }),
              ...(input.remoteRef === undefined ? {} : { remoteRef: input.remoteRef }),
              ...(input.remoteUrl === undefined ? {} : { remoteUrl: input.remoteUrl }),
              ...(input.status === undefined ? {} : { status: input.status }),
              ...(input.summary === undefined ? {} : { summary: input.summary }),
              ...(input.targetStatus === undefined ? {} : { targetStatus: input.targetStatus }),
              ...(input.validation === undefined ? {} : { validation: input.validation }),
              ...(input.status === "completed" ? { completedAt: now } : {}),
            });
            const row = handoverToRow(next);
            yield* sql`
            UPDATE worktree_handovers
            SET status = ${row.status}, current_step = ${row.current_step},
                completed_steps_json = ${row.completed_steps_json},
                summary = ${row.summary}, validation = ${row.validation},
                commits_json = ${row.commits_json},
                branch_association_id = ${row.branch_association_id},
                branch_name = ${row.branch_name},
                remote_name = ${row.remote_name}, remote_ref = ${row.remote_ref},
                remote_url = ${row.remote_url},
                backup_branch_name = ${row.backup_branch_name},
                target_status = ${row.target_status},
                comment_id = ${row.comment_id},
                pull_request_url = ${row.pull_request_url},
                updated_at = ${row.updated_at}, completed_at = ${row.completed_at},
                last_error_json = ${row.last_error_json}
            WHERE handover_id = ${row.handover_id}
          `.pipe(Effect.mapError((cause) => mapSqlError("updateHandoverStep", cause)));
            return next;
          }),
        )
        .pipe(mapTransactionError("updateHandoverStep.transaction"));
    });

    return WorktreeStore.of({
      acquireLease,
      createBranchAssociation,
      createHandover,
      createSetupRun,
      createWorktreeRecord,
      findBranchAssociationByBranch,
      findByJob,
      get,
      heartbeatLease,
      listActive,
      listStaleLeases,
      publishBranchAssociation,
      recordSetupResult,
      releaseLease,
      transitionWithEvent,
      updateHandoverStep,
      updateSetupRun,
    });
  }),
);

export const worktreeStoreMigrations = {
  "0001_create_worktree_tables": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
      CREATE TABLE IF NOT EXISTS worktree_records (
        worktree_id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        repository_path TEXT NOT NULL,
        git_dir TEXT NOT NULL,
        common_git_dir TEXT NOT NULL,
        job_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        storage_root TEXT NOT NULL,
        base_ref TEXT NOT NULL,
        base_sha TEXT NOT NULL,
        ready_sha TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        setup_profile_id TEXT,
        setup_run_id TEXT,
        setup_dirty_policy TEXT NOT NULL,
        setup_artifact_paths_json TEXT,
        setup_generated_changes_summary TEXT,
        agent_run_id TEXT,
        ticket_id TEXT,
        ticket_slug_source TEXT,
        ticket_type TEXT,
        desired_branch_name TEXT,
        branch_association_id TEXT,
        remote_name TEXT,
        remote_branch_ref TEXT,
        retention_json TEXT,
        cleanup_policy TEXT NOT NULL,
        last_error_json TEXT,
        last_reconciled_at TEXT
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS worktree_leases (
        lease_id TEXT PRIMARY KEY,
        worktree_id TEXT NOT NULL,
        repository_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        fencing_token INTEGER NOT NULL,
        acquired_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        heartbeat_deadline TEXT NOT NULL,
        released_at TEXT,
        status TEXT NOT NULL,
        FOREIGN KEY(worktree_id) REFERENCES worktree_records(worktree_id)
      )
    `;
    yield* sql`
      CREATE UNIQUE INDEX IF NOT EXISTS worktree_leases_one_active
      ON worktree_leases(worktree_id)
      WHERE status = 'active'
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS branch_associations (
        branch_association_id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        ticket_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        worktree_id TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        branch_ref TEXT NOT NULL,
        base_sha TEXT NOT NULL,
        head_sha TEXT NOT NULL,
        remote_name TEXT,
        remote_ref TEXT,
        pushed_at TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        handover_id TEXT,
        FOREIGN KEY(worktree_id) REFERENCES worktree_records(worktree_id)
      )
    `;
    yield* sql`
      CREATE INDEX IF NOT EXISTS branch_associations_by_branch
      ON branch_associations(repository_id, branch_name)
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS worktree_setup_runs (
        setup_run_id TEXT PRIMARY KEY,
        worktree_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        commands_json TEXT NOT NULL,
        redacted_environment_json TEXT,
        output_summary TEXT,
        artifact_paths_json TEXT,
        ready_sha TEXT,
        dirty_policy TEXT NOT NULL,
        generated_changes_summary TEXT,
        last_error_json TEXT,
        FOREIGN KEY(worktree_id) REFERENCES worktree_records(worktree_id)
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS worktree_handovers (
        handover_id TEXT PRIMARY KEY,
        worktree_id TEXT NOT NULL,
        repository_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        ticket_id TEXT,
        status TEXT NOT NULL,
        current_step TEXT,
        completed_steps_json TEXT NOT NULL,
        summary TEXT,
        validation TEXT,
        commits_json TEXT NOT NULL,
        branch_association_id TEXT,
        branch_name TEXT,
        remote_name TEXT,
        remote_ref TEXT,
        remote_url TEXT,
        backup_branch_name TEXT,
        target_status TEXT,
        comment_id TEXT,
        pull_request_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        last_error_json TEXT,
        FOREIGN KEY(worktree_id) REFERENCES worktree_records(worktree_id)
      )
    `;
    yield* sql`
      CREATE TABLE IF NOT EXISTS worktree_lifecycle_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        worktree_id TEXT NOT NULL,
        repository_id TEXT NOT NULL,
        job_id TEXT,
        ticket_id TEXT,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        actor TEXT NOT NULL,
        dedupe_key TEXT,
        previous_status TEXT,
        next_status TEXT,
        payload_json TEXT,
        FOREIGN KEY(worktree_id) REFERENCES worktree_records(worktree_id)
      )
    `;
  }),
} satisfies Record<string, Effect.Effect<void, unknown, SqlClient.SqlClient>>;

export const makeWorktreeStoreSqliteLayer = (filename: string) =>
  WorktreeStoreSqliteLive.pipe(
    Layer.provide(
      makeSqliteLayer({
        filename,
        migrations: {
          loader: SqliteMigrator.fromRecord(worktreeStoreMigrations),
        },
        pragmas: ["PRAGMA journal_mode = WAL"],
      }),
    ),
  );

export const WorktreeStoreSqliteConfiguredLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* WorktreeConfig;
    return makeWorktreeStoreSqliteLayer(config.config.databasePath);
  }),
);
