import { defaultAgentCapabilities } from "@cycle/agents/providers";
import type { AgentCapabilities, AgentProviderId } from "@cycle/agents/types";
import { makeLocalEventHub, type LocalEventHub } from "./eventHub.ts";
import type { AgentWorkJobListFilter, AgentWorkRuntimeStore } from "./store.ts";
import {
  defaultGlobalAgentWorkSettings,
  defaultRepositoryAgentWorkSettings,
  validateGlobalAgentWorkSettings,
  validateRepositoryAgentWorkSettings,
  type GlobalAgentWorkSettings,
  type RepositoryAgentWorkSettings,
} from "./settings.ts";
import {
  isConcurrencyCountingAgentWorkStatus,
  isTerminalAgentWorkStatus,
  type AgentProviderSessionBinding,
  type AgentBranchAssociation,
  type AgentWorkActivityRecord,
  type AgentWorkAuthorityMode,
  type AgentWorkCheckpoint,
  type AgentWorkDelegate,
  type AgentWorkError,
  type AgentWorkGate,
  type AgentWorkJob,
  type AgentWorkJobStatus,
  type AgentWorkJsonObject,
  type AgentWorkLease,
  type AgentWorkPauseScope,
  type AgentWorkPauseScopeName,
  type AgentWorkProviderRecord,
  type AgentWorkStatusHistoryRecord,
  type AgentWorkTrigger,
  type AgentWorktreeRecord,
} from "./types.ts";

export type StartAgentWorkJobInput = {
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly trigger: AgentWorkTrigger;
  readonly agentId: string;
  readonly providerId?: AgentProviderId;
  readonly model?: string;
  readonly authorityMode: AgentWorkAuthorityMode;
  readonly requestedBy: string;
  readonly logicalJobKey?: string;
  readonly dedupeKey?: string;
  readonly assignmentVersion?: number;
  readonly commentId?: string;
  readonly branchAssociationId?: string;
  readonly ticketStatus?: string;
  readonly metadata?: AgentWorkJsonObject;
};

export type AgentWorkRuntimeAgentRecord = {
  readonly agentId: string;
  readonly enabled: boolean;
  readonly providerId: AgentProviderId;
  readonly model?: string;
};

export type AgentWorkRuntimeOptions = {
  readonly store: AgentWorkRuntimeStore;
  readonly eventHub?: LocalEventHub;
  readonly executionPolicy?: AgentWorkExecutionPolicy;
  readonly ownerId?: string;
  readonly providers?: readonly AgentWorkProviderRecord[];
  readonly agents?: readonly AgentWorkRuntimeAgentRecord[];
  readonly mcpAvailable?: boolean;
  readonly leaseDurationMs?: number;
  readonly staleLeaseMs?: number;
  readonly now?: () => Date;
};

export type AgentWorkExecutionPolicy = {
  readonly supportedAuthorityModes: readonly AgentWorkAuthorityMode[];
};

export type AgentWorkRuntime = {
  readonly eventHub: LocalEventHub;
  readonly store: AgentWorkRuntimeStore;
  readonly startJob: (input: StartAgentWorkJobInput) => Promise<AgentWorkJob>;
  readonly listJobs: (filter?: AgentWorkJobListFilter) => Promise<readonly AgentWorkJob[]>;
  readonly getJob: (jobId: string) => Promise<AgentWorkJob | undefined>;
  readonly evaluateJob: (jobId: string) => Promise<AgentWorkJob | undefined>;
  readonly pauseScope: (
    scope: AgentWorkPauseScopeName,
    input?: { readonly actor?: string; readonly reason?: string },
  ) => Promise<AgentWorkPauseScope>;
  readonly resumeScope: (
    scope: AgentWorkPauseScopeName,
    input?: { readonly actor?: string; readonly reason?: string },
  ) => Promise<AgentWorkPauseScope>;
  readonly resumeJob: (jobId: string, actor?: string) => Promise<AgentWorkJob | undefined>;
  readonly cancelJob: (jobId: string, actor?: string) => Promise<AgentWorkJob | undefined>;
  readonly recordCheckpoint: (
    jobId: string,
    input: {
      readonly step: string;
      readonly retrySafe: boolean;
      readonly payload?: AgentWorkJsonObject;
    },
  ) => Promise<AgentWorkCheckpoint | undefined>;
  readonly completeJob: (
    jobId: string,
    input?: {
      readonly actor?: string;
      readonly metadata?: AgentWorkJsonObject;
      readonly reason?: string;
    },
  ) => Promise<AgentWorkJob | undefined>;
  readonly markJobWaitingForInput: (
    jobId: string,
    input: {
      readonly actor?: string;
      readonly error?: AgentWorkError;
      readonly metadata?: AgentWorkJsonObject;
      readonly reason?: string;
    },
  ) => Promise<AgentWorkJob | undefined>;
  readonly recordActivity: (
    activity: Omit<AgentWorkActivityRecord, "activityId" | "occurredAt">,
  ) => Promise<void>;
  readonly recordProviderSessionBinding: (binding: AgentProviderSessionBinding) => Promise<void>;
  readonly acquireLease: (jobId: string, ownerId?: string) => Promise<AgentWorkLease | undefined>;
  readonly heartbeatLease: (jobId: string, ownerId?: string) => Promise<AgentWorkLease | undefined>;
  readonly releaseLease: (jobId: string, ownerId?: string) => Promise<boolean>;
  readonly reconcileStaleJobs: () => Promise<readonly AgentWorkJob[]>;
  readonly recordJobFailure: (
    jobId: string,
    error: AgentWorkError,
    input?: { readonly retrySafe?: boolean; readonly actor?: string },
  ) => Promise<AgentWorkJob | undefined>;
  readonly attachWorktree: (worktree: AgentWorktreeRecord) => Promise<AgentWorkJob | undefined>;
  readonly attachBranchAssociation: (
    association: AgentBranchAssociation,
  ) => Promise<AgentWorkJob | undefined>;
  readonly putDelegate: (delegate: AgentWorkDelegate) => Promise<void>;
  readonly removeDelegate: (
    repositoryId: string,
    ticketId: string,
    actor?: string,
  ) => Promise<void>;
  readonly getGlobalSettings: () => Promise<GlobalAgentWorkSettings>;
  readonly updateGlobalSettings: (
    settings: Partial<GlobalAgentWorkSettings>,
    actor?: string,
  ) => Promise<GlobalAgentWorkSettings>;
  readonly getRepositorySettings: (repositoryId: string) => Promise<RepositoryAgentWorkSettings>;
  readonly updateRepositorySettings: (
    repositoryId: string,
    settings: Partial<Omit<RepositoryAgentWorkSettings, "repositoryId">>,
    actor?: string,
  ) => Promise<RepositoryAgentWorkSettings>;
};

export const makeAgentWorkRuntime = (options: AgentWorkRuntimeOptions): AgentWorkRuntime => {
  const store = options.store;
  const eventHub = options.eventHub ?? makeLocalEventHub(store);
  const ownerId = options.ownerId ?? "local-scheduler";
  const leaseDurationMs = options.leaseDurationMs ?? 60_000;
  const staleLeaseMs = options.staleLeaseMs ?? leaseDurationMs;
  const now = (): Date => options.now?.() ?? new Date();
  const providers = new Map<AgentProviderId, AgentWorkProviderRecord>(
    (options.providers ?? [defaultCodexProvider()]).map((provider) => [
      provider.providerId,
      provider,
    ]),
  );
  const executionPolicy = normalizeExecutionPolicy(options.executionPolicy);
  const agents = new Map<string, AgentWorkRuntimeAgentRecord>(
    (options.agents ?? [{ agentId: "codex", enabled: true, providerId: "codex" }]).map((agent) => [
      agent.agentId,
      agent,
    ]),
  );
  const mcpAvailable = options.mcpAvailable ?? true;

  const runtime: AgentWorkRuntime = {
    acquireLease: async (jobId, requestedOwnerId = ownerId) =>
      acquireLease(jobId, requestedOwnerId),
    attachBranchAssociation: async (association) => {
      const job = await store.getJob(association.jobId);
      if (job === undefined) return undefined;

      await store.upsertBranchAssociation(association);
      const updated = {
        ...job,
        branchAssociationId: association.branchAssociationId,
        metadata: {
          ...job.metadata,
          branchAssociationId: association.branchAssociationId,
          branchName: association.branchName,
          branchRef: association.branchRef,
          ...(association.baseSha === undefined ? {} : { baseSha: association.baseSha }),
          ...(association.headSha === undefined ? {} : { commitSha: association.headSha }),
        },
        updatedAt: nowIso(now),
      };
      await store.upsertJob(updated);
      await eventHub.append({
        actor: "workflow",
        dedupeKey: `branch:${association.branchAssociationId}:${association.updatedAt}`,
        eventType: "git.branch_updated",
        eventVersion: 1,
        jobId: job.jobId,
        payload: {
          branchAssociationId: association.branchAssociationId,
          branchName: association.branchName,
          branchRef: association.branchRef,
          headSha: association.headSha ?? null,
          status: association.status,
        },
        repositoryId: job.repositoryId,
        source: "workflow",
        ticketId: job.ticketId,
      });
      return updated;
    },
    attachWorktree: async (worktree) => {
      const job = await store.getJob(worktree.jobId);
      if (job === undefined) return undefined;

      await store.upsertWorktree(worktree);
      const updated = {
        ...job,
        metadata: {
          ...job.metadata,
          worktreePath: worktree.path,
          ...(worktree.baseRef === undefined ? {} : { baseRef: worktree.baseRef }),
          ...(worktree.baseSha === undefined ? {} : { baseSha: worktree.baseSha }),
          ...(worktree.branchName === undefined ? {} : { branchName: worktree.branchName }),
          ...(worktree.branchRef === undefined ? {} : { branchRef: worktree.branchRef }),
          worktreeStatus: worktree.status,
        },
        updatedAt: nowIso(now),
        worktreeId: worktree.worktreeId,
      };
      await store.upsertJob(updated);
      await eventHub.append({
        actor: "workflow",
        dedupeKey: `worktree:${worktree.worktreeId}:${worktree.updatedAt}`,
        eventType: "local.worktree_created",
        eventVersion: 1,
        jobId: job.jobId,
        payload: {
          branchName: worktree.branchName ?? null,
          path: worktree.path,
          status: worktree.status,
          worktreeId: worktree.worktreeId,
        },
        repositoryId: job.repositoryId,
        source: "workflow",
        ticketId: job.ticketId,
      });
      return updated;
    },
    cancelJob: async (jobId, actor = "user") => {
      const job = await store.getJob(jobId);
      if (job === undefined) return undefined;
      if (job.status === "cancelled") return job;
      if (job.status === "completed" || job.status === "failed") return job;

      if (job.status === "queued" || job.status === "retry-wait" || job.status === "suspended") {
        return transitionJob(job, "cancelled", {
          actor,
          completedAt: nowIso(now),
          error: {
            code: "cancellation-requested",
            message: "Job was cancelled before execution completed.",
          },
          reason: "cancelled",
        });
      }

      const cancelling = await transitionJob(job, "cancelling", {
        actor,
        error: {
          code: "cancellation-requested",
          message: "Cancellation requested; provider abort will run when supported.",
        },
        reason: "cancellation requested",
      });
      await releaseLease(cancelling.jobId, ownerId, true);
      return transitionJob(cancelling, "cancelled", {
        actor,
        completedAt: nowIso(now),
        reason: "cancelled at safe checkpoint",
      });
    },
    completeJob: async (jobId, input) => {
      const job = await store.getJob(jobId);
      if (job === undefined || isTerminalAgentWorkStatus(job.status)) return job;

      await releaseLease(job.jobId, ownerId, true);
      return transitionJob(job, "completed", {
        actor: input?.actor ?? "workflow",
        completedAt: nowIso(now),
        currentGate: null,
        metadata: input?.metadata ?? job.metadata,
        reason: input?.reason ?? "job completed",
      });
    },
    eventHub,
    store,
    evaluateJob: async (jobId) => {
      const job = await store.getJob(jobId);
      if (job === undefined || isTerminalAgentWorkStatus(job.status)) return job;

      if (!isStartableStatus(job.status)) return job;

      const gate = await evaluateGates(job);
      if (gate !== null) {
        const blocked: AgentWorkJob = { ...job, currentGate: gate, updatedAt: nowIso(now) };
        await store.upsertJob(blocked);
        return blocked;
      }

      const startingStatus: AgentWorkJobStatus =
        job.status === "suspended" ? "resuming" : "starting";
      const starting = await transitionJob(job, startingStatus, {
        actor: "scheduler",
        currentGate: null,
        reason: "scheduler gates passed",
        startedAt: job.startedAt ?? nowIso(now),
      });
      const lease = await acquireLease(starting.jobId, ownerId);
      if (lease === undefined) {
        const blocked: AgentWorkJob = {
          ...starting,
          currentGate: "stale-lease",
          updatedAt: nowIso(now),
        };
        await store.upsertJob(blocked);
        return blocked;
      }

      return transitionJob(starting, "running", {
        actor: "scheduler",
        currentGate: null,
        lastHeartbeatAt: lease.heartbeatAt,
        reason: "lease acquired",
      });
    },
    getGlobalSettings: () => store.getGlobalSettings(),
    getJob: (jobId) => store.getJob(jobId),
    getRepositorySettings: (repositoryId) => store.getRepositorySettings(repositoryId),
    heartbeatLease: async (jobId, requestedOwnerId = ownerId) => {
      const lease = await store.getLease(jobId);
      if (lease === undefined || lease.ownerId !== requestedOwnerId) return undefined;
      const heartbeatAt = nowIso(now);
      const updated: AgentWorkLease = {
        ...lease,
        expiresAt: new Date(now().getTime() + leaseDurationMs).toISOString(),
        heartbeatAt,
      };
      await store.upsertLease(updated);
      const job = await store.getJob(jobId);
      if (job !== undefined) {
        await store.upsertJob({ ...job, lastHeartbeatAt: heartbeatAt, updatedAt: heartbeatAt });
      }
      return updated;
    },
    listJobs: (filter) => store.listJobs(filter),
    pauseScope: async (scope, input) => {
      const record: AgentWorkPauseScope = {
        paused: true,
        reason: input?.reason,
        scope,
        updatedAt: nowIso(now),
        updatedBy: input?.actor ?? "user",
      };
      await store.upsertPauseScope(record);
      await eventHub.append({
        actor: record.updatedBy,
        eventType: "local.agent_pause_changed",
        eventVersion: 1,
        payload: { paused: true, reason: record.reason ?? null, scope },
        source: "api",
      });

      const jobs = await store.listJobs({ includeTerminal: false });
      for (const job of jobs.filter((candidate) => pauseApplies(scope, candidate.repositoryId))) {
        if (isConcurrencyCountingAgentWorkStatus(job.status)) {
          const suspending = await transitionJob(job, "suspending", {
            actor: record.updatedBy,
            reason: "pause requested",
          });
          await releaseLease(suspending.jobId, ownerId, true);
          await transitionJob(suspending, "suspended", {
            actor: record.updatedBy,
            reason: "paused at safe checkpoint",
          });
        }
      }

      return record;
    },
    putDelegate: async (delegate) => {
      await store.upsertDelegate(delegate);
      await eventHub.append({
        actor: delegate.assignedBy,
        dedupeKey: `delegate:${delegate.repositoryId}:${delegate.ticketId}:${delegate.assignmentVersion}`,
        eventType: "local.agent_delegate_changed",
        eventVersion: 1,
        payload: {
          agentId: delegate.agentId,
          assignmentVersion: delegate.assignmentVersion,
          enabled: delegate.enabled,
          providerId: delegate.providerId,
        },
        repositoryId: delegate.repositoryId,
        source: "api",
        ticketId: delegate.ticketId,
      });
    },
    reconcileStaleJobs: async () => {
      const reconciled: AgentWorkJob[] = [];
      const jobs = await store.listJobs({ includeTerminal: false });
      const timestamp = now();

      for (const job of jobs.filter((candidate) =>
        isConcurrencyCountingAgentWorkStatus(candidate.status),
      )) {
        const lease = await store.getLease(job.jobId);
        if (lease !== undefined && !isLeaseStale(lease, timestamp, staleLeaseMs)) continue;

        const checkpoint = await store.latestCheckpoint(job.jobId);
        await releaseLease(job.jobId, ownerId, true);
        const error: AgentWorkError = {
          code: "stale-lease",
          message: "Job lease was stale after restart reconciliation.",
          remediation: checkpoint?.retrySafe
            ? "The job is waiting for a retry from the last safe checkpoint."
            : "Review the job and restart it manually.",
          retrySafe: checkpoint?.retrySafe ?? false,
        };

        const next =
          checkpoint?.retrySafe === true && job.attempt < job.maxAttempts
            ? await transitionJob(job, "retry-wait", {
                actor: "scheduler",
                currentGate: "stale-lease",
                error,
                metadata: {
                  ...job.metadata,
                  nextAttemptAt: new Date(
                    timestamp.getTime() + retryDelayMs(job.attempt),
                  ).toISOString(),
                },
                reason: "stale lease",
              })
            : await transitionJob(job, "failed", {
                actor: "scheduler",
                completedAt: timestamp.toISOString(),
                currentGate: "stale-lease",
                error,
                reason: "stale lease",
              });
        reconciled.push(next);
      }

      return reconciled;
    },
    recordActivity: async (activity) => {
      const timestamp = nowIso(now);
      await store.appendActivity({
        ...activity,
        activityId: randomId("activity"),
        occurredAt: timestamp,
      });
      if (activity.jobId !== undefined) {
        const job = await store.getJob(activity.jobId);
        if (job !== undefined) {
          await store.upsertJob({
            ...job,
            lastProviderEventAt: timestamp,
            updatedAt: timestamp,
          });
        }
      }
    },
    recordCheckpoint: async (jobId, input) => {
      const job = await store.getJob(jobId);
      if (job === undefined) return undefined;

      const checkpoint: AgentWorkCheckpoint = {
        checkpointId: randomId("checkpoint"),
        createdAt: nowIso(now),
        jobId,
        payload: input.payload ?? {},
        retrySafe: input.retrySafe,
        step: input.step,
        workflowId: job.workflowId,
      };
      await store.appendCheckpoint(checkpoint);
      await eventHub.append({
        actor: "workflow",
        eventType: "local.workflow_checkpointed",
        eventVersion: 1,
        jobId,
        payload: {
          checkpointId: checkpoint.checkpointId,
          retrySafe: checkpoint.retrySafe,
          step: checkpoint.step,
          workflowId: checkpoint.workflowId,
        },
        repositoryId: job.repositoryId,
        source: "workflow",
        ticketId: job.ticketId,
      });
      return checkpoint;
    },
    recordJobFailure: async (jobId, error, input) => {
      const job = await store.getJob(jobId);
      if (job === undefined || isTerminalAgentWorkStatus(job.status)) return job;

      if ((input?.retrySafe ?? error.retrySafe ?? false) && job.attempt < job.maxAttempts) {
        return transitionJob(job, "retry-wait", {
          actor: input?.actor ?? "scheduler",
          error,
          metadata: {
            ...job.metadata,
            nextAttemptAt: new Date(now().getTime() + retryDelayMs(job.attempt)).toISOString(),
          },
          reason: "retry scheduled",
        });
      }

      await releaseLease(job.jobId, ownerId, true);
      return transitionJob(job, "failed", {
        actor: input?.actor ?? "scheduler",
        completedAt: nowIso(now),
        error,
        reason: "job failed",
      });
    },
    recordProviderSessionBinding: (binding) => store.upsertProviderSessionBinding(binding),
    releaseLease: (jobId, requestedOwnerId = ownerId) => releaseLease(jobId, requestedOwnerId),
    markJobWaitingForInput: async (jobId, input) => {
      const job = await store.getJob(jobId);
      if (job === undefined || isTerminalAgentWorkStatus(job.status)) return job;

      await releaseLease(job.jobId, ownerId, true);
      return transitionJob(job, "waiting-for-input", {
        actor: input.actor ?? "provider",
        currentGate: null,
        error: input.error,
        metadata: input.metadata ?? job.metadata,
        reason: input.reason ?? "provider requested user input",
      });
    },
    removeDelegate: async (repositoryId, ticketId, actor = "user") => {
      await store.deleteDelegate(repositoryId, ticketId);
      await eventHub.append({
        actor,
        eventType: "local.agent_delegate_changed",
        eventVersion: 1,
        payload: { enabled: false },
        repositoryId,
        source: "api",
        ticketId,
      });
    },
    resumeJob: async (jobId, actor = "user") => {
      const job = await store.getJob(jobId);
      if (job === undefined || isTerminalAgentWorkStatus(job.status)) return job;

      const queued = await transitionJob(job, "queued", {
        actor,
        currentGate: null,
        reason: "job resumed",
      });
      return runtime.evaluateJob(queued.jobId);
    },
    resumeScope: async (scope, input) => {
      const record: AgentWorkPauseScope = {
        paused: false,
        reason: input?.reason,
        scope,
        updatedAt: nowIso(now),
        updatedBy: input?.actor ?? "user",
      };
      await store.upsertPauseScope(record);
      await eventHub.append({
        actor: record.updatedBy,
        eventType: "local.agent_pause_changed",
        eventVersion: 1,
        payload: { paused: false, reason: record.reason ?? null, scope },
        source: "api",
      });

      const jobs = await store.listJobs({ includeTerminal: false });
      for (const job of jobs.filter(
        (candidate) =>
          pauseApplies(scope, candidate.repositoryId) &&
          (candidate.status === "queued" ||
            candidate.status === "retry-wait" ||
            candidate.status === "suspended"),
      )) {
        await runtime.evaluateJob(job.jobId);
      }

      return record;
    },
    startJob: async (input) => {
      const logicalJobKey = input.logicalJobKey ?? logicalJobKeyFor(input);
      const dedupeKey = input.dedupeKey ?? logicalJobKey;
      const existing =
        (await store.findNonTerminalJobByLogicalKey(logicalJobKey)) ??
        (await store.findNonTerminalJobByDedupeKey(dedupeKey));
      if (existing !== undefined) return existing;

      const timestamp = nowIso(now);
      const agent = agents.get(input.agentId);
      const providerId = input.providerId ?? agent?.providerId ?? "codex";
      const job: AgentWorkJob = {
        agentId: input.agentId,
        attempt: 1,
        authorityMode: input.authorityMode,
        branchAssociationId: input.branchAssociationId,
        createdAt: timestamp,
        currentGate: null,
        dedupeKey,
        executionId: randomId("execution"),
        jobId: randomId("job"),
        logicalJobKey,
        maxAttempts: 3,
        metadata: {
          ...input.metadata,
          ...(input.assignmentVersion === undefined
            ? undefined
            : { assignmentVersion: input.assignmentVersion }),
          ...(input.commentId === undefined ? {} : { commentId: input.commentId }),
          ...(input.ticketStatus === undefined ? {} : { ticketStatus: input.ticketStatus }),
        },
        model: input.model ?? agent?.model,
        providerId,
        repositoryId: input.repositoryId,
        requestedBy: input.requestedBy,
        schemaVersion: 1,
        status: "queued",
        ticketId: input.ticketId,
        trigger: input.trigger,
        updatedAt: timestamp,
        workflowId: randomId("workflow"),
      };

      await store.upsertJob(job);
      await store.appendStatusHistory({
        actor: input.requestedBy,
        gate: null,
        historyId: randomId("history"),
        jobId: job.jobId,
        occurredAt: timestamp,
        reason: "job created",
        toStatus: "queued",
      });
      await eventHub.append({
        actor: input.requestedBy,
        dedupeKey,
        eventType: "local.agent_job_created",
        eventVersion: 1,
        jobId: job.jobId,
        payload: jobEventPayload(job),
        repositoryId: job.repositoryId,
        source: "api",
        ticketId: job.ticketId,
      });
      await eventHub.append({
        actor: input.requestedBy,
        dedupeKey: `status:${job.jobId}:queued`,
        eventType: "local.agent_job_status_changed",
        eventVersion: 1,
        jobId: job.jobId,
        payload: jobEventPayload(job),
        repositoryId: job.repositoryId,
        source: "api",
        ticketId: job.ticketId,
      });

      return (await runtime.evaluateJob(job.jobId)) ?? job;
    },
    updateGlobalSettings: async (settings, actor = "user") => {
      const current = await store.getGlobalSettings();
      const next = { ...current, ...settings };
      const validation = validateGlobalAgentWorkSettings(next);
      if (!validation.ok) throw new Error(validation.errors.join("; "));
      await store.upsertGlobalSettings(validation.value);
      await eventHub.append({
        actor,
        eventType: "local.agent_settings_changed",
        eventVersion: 1,
        payload: { scope: "global" },
        source: "api",
      });
      return validation.value;
    },
    updateRepositorySettings: async (repositoryId, settings, actor = "user") => {
      const current = await store.getRepositorySettings(repositoryId);
      const next = {
        ...current,
        ...settings,
        repositoryId,
        updatedAt: settings.updatedAt ?? nowIso(now),
      };
      const validation = validateRepositoryAgentWorkSettings(next);
      if (!validation.ok) throw new Error(validation.errors.join("; "));
      await store.upsertRepositorySettings(validation.value);
      await eventHub.append({
        actor,
        eventType: "local.agent_settings_changed",
        eventVersion: 1,
        payload: { repositoryId, scope: "repository" },
        repositoryId,
        source: "api",
      });
      return validation.value;
    },
  };

  const acquireLease = async (
    jobId: string,
    requestedOwnerId: string,
  ): Promise<AgentWorkLease | undefined> => {
    const existing = await store.getLease(jobId);
    const timestamp = now();
    if (
      existing !== undefined &&
      existing.ownerId !== requestedOwnerId &&
      !isLeaseStale(existing, timestamp, staleLeaseMs)
    ) {
      return undefined;
    }

    const heartbeatAt = timestamp.toISOString();
    const lease: AgentWorkLease = {
      acquiredAt: existing?.acquiredAt ?? heartbeatAt,
      expiresAt: new Date(timestamp.getTime() + leaseDurationMs).toISOString(),
      heartbeatAt,
      jobId,
      leaseId: existing?.leaseId ?? randomId("lease"),
      ownerId: requestedOwnerId,
    };
    await store.upsertLease(lease);
    return lease;
  };

  const releaseLease = async (
    jobId: string,
    requestedOwnerId: string,
    force = false,
  ): Promise<boolean> => {
    const lease = await store.getLease(jobId);
    if (lease === undefined) return true;
    if (!force && lease.ownerId !== requestedOwnerId) return false;
    await store.deleteLease(jobId);
    return true;
  };

  const evaluateGates = async (job: AgentWorkJob): Promise<AgentWorkGate> => {
    const globalSettings = await store
      .getGlobalSettings()
      .catch(() => defaultGlobalAgentWorkSettings());
    const repositorySettings = await store
      .getRepositorySettings(job.repositoryId)
      .catch(() => defaultRepositoryAgentWorkSettings(job.repositoryId));
    const globalPause = await store.getPauseScope("global");
    const repositoryPause = await store.getPauseScope(`repository:${job.repositoryId}`);
    const provider = providers.get(job.providerId);
    const agent = agents.get(job.agentId);

    if (globalSettings.paused || globalPause?.paused === true) return "global-paused";
    if (repositorySettings.paused || repositoryPause?.paused === true) return "repository-paused";
    if (repositorySettings.agentWorkDisabled) return "repository-agent-work-disabled";
    if (provider === undefined || !provider.available) return "provider-missing";
    if (!provider.enabled || !globalSettings.enabledProviders.includes(job.providerId)) {
      return "provider-disabled";
    }
    if (agent === undefined || !agent.enabled) return "agent-disabled";
    if (!executionPolicy.supportedAuthorityModes.has(job.authorityMode)) {
      return "unsupported-provider-capability";
    }
    if (!providerSupportsAuthority(provider.capabilities, job.authorityMode)) {
      return "unsupported-provider-capability";
    }
    if (!mcpAvailable) return "mcp-unavailable";
    if (
      globalSettings.maxConcurrentJobs !== null &&
      (await store.countConcurrency()) >= globalSettings.maxConcurrentJobs
    ) {
      return "global-concurrency";
    }
    if (
      repositorySettings.maxConcurrentJobs !== null &&
      (await store.countConcurrency({ repositoryId: job.repositoryId })) >=
        repositorySettings.maxConcurrentJobs
    ) {
      return "repository-concurrency";
    }
    const agentMax =
      repositorySettings.perAgentOverrides[job.agentId]?.maxConcurrentJobs ??
      globalSettings.perAgentOverrides[job.agentId]?.maxConcurrentJobs;
    if (
      agentMax !== undefined &&
      agentMax !== null &&
      (await store.countConcurrency({ agentId: job.agentId })) >= agentMax
    ) {
      return "agent-concurrency";
    }
    const duplicate = await store.findNonTerminalJobByLogicalKey(job.logicalJobKey);
    if (duplicate !== undefined && duplicate.jobId !== job.jobId) return "duplicate-active-job";
    if (job.authorityMode !== "ticket-context" && job.branchAssociationId !== undefined) {
      const duplicateBranchJob = (await store.listJobs({ includeTerminal: false })).find(
        (candidate) =>
          candidate.jobId !== job.jobId &&
          candidate.branchAssociationId === job.branchAssociationId &&
          candidate.authorityMode === "implementation-worktree",
      );
      if (duplicateBranchJob !== undefined) return "worktree-unavailable";
    }
    if (job.trigger === "assignment-pickup" && job.metadata.ticketStatus !== "todo") {
      return "invalid-ticket-state";
    }

    return null;
  };

  const transitionJob = async (
    job: AgentWorkJob,
    status: AgentWorkJobStatus,
    input: {
      readonly actor: string;
      readonly completedAt?: string;
      readonly currentGate?: AgentWorkGate;
      readonly error?: AgentWorkError;
      readonly lastHeartbeatAt?: string;
      readonly metadata?: AgentWorkJsonObject;
      readonly reason?: string;
      readonly startedAt?: string;
    },
  ): Promise<AgentWorkJob> => {
    const timestamp = nowIso(now);
    const updated: AgentWorkJob = {
      ...job,
      completedAt: input.completedAt ?? job.completedAt,
      currentGate: input.currentGate === undefined ? job.currentGate : input.currentGate,
      lastError: input.error ?? job.lastError,
      lastHeartbeatAt: input.lastHeartbeatAt ?? job.lastHeartbeatAt,
      metadata: input.metadata ?? job.metadata,
      startedAt: input.startedAt ?? job.startedAt,
      status,
      updatedAt: timestamp,
    };
    await store.upsertJob(updated);
    const history: AgentWorkStatusHistoryRecord = {
      actor: input.actor,
      error: input.error,
      fromStatus: job.status,
      gate: updated.currentGate,
      historyId: randomId("history"),
      jobId: job.jobId,
      occurredAt: timestamp,
      reason: input.reason,
      toStatus: status,
    };
    await store.appendStatusHistory(history);
    await eventHub.append({
      actor: input.actor,
      dedupeKey: `status:${job.jobId}:${status}:${timestamp}`,
      eventType: "local.agent_job_status_changed",
      eventVersion: 1,
      jobId: job.jobId,
      payload: jobEventPayload(updated),
      repositoryId: job.repositoryId,
      source: input.actor === "workflow" ? "workflow" : "scheduler",
      ticketId: job.ticketId,
    });
    return updated;
  };

  return runtime;
};

const defaultCodexProvider = (): AgentWorkProviderRecord => ({
  available: true,
  capabilities: defaultAgentCapabilities("codex"),
  enabled: true,
  providerId: "codex",
});

const normalizeExecutionPolicy = (
  policy: AgentWorkExecutionPolicy | undefined,
): { readonly supportedAuthorityModes: ReadonlySet<AgentWorkAuthorityMode> } => ({
  supportedAuthorityModes: new Set(policy?.supportedAuthorityModes ?? ["ticket-context"]),
});

const isStartableStatus = (status: AgentWorkJobStatus): boolean =>
  status === "queued" || status === "retry-wait" || status === "suspended";

const pauseApplies = (scope: AgentWorkPauseScopeName, repositoryId: string): boolean =>
  scope === "global" || scope === `repository:${repositoryId}`;

const providerSupportsAuthority = (
  capabilities: AgentCapabilities,
  authorityMode: AgentWorkAuthorityMode,
): boolean => {
  if (capabilities.authorityModes?.[authorityMode] === false) return false;
  if (authorityMode === "ticket-context") return capabilities.supports.mcp;
  return capabilities.supports.mcp && capabilities.supports.fileChanges;
};

export const logicalJobKeyFor = (input: {
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly trigger: AgentWorkTrigger;
  readonly agentId: string;
  readonly assignmentVersion?: number;
  readonly commentId?: string;
  readonly branchAssociationId?: string;
}): string => {
  switch (input.trigger) {
    case "assignment-pickup":
      return [
        "assignment",
        input.repositoryId,
        input.ticketId,
        input.agentId,
        input.assignmentVersion ?? 0,
      ].join(":");
    case "agent-delegate":
      return [
        "delegate",
        input.repositoryId,
        input.ticketId,
        input.agentId,
        input.assignmentVersion ?? 0,
      ].join(":");
    case "agent-mention":
      return [
        "mention",
        input.repositoryId,
        input.ticketId,
        input.commentId ?? "",
        input.agentId,
      ].join(":");
    case "follow-up-implementation":
      return [
        "follow-up",
        input.repositoryId,
        input.ticketId,
        input.commentId ?? "",
        input.agentId,
        input.branchAssociationId ?? "",
      ].join(":");
    default:
      return [
        input.trigger,
        input.repositoryId,
        input.ticketId,
        input.agentId,
        randomId("logical"),
      ].join(":");
  }
};

const jobEventPayload = (job: AgentWorkJob): AgentWorkJsonObject => ({
  agentId: job.agentId,
  attempt: job.attempt,
  authorityMode: job.authorityMode,
  branchAssociationId: job.branchAssociationId ?? null,
  currentGate: job.currentGate,
  jobId: job.jobId,
  lastError: job.lastError === undefined ? null : (job.lastError as unknown as AgentWorkJsonObject),
  model: job.model ?? null,
  providerId: job.providerId,
  providerSessionId: job.providerSessionId ?? null,
  repositoryId: job.repositoryId,
  status: job.status,
  ticketId: job.ticketId,
  trigger: job.trigger,
  workflowId: job.workflowId,
  worktreeId: job.worktreeId ?? null,
});

const isLeaseStale = (lease: AgentWorkLease, timestamp: Date, staleLeaseMs: number): boolean =>
  timestamp.getTime() - new Date(lease.heartbeatAt).getTime() > staleLeaseMs;

const retryDelayMs = (attempt: number): number =>
  Math.min(5_000 * 2 ** Math.max(0, attempt - 1), 300_000);

const nowIso = (now: () => Date): string => now().toISOString();

const randomId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
