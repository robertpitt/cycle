import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import {
  isConcurrencyCountingAgentWorkStatus,
  isTerminalAgentWorkStatus,
  type AgentBranchAssociation,
  type AgentProviderSessionBinding,
  type AgentWorkActivityRecord,
  type AgentWorkCheckpoint,
  type AgentWorkDelegate,
  type AgentWorkJob,
  type AgentWorkLease,
  type AgentWorkPauseScope,
  type AgentWorkPauseScopeName,
  type AgentWorkStatusHistoryRecord,
  type AgentWorktreeRecord,
  type LocalAgentWorkEvent,
  type LocalAgentWorkEventFilter,
  type LocalAgentWorkEventInput,
} from "./types.ts";
import {
  defaultGlobalAgentWorkSettings,
  defaultRepositoryAgentWorkSettings,
  type GlobalAgentWorkSettings,
  type RepositoryAgentWorkSettings,
} from "./settings.ts";

export type AgentWorkJobListFilter = {
  readonly repositoryId?: string;
  readonly ticketId?: string;
  readonly agentId?: string;
  readonly includeTerminal?: boolean;
};

export type AgentWorkRuntimeStore = {
  readonly appendEvent: (input: LocalAgentWorkEventInput) => Promise<LocalAgentWorkEvent>;
  readonly listEvents: (
    filter?: LocalAgentWorkEventFilter,
  ) => Promise<readonly LocalAgentWorkEvent[]>;

  readonly getJob: (jobId: string) => Promise<AgentWorkJob | undefined>;
  readonly upsertJob: (job: AgentWorkJob) => Promise<void>;
  readonly listJobs: (filter?: AgentWorkJobListFilter) => Promise<readonly AgentWorkJob[]>;
  readonly findNonTerminalJobByLogicalKey: (
    logicalJobKey: string,
  ) => Promise<AgentWorkJob | undefined>;
  readonly findNonTerminalJobByDedupeKey: (dedupeKey: string) => Promise<AgentWorkJob | undefined>;
  readonly countConcurrency: (filter?: {
    readonly repositoryId?: string;
    readonly agentId?: string;
  }) => Promise<number>;

  readonly appendStatusHistory: (record: AgentWorkStatusHistoryRecord) => Promise<void>;
  readonly listStatusHistory: (jobId: string) => Promise<readonly AgentWorkStatusHistoryRecord[]>;

  readonly getDelegate: (
    repositoryId: string,
    ticketId: string,
  ) => Promise<AgentWorkDelegate | undefined>;
  readonly upsertDelegate: (delegate: AgentWorkDelegate) => Promise<void>;
  readonly deleteDelegate: (repositoryId: string, ticketId: string) => Promise<void>;

  readonly getPauseScope: (
    scope: AgentWorkPauseScopeName,
  ) => Promise<AgentWorkPauseScope | undefined>;
  readonly upsertPauseScope: (scope: AgentWorkPauseScope) => Promise<void>;

  readonly getLease: (jobId: string) => Promise<AgentWorkLease | undefined>;
  readonly upsertLease: (lease: AgentWorkLease) => Promise<void>;
  readonly deleteLease: (jobId: string) => Promise<void>;
  readonly listLeases: () => Promise<readonly AgentWorkLease[]>;

  readonly appendCheckpoint: (checkpoint: AgentWorkCheckpoint) => Promise<void>;
  readonly listCheckpoints: (jobId: string) => Promise<readonly AgentWorkCheckpoint[]>;
  readonly latestCheckpoint: (jobId: string) => Promise<AgentWorkCheckpoint | undefined>;

  readonly upsertWorktree: (record: AgentWorktreeRecord) => Promise<void>;
  readonly getWorktree: (worktreeId: string) => Promise<AgentWorktreeRecord | undefined>;
  readonly upsertBranchAssociation: (record: AgentBranchAssociation) => Promise<void>;
  readonly getBranchAssociation: (
    branchAssociationId: string,
  ) => Promise<AgentBranchAssociation | undefined>;
  readonly upsertProviderSessionBinding: (binding: AgentProviderSessionBinding) => Promise<void>;
  readonly getProviderSessionBinding: (
    bindingId: string,
  ) => Promise<AgentProviderSessionBinding | undefined>;
  readonly appendActivity: (activity: AgentWorkActivityRecord) => Promise<void>;
  readonly listActivity: (afterSequence?: number) => Promise<readonly AgentWorkActivityRecord[]>;

  readonly getGlobalSettings: () => Promise<GlobalAgentWorkSettings>;
  readonly upsertGlobalSettings: (settings: GlobalAgentWorkSettings) => Promise<void>;
  readonly getRepositorySettings: (repositoryId: string) => Promise<RepositoryAgentWorkSettings>;
  readonly upsertRepositorySettings: (settings: RepositoryAgentWorkSettings) => Promise<void>;

  readonly close?: () => Promise<void> | void;
};

export const agentWorkRuntimeSchemaSql = `
CREATE TABLE IF NOT EXISTS local_agent_work_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  repository_id TEXT,
  job_id TEXT,
  occurred_at TEXT NOT NULL,
  dedupe_key TEXT,
  record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_agent_work_events_filter
  ON local_agent_work_events(sequence, event_type, repository_id, job_id);

CREATE TABLE IF NOT EXISTS local_agent_work_jobs (
  job_id TEXT PRIMARY KEY,
  logical_job_key TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_gate TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_agent_work_jobs_logical
  ON local_agent_work_jobs(logical_job_key, status);
CREATE INDEX IF NOT EXISTS idx_local_agent_work_jobs_dedupe
  ON local_agent_work_jobs(dedupe_key, status);
CREATE INDEX IF NOT EXISTS idx_local_agent_work_jobs_concurrency
  ON local_agent_work_jobs(status, repository_id, agent_id);

CREATE TABLE IF NOT EXISTS local_agent_work_status_history (
  history_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  to_status TEXT NOT NULL,
  record_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_agent_work_status_history_job
  ON local_agent_work_status_history(job_id, occurred_at);

CREATE TABLE IF NOT EXISTS local_agent_work_leases (
  job_id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  record_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_agent_work_records (
  kind TEXT NOT NULL,
  record_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record_json TEXT NOT NULL,
  PRIMARY KEY(kind, record_key)
);
`;

export const makeInMemoryAgentWorkStore = (): AgentWorkRuntimeStore => {
  let eventSequence = 0;
  let activitySequence = 0;
  const events = new Map<string, LocalAgentWorkEvent>();
  const jobs = new Map<string, AgentWorkJob>();
  const history = new Map<string, AgentWorkStatusHistoryRecord>();
  const delegates = new Map<string, AgentWorkDelegate>();
  const pauses = new Map<string, AgentWorkPauseScope>();
  const leases = new Map<string, AgentWorkLease>();
  const checkpoints = new Map<string, AgentWorkCheckpoint>();
  const worktrees = new Map<string, AgentWorktreeRecord>();
  const branches = new Map<string, AgentBranchAssociation>();
  const sessions = new Map<string, AgentProviderSessionBinding>();
  const activity = new Map<string, AgentWorkActivityRecord & { readonly sequence: number }>();
  let globalSettings = defaultGlobalAgentWorkSettings();
  const repositorySettings = new Map<string, RepositoryAgentWorkSettings>();

  return {
    appendActivity: async (record) => {
      activitySequence += 1;
      activity.set(record.activityId, { ...clone(record), sequence: activitySequence });
    },
    appendCheckpoint: async (checkpoint) => {
      checkpoints.set(checkpoint.checkpointId, clone(checkpoint));
    },
    appendEvent: async (input) => {
      if (input.eventId !== undefined) {
        const existing = events.get(input.eventId);
        if (existing !== undefined) return clone(existing);
      }

      eventSequence += 1;
      const event: LocalAgentWorkEvent = {
        ...input,
        eventId: input.eventId ?? randomId("evt"),
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        sequence: eventSequence,
      };
      events.set(event.eventId, clone(event));
      return clone(event);
    },
    appendStatusHistory: async (record) => {
      history.set(record.historyId, clone(record));
    },
    close: async () => {},
    countConcurrency: async (filter) =>
      [...jobs.values()].filter(
        (job) =>
          isConcurrencyCountingAgentWorkStatus(job.status) &&
          (filter?.repositoryId === undefined || job.repositoryId === filter.repositoryId) &&
          (filter?.agentId === undefined || job.agentId === filter.agentId),
      ).length,
    deleteDelegate: async (repositoryId, ticketId) => {
      delegates.delete(delegateKey(repositoryId, ticketId));
    },
    deleteLease: async (jobId) => {
      leases.delete(jobId);
    },
    findNonTerminalJobByDedupeKey: async (dedupeKey) =>
      clone(
        [...jobs.values()].find(
          (job) => job.dedupeKey === dedupeKey && !isTerminalAgentWorkStatus(job.status),
        ),
      ),
    findNonTerminalJobByLogicalKey: async (logicalJobKey) =>
      clone(
        [...jobs.values()].find(
          (job) => job.logicalJobKey === logicalJobKey && !isTerminalAgentWorkStatus(job.status),
        ),
      ),
    getBranchAssociation: async (branchAssociationId) => clone(branches.get(branchAssociationId)),
    getDelegate: async (repositoryId, ticketId) =>
      clone(delegates.get(delegateKey(repositoryId, ticketId))),
    getGlobalSettings: async () => clone(globalSettings),
    getJob: async (jobId) => clone(jobs.get(jobId)),
    getLease: async (jobId) => clone(leases.get(jobId)),
    getPauseScope: async (scope) => clone(pauses.get(scope)),
    getProviderSessionBinding: async (bindingId) => clone(sessions.get(bindingId)),
    getRepositorySettings: async (repositoryId) =>
      clone(
        repositorySettings.get(repositoryId) ?? defaultRepositoryAgentWorkSettings(repositoryId),
      ),
    getWorktree: async (worktreeId) => clone(worktrees.get(worktreeId)),
    latestCheckpoint: async (jobId) =>
      clone(
        [...checkpoints.values()]
          .filter((checkpoint) => checkpoint.jobId === jobId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0],
      ),
    listActivity: async (afterSequence = 0) =>
      [...activity.values()]
        .filter((record) => record.sequence > afterSequence)
        .sort((left, right) => left.sequence - right.sequence)
        .map(({ sequence: _sequence, ...record }) => clone(record)),
    listCheckpoints: async (jobId) =>
      [...checkpoints.values()]
        .filter((checkpoint) => checkpoint.jobId === jobId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((checkpoint) => clone(checkpoint)),
    listEvents: async (filter) =>
      [...events.values()]
        .filter((event) => eventMatchesFilter(event, filter))
        .sort((left, right) => left.sequence - right.sequence)
        .map((event) => clone(event)),
    listJobs: async (filter) =>
      [...jobs.values()]
        .filter((job) => jobMatchesFilter(job, filter))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((job) => clone(job)),
    listLeases: async () => [...leases.values()].map((lease) => clone(lease)),
    listStatusHistory: async (jobId) =>
      [...history.values()]
        .filter((record) => record.jobId === jobId)
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
        .map((record) => clone(record)),
    upsertBranchAssociation: async (record) => {
      branches.set(record.branchAssociationId, clone(record));
    },
    upsertDelegate: async (delegate) => {
      delegates.set(delegateKey(delegate.repositoryId, delegate.ticketId), clone(delegate));
    },
    upsertGlobalSettings: async (settings) => {
      globalSettings = clone(settings);
    },
    upsertJob: async (job) => {
      jobs.set(job.jobId, clone(job));
    },
    upsertLease: async (lease) => {
      leases.set(lease.jobId, clone(lease));
    },
    upsertPauseScope: async (scope) => {
      pauses.set(scope.scope, clone(scope));
    },
    upsertProviderSessionBinding: async (binding) => {
      sessions.set(binding.bindingId, clone(binding));
    },
    upsertRepositorySettings: async (settings) => {
      repositorySettings.set(settings.repositoryId, clone(settings));
    },
    upsertWorktree: async (record) => {
      worktrees.set(record.worktreeId, clone(record));
    },
  };
};

export const makeNodeSqliteAgentWorkStore = (path: string): AgentWorkRuntimeStore => {
  mkdirSync(dirname(path), { recursive: true });
  const require = createRequire(import.meta.url);
  const { DatabaseSync: SqliteDatabaseSync } = require("node:sqlite") as {
    readonly DatabaseSync: new (databasePath: string) => SqliteDatabaseLike;
  };
  const db = new SqliteDatabaseSync(path);
  return makeSqliteAgentWorkStore(db);
};

export type SqliteStatementLike = {
  readonly all: (...args: readonly unknown[]) => readonly unknown[];
  readonly get: (...args: readonly unknown[]) => unknown;
  readonly run: (...args: readonly unknown[]) => unknown;
};

export type SqliteDatabaseLike = {
  readonly exec: (sql: string) => unknown;
  readonly prepare: (sql: string) => SqliteStatementLike;
  readonly close?: () => unknown;
};

export const makeSqliteAgentWorkStore = (db: SqliteDatabaseLike): AgentWorkRuntimeStore => {
  db.exec(agentWorkRuntimeSchemaSql);

  const upsertRecord = (kind: string, key: string, value: unknown, updatedAt: string): void => {
    db.prepare(
      `INSERT INTO local_agent_work_records(kind, record_key, updated_at, record_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(kind, record_key) DO UPDATE SET
         updated_at = excluded.updated_at,
         record_json = excluded.record_json`,
    ).run(kind, key, updatedAt, JSON.stringify(value));
  };

  const getRecord = <T>(kind: string, key: string): T | undefined => {
    const row = db
      .prepare("SELECT record_json FROM local_agent_work_records WHERE kind = ? AND record_key = ?")
      .get(kind, key) as RecordRow | undefined;
    return row === undefined ? undefined : parseJson<T>(row.record_json);
  };

  return {
    appendActivity: async (record) => {
      upsertRecord("activity", record.activityId, record, record.occurredAt);
    },
    appendCheckpoint: async (checkpoint) => {
      upsertRecord("checkpoint", checkpoint.checkpointId, checkpoint, checkpoint.createdAt);
    },
    appendEvent: async (input) => {
      const eventId = input.eventId ?? randomId("evt");
      const existing = db
        .prepare("SELECT record_json FROM local_agent_work_events WHERE event_id = ?")
        .get(eventId) as RecordRow | undefined;
      if (existing !== undefined) return parseJson<LocalAgentWorkEvent>(existing.record_json);

      const eventWithoutSequence = {
        ...input,
        eventId,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
      };
      const result = db
        .prepare(
          `INSERT INTO local_agent_work_events(
             event_id, event_type, repository_id, job_id, occurred_at, dedupe_key, record_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          eventWithoutSequence.eventId,
          eventWithoutSequence.eventType,
          eventWithoutSequence.repositoryId ?? null,
          eventWithoutSequence.jobId ?? null,
          eventWithoutSequence.occurredAt,
          eventWithoutSequence.dedupeKey ?? null,
          JSON.stringify({ ...eventWithoutSequence, sequence: 0 }),
        ) as { readonly lastInsertRowid?: bigint | number };
      const sequence = Number(result.lastInsertRowid ?? 0);
      const event: LocalAgentWorkEvent = { ...eventWithoutSequence, sequence };
      db.prepare("UPDATE local_agent_work_events SET record_json = ? WHERE sequence = ?").run(
        JSON.stringify(event),
        sequence,
      );
      return event;
    },
    appendStatusHistory: async (record) => {
      db.prepare(
        `INSERT OR REPLACE INTO local_agent_work_status_history(
           history_id, job_id, occurred_at, to_status, record_json
         ) VALUES (?, ?, ?, ?, ?)`,
      ).run(
        record.historyId,
        record.jobId,
        record.occurredAt,
        record.toStatus,
        JSON.stringify(record),
      );
    },
    close: async () => {
      db.close?.();
    },
    countConcurrency: async (filter) => {
      const jobs = await listJobsFromSqlite(db, filter);
      return jobs.filter((job) => isConcurrencyCountingAgentWorkStatus(job.status)).length;
    },
    deleteDelegate: async (repositoryId, ticketId) => {
      db.prepare(
        "DELETE FROM local_agent_work_records WHERE kind = 'delegate' AND record_key = ?",
      ).run(delegateKey(repositoryId, ticketId));
    },
    deleteLease: async (jobId) => {
      db.prepare("DELETE FROM local_agent_work_leases WHERE job_id = ?").run(jobId);
    },
    findNonTerminalJobByDedupeKey: async (dedupeKey) =>
      findNonTerminalSqliteJob(db, "dedupe_key = ?", dedupeKey),
    findNonTerminalJobByLogicalKey: async (logicalJobKey) =>
      findNonTerminalSqliteJob(db, "logical_job_key = ?", logicalJobKey),
    getBranchAssociation: async (branchAssociationId) =>
      getRecord<AgentBranchAssociation>("branch", branchAssociationId),
    getDelegate: async (repositoryId, ticketId) =>
      getRecord<AgentWorkDelegate>("delegate", delegateKey(repositoryId, ticketId)),
    getGlobalSettings: async () =>
      getRecord<GlobalAgentWorkSettings>("settings", "global") ?? defaultGlobalAgentWorkSettings(),
    getJob: async (jobId) => {
      const row = db
        .prepare("SELECT record_json FROM local_agent_work_jobs WHERE job_id = ?")
        .get(jobId) as RecordRow | undefined;
      return row === undefined ? undefined : parseJson<AgentWorkJob>(row.record_json);
    },
    getLease: async (jobId) => {
      const row = db
        .prepare("SELECT record_json FROM local_agent_work_leases WHERE job_id = ?")
        .get(jobId) as RecordRow | undefined;
      return row === undefined ? undefined : parseJson<AgentWorkLease>(row.record_json);
    },
    getPauseScope: async (scope) => getRecord<AgentWorkPauseScope>("pause", scope),
    getProviderSessionBinding: async (bindingId) =>
      getRecord<AgentProviderSessionBinding>("provider-session", bindingId),
    getRepositorySettings: async (repositoryId) =>
      getRecord<RepositoryAgentWorkSettings>("repository-settings", repositoryId) ??
      defaultRepositoryAgentWorkSettings(repositoryId),
    getWorktree: async (worktreeId) => getRecord<AgentWorktreeRecord>("worktree", worktreeId),
    latestCheckpoint: async (jobId) => {
      const rows = db
        .prepare(
          `SELECT record_json
           FROM local_agent_work_records
           WHERE kind = 'checkpoint'
           ORDER BY updated_at DESC`,
        )
        .all() as readonly RecordRow[];
      return rows
        .map((row) => parseJson<AgentWorkCheckpoint>(row.record_json))
        .find((item) => item.jobId === jobId);
    },
    listActivity: async (afterSequence = 0) => {
      const rows = db
        .prepare(
          `SELECT record_json
           FROM local_agent_work_records
           WHERE kind = 'activity'
           ORDER BY updated_at ASC`,
        )
        .all() as readonly RecordRow[];
      return rows
        .map((row) => parseJson<AgentWorkActivityRecord>(row.record_json))
        .slice(afterSequence);
    },
    listCheckpoints: async (jobId) => {
      const rows = db
        .prepare(
          `SELECT record_json
           FROM local_agent_work_records
           WHERE kind = 'checkpoint'
           ORDER BY updated_at ASC`,
        )
        .all() as readonly RecordRow[];
      return rows
        .map((row) => parseJson<AgentWorkCheckpoint>(row.record_json))
        .filter((checkpoint) => checkpoint.jobId === jobId);
    },
    listEvents: async (filter) => {
      const rows = db
        .prepare("SELECT record_json FROM local_agent_work_events ORDER BY sequence ASC")
        .all() as readonly RecordRow[];
      return rows
        .map((row) => parseJson<LocalAgentWorkEvent>(row.record_json))
        .filter((event) => eventMatchesFilter(event, filter));
    },
    listJobs: async (filter) => listJobsFromSqlite(db, filter),
    listLeases: async () => {
      const rows = db
        .prepare("SELECT record_json FROM local_agent_work_leases ORDER BY heartbeat_at ASC")
        .all() as readonly RecordRow[];
      return rows.map((row) => parseJson<AgentWorkLease>(row.record_json));
    },
    listStatusHistory: async (jobId) => {
      const rows = db
        .prepare(
          `SELECT record_json
           FROM local_agent_work_status_history
           WHERE job_id = ?
           ORDER BY occurred_at ASC`,
        )
        .all(jobId) as readonly RecordRow[];
      return rows.map((row) => parseJson<AgentWorkStatusHistoryRecord>(row.record_json));
    },
    upsertBranchAssociation: async (record) => {
      upsertRecord("branch", record.branchAssociationId, record, record.updatedAt);
    },
    upsertDelegate: async (delegate) => {
      upsertRecord(
        "delegate",
        delegateKey(delegate.repositoryId, delegate.ticketId),
        delegate,
        delegate.updatedAt,
      );
    },
    upsertGlobalSettings: async (settings) => {
      upsertRecord("settings", "global", settings, new Date().toISOString());
    },
    upsertJob: async (job) => {
      db.prepare(
        `INSERT INTO local_agent_work_jobs(
           job_id, logical_job_key, dedupe_key, repository_id, ticket_id, agent_id, provider_id,
           status, current_gate, created_at, updated_at, record_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           logical_job_key = excluded.logical_job_key,
           dedupe_key = excluded.dedupe_key,
           repository_id = excluded.repository_id,
           ticket_id = excluded.ticket_id,
           agent_id = excluded.agent_id,
           provider_id = excluded.provider_id,
           status = excluded.status,
           current_gate = excluded.current_gate,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           record_json = excluded.record_json`,
      ).run(
        job.jobId,
        job.logicalJobKey,
        job.dedupeKey,
        job.repositoryId,
        job.ticketId,
        job.agentId,
        job.providerId,
        job.status,
        job.currentGate,
        job.createdAt,
        job.updatedAt,
        JSON.stringify(job),
      );
    },
    upsertLease: async (lease) => {
      db.prepare(
        `INSERT INTO local_agent_work_leases(job_id, lease_id, owner_id, expires_at, heartbeat_at, record_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           lease_id = excluded.lease_id,
           owner_id = excluded.owner_id,
           expires_at = excluded.expires_at,
           heartbeat_at = excluded.heartbeat_at,
           record_json = excluded.record_json`,
      ).run(
        lease.jobId,
        lease.leaseId,
        lease.ownerId,
        lease.expiresAt,
        lease.heartbeatAt,
        JSON.stringify(lease),
      );
    },
    upsertPauseScope: async (scope) => {
      upsertRecord("pause", scope.scope, scope, scope.updatedAt);
    },
    upsertProviderSessionBinding: async (binding) => {
      upsertRecord("provider-session", binding.bindingId, binding, binding.updatedAt);
    },
    upsertRepositorySettings: async (settings) => {
      upsertRecord("repository-settings", settings.repositoryId, settings, settings.updatedAt);
    },
    upsertWorktree: async (record) => {
      upsertRecord("worktree", record.worktreeId, record, record.updatedAt);
    },
  };
};

type RecordRow = {
  readonly record_json: string;
};

const listJobsFromSqlite = async (
  db: SqliteDatabaseLike,
  filter?: AgentWorkJobListFilter | { readonly repositoryId?: string; readonly agentId?: string },
): Promise<readonly AgentWorkJob[]> => {
  const rows = db
    .prepare("SELECT record_json FROM local_agent_work_jobs ORDER BY created_at ASC")
    .all() as readonly RecordRow[];
  return rows
    .map((row) => parseJson<AgentWorkJob>(row.record_json))
    .filter((job) => jobMatchesFilter(job, filter));
};

const findNonTerminalSqliteJob = async (
  db: SqliteDatabaseLike,
  where: string,
  value: string,
): Promise<AgentWorkJob | undefined> => {
  const rows = db
    .prepare(`SELECT record_json FROM local_agent_work_jobs WHERE ${where}`)
    .all(value) as readonly RecordRow[];
  return rows
    .map((row) => parseJson<AgentWorkJob>(row.record_json))
    .find((job) => !isTerminalAgentWorkStatus(job.status));
};

const eventMatchesFilter = (
  event: LocalAgentWorkEvent,
  filter: LocalAgentWorkEventFilter | undefined,
): boolean =>
  (filter?.afterSequence === undefined || event.sequence > filter.afterSequence) &&
  (filter?.eventTypes === undefined || filter.eventTypes.includes(event.eventType)) &&
  (filter?.repositoryId === undefined || event.repositoryId === filter.repositoryId) &&
  (filter?.jobId === undefined || event.jobId === filter.jobId);

const jobMatchesFilter = (
  job: AgentWorkJob,
  filter:
    | AgentWorkJobListFilter
    | { readonly repositoryId?: string; readonly agentId?: string }
    | undefined,
): boolean =>
  (filter?.repositoryId === undefined || job.repositoryId === filter.repositoryId) &&
  (!("ticketId" in (filter ?? {})) ||
    (filter as AgentWorkJobListFilter).ticketId === undefined ||
    job.ticketId === (filter as AgentWorkJobListFilter).ticketId) &&
  (filter?.agentId === undefined || job.agentId === filter.agentId) &&
  (!("includeTerminal" in (filter ?? {})) ||
    (filter as AgentWorkJobListFilter).includeTerminal === true ||
    !isTerminalAgentWorkStatus(job.status));

const delegateKey = (repositoryId: string, ticketId: string): string =>
  `${repositoryId}\u0000${ticketId}`;

const parseJson = <T>(text: string): T => JSON.parse(text) as T;

function clone<T>(value: T): T;
function clone<T>(value: T | undefined): T | undefined;
function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as T);
}

const randomId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
