import type { AgentProviderId } from "@cycle/agents/types";
import type {
  AgentActivity,
  AgentBranchAssociationInput,
  AgentDelegate,
  AgentDelegateJob,
  AgentJob,
  AgentJobActivityInput,
  AgentJobCreateInput,
  AgentJobFailureInput,
  AgentJobLog,
  AgentJobLogEntry,
  AgentSettings,
  AgentWorktreeInput,
  AgentWorkEventInput,
  AgentWorkRuntimeShape,
  RepositoryAgentSettings,
} from "../agentWork/runtime.ts";
import { mentionLogicalJobKey, parseStructuredAgentMentions } from "../agentWork/runtime.ts";
import {
  logicalJobKeyFor,
  makeAgentWorkRuntime,
  type AgentWorkRuntime,
  type AgentWorkRuntimeOptions,
} from "./runtime.ts";
import { makeInMemoryAgentWorkStore, type AgentWorkRuntimeStore } from "./store.ts";
import type {
  AgentWorkDelegate,
  AgentWorkError,
  AgentWorkJob,
  AgentWorkJsonObject,
  LocalAgentWorkEvent,
  LocalAgentWorkEventInput,
  LocalAgentWorkEventType,
} from "./types.ts";

export const makeHttpAgentWorkRuntime = (runtime: AgentWorkRuntime): AgentWorkRuntimeShape => ({
  attachBranchAssociation: async (input: AgentBranchAssociationInput) => {
    const job = await runtime.attachBranchAssociation({
      branchAssociationId: input.branchAssociationId,
      branchName: input.branchName,
      branchRef: input.branchRef,
      createdAt: input.createdAt,
      jobId: input.jobId,
      repositoryId: input.repositoryId,
      status: input.status,
      ticketId: input.ticketId,
      updatedAt: input.updatedAt,
      ...(input.baseSha === undefined ? {} : { baseSha: input.baseSha }),
      ...(input.headSha === undefined ? {} : { headSha: input.headSha }),
      ...(input.handoverCommentId === undefined
        ? {}
        : { handoverCommentId: input.handoverCommentId }),
    });
    return job === undefined ? null : toHttpJob(job);
  },
  attachWorktree: async (input: AgentWorktreeInput) => {
    const job = await runtime.attachWorktree({
      createdAt: input.createdAt,
      jobId: input.jobId,
      mode: input.mode,
      path: input.path,
      repositoryId: input.repositoryId,
      status: input.status,
      updatedAt: input.updatedAt,
      worktreeId: input.worktreeId,
      ...(input.baseRef === undefined ? {} : { baseRef: input.baseRef }),
      ...(input.baseSha === undefined ? {} : { baseSha: input.baseSha }),
      ...(input.branchName === undefined ? {} : { branchName: input.branchName }),
      ...(input.branchRef === undefined ? {} : { branchRef: input.branchRef }),
      ...(input.cleanedAt === undefined ? {} : { cleanedAt: input.cleanedAt }),
      ...(input.retentionReason === undefined ? {} : { retentionReason: input.retentionReason }),
    });
    return job === undefined ? null : toHttpJob(job);
  },
  cancelJob: async (jobId, reason, requestedBy) => {
    const job = await runtime.cancelJob(jobId, requestedBy);
    if (job === undefined) return null;
    if (reason !== undefined) {
      await runtime.recordActivity({
        jobId,
        kind: "cancel",
        message: reason,
        payload: {},
        repositoryId: job.repositoryId,
        ticketId: job.ticketId,
      });
    }
    return toHttpJob(job);
  },
  createJob: async (input) => toHttpJob(await runtime.startJob(toStartJobInput(input))),
  createDelegateJob: async (repositoryId, ticketId, input): Promise<AgentDelegateJob> => {
    const delegate = await upsertDelegate(runtime, repositoryId, ticketId, input);
    const logicalJobKey = logicalJobKeyFor({
      agentId: delegate.agentId,
      assignmentVersion: delegate.assignmentVersion,
      repositoryId,
      ticketId,
      trigger: "agent-delegate",
    });
    const job = await runtime.startJob({
      agentId: delegate.agentId,
      assignmentVersion: delegate.assignmentVersion,
      authorityMode: "implementation-worktree",
      dedupeKey: logicalJobKey,
      logicalJobKey,
      metadata: {
        assignmentVersion: delegate.assignmentVersion,
        ...(delegate.notes === undefined ? {} : { notes: delegate.notes }),
        ...(input.instructions === undefined || input.instructions === null
          ? {}
          : { instructions: input.instructions }),
      },
      model: delegate.model,
      providerId: delegate.providerId,
      repositoryId,
      requestedBy: input.assignedBy ?? "local-user",
      ticketId,
      trigger: "agent-delegate",
    });
    return {
      delegate: toHttpDelegate(delegate),
      job: toHttpJob(job),
    };
  },
  completeJob: async (jobId, input = {}) => {
    if (input.message !== undefined) {
      await recordJobActivity(runtime, {
        jobId,
        kind: "completion",
        message: input.message,
        payload: input.payload,
      });
    }
    const job = await runtime.completeJob(jobId, {
      actor: input.actor ?? "workflow",
      reason: input.message ?? "job completed",
    });
    return job === undefined ? null : toHttpJob(job);
  },
  deleteDelegate: async (repositoryId, ticketId) => {
    const current = await runtime.store.getDelegate(repositoryId, ticketId);
    await runtime.removeDelegate(repositoryId, ticketId, "api");
    return current !== undefined;
  },
  emit: async (input) => toHttpActivity(await runtime.eventHub.append(toLocalEventInput(input))),
  evaluateAssignmentPickup: async (input) => {
    if (input.ticketStatus !== "todo") return null;
    const delegate = await runtime.store.getDelegate(input.repositoryId, input.ticketId);
    if (delegate === undefined || !delegate.enabled) return null;

    const logicalJobKey = logicalJobKeyFor({
      agentId: delegate.agentId,
      assignmentVersion: delegate.assignmentVersion,
      repositoryId: input.repositoryId,
      ticketId: input.ticketId,
      trigger: "assignment-pickup",
    });

    const job = await runtime.startJob({
      agentId: delegate.agentId,
      assignmentVersion: delegate.assignmentVersion,
      authorityMode: "implementation-worktree",
      dedupeKey: logicalJobKey,
      logicalJobKey,
      metadata: { assignmentVersion: delegate.assignmentVersion, ticketStatus: input.ticketStatus },
      model: delegate.model,
      providerId: delegate.providerId,
      repositoryId: input.repositoryId,
      requestedBy: input.requestedBy ?? "assignment-pickup",
      ticketId: input.ticketId,
      ticketStatus: input.ticketStatus,
      trigger: "assignment-pickup",
    });
    return toHttpJob(job);
  },
  getDelegate: async (repositoryId, ticketId) => {
    const delegate = await runtime.store.getDelegate(repositoryId, ticketId);
    return delegate === undefined ? null : toHttpDelegate(delegate);
  },
  getJob: async (jobId) => {
    const job = await runtime.getJob(jobId);
    return job === undefined ? null : toHttpJob(job);
  },
  getJobLog: async (jobId) => {
    const job = await runtime.getJob(jobId);
    if (job === undefined) return null;

    const [history, events, activities, checkpoints] = await Promise.all([
      runtime.store.listStatusHistory(jobId),
      runtime.eventHub.replay({ jobId }),
      runtime.store.listActivity(),
      runtime.store.listCheckpoints(jobId),
    ]);

    return {
      entries: [
        ...history.map<AgentJobLogEntry>((entry) => ({
          actor: entry.actor,
          entryId: entry.historyId,
          kind: "status",
          message: statusHistoryMessage(entry),
          occurredAt: entry.occurredAt,
          payload: toJsonObject({
            error: entry.error,
            fromStatus: entry.fromStatus ?? null,
            gate: entry.gate,
            reason: entry.reason ?? null,
            toStatus: entry.toStatus,
          }),
          status: entry.toStatus,
          title: "Status changed",
        })),
        ...events.map<AgentJobLogEntry>((event) => ({
          actor: actorName(event.actor),
          entryId: event.eventId,
          kind: "event",
          message: event.eventType,
          occurredAt: event.occurredAt,
          payload: event.payload,
          source: event.source,
          title: event.eventType,
        })),
        ...activities
          .filter((activity) => activity.jobId === jobId)
          .map<AgentJobLogEntry>((activity) => ({
            entryId: activity.activityId,
            kind: "activity",
            message: activity.message,
            occurredAt: activity.occurredAt,
            payload: activity.payload,
            title: activity.kind,
          })),
        ...checkpoints.map<AgentJobLogEntry>((checkpoint) => ({
          entryId: checkpoint.checkpointId,
          kind: "checkpoint",
          message: checkpoint.retrySafe
            ? "Retry-safe checkpoint recorded."
            : "Checkpoint recorded.",
          occurredAt: checkpoint.createdAt,
          payload: checkpoint.payload,
          source: "workflow",
          title: checkpoint.step,
        })),
      ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
      job: toHttpJob(job),
    } satisfies AgentJobLog;
  },
  getRepositorySettings: async (repositoryId) =>
    toHttpRepositorySettings(await runtime.getRepositorySettings(repositoryId)),
  getSettings: async () => toHttpSettings(await runtime.getGlobalSettings()),
  failJob: async (jobId, failure) => {
    await recordJobActivity(runtime, {
      jobId,
      kind: "error",
      message: failure.message,
      payload: {
        code: failure.code ?? "provider-turn-failed",
        remediation: failure.remediation ?? null,
        retrySafe: failure.retrySafe ?? false,
      },
    });
    const job = await runtime.recordJobFailure(jobId, toAgentWorkError(failure), {
      actor: failure.actor ?? "workflow",
      retrySafe: failure.retrySafe,
    });
    return job === undefined ? null : toHttpJob(job);
  },
  handleSuccessfulComment: async (input) => {
    const settings = await runtime.getGlobalSettings();
    const authorityMode = mentionAuthorityMode(settings);
    const jobs: AgentJob[] = [];
    for (const agentId of parseStructuredAgentMentions(input.body)) {
      const job = await runtime.startJob({
        agentId,
        authorityMode,
        commentId: input.commentId,
        dedupeKey: mentionLogicalJobKey({
          agentId,
          commentId: input.commentId,
          repositoryId: input.repositoryId,
          ticketId: input.ticketId,
        }),
        logicalJobKey: mentionLogicalJobKey({
          agentId,
          commentId: input.commentId,
          repositoryId: input.repositoryId,
          ticketId: input.ticketId,
        }),
        metadata: { commentBody: input.body, commentId: input.commentId },
        providerId: settings.defaultProviderId,
        repositoryId: input.repositoryId,
        requestedBy: "comment-mention",
        ticketId: input.ticketId,
        trigger: "agent-mention",
      });
      jobs.push(toHttpJob(job));
    }
    return jobs;
  },
  listActivity: async (query = {}) => {
    const events = await runtime.eventHub.replay({
      afterSequence: query.after,
      repositoryId: query.repositoryId,
    });
    return events.slice(0, query.limit ?? 100).map(toHttpActivity);
  },
  listJobs: async (query = {}) => {
    const jobs = await runtime.listJobs({
      includeTerminal: true,
      repositoryId: query.repositoryId,
      ticketId: query.ticketId,
    });
    return jobs
      .filter((job) => query.status === undefined || job.status === query.status)
      .map(toHttpJob);
  },
  markJobWaitingForInput: async (jobId, input) => {
    await recordJobActivity(runtime, {
      jobId,
      kind: "question",
      message: input.message,
      payload: input.payload,
    });
    const job = await runtime.markJobWaitingForInput(jobId, {
      actor: input.actor ?? "provider",
      error: {
        code: "user-input-required",
        message: input.message,
        retrySafe: false,
      },
      reason: input.message,
    });
    return job === undefined ? null : toHttpJob(job);
  },
  patchRepositorySettings: async (repositoryId, patch) => {
    await runtime.updateRepositorySettings(repositoryId, fromRepositoryPatch(patch), "api");
    if (patch.paused === true) {
      await runtime.pauseScope(`repository:${repositoryId}`, { actor: "api" });
    } else if (patch.paused === false) {
      await runtime.resumeScope(`repository:${repositoryId}`, { actor: "api" });
    }
    return toHttpRepositorySettings(await runtime.getRepositorySettings(repositoryId));
  },
  patchSettings: async (patch) => {
    await runtime.updateGlobalSettings(fromSettingsPatch(patch), "api");
    if (patch.paused === true) {
      await runtime.pauseScope("global", { actor: "api" });
    } else if (patch.paused === false) {
      await runtime.resumeScope("global", { actor: "api" });
    }
    return toHttpSettings(await runtime.getGlobalSettings());
  },
  putDelegate: async (repositoryId, ticketId, input) => {
    const delegate = await upsertDelegate(runtime, repositoryId, ticketId, input);
    return toHttpDelegate(delegate);
  },
  recordJobActivity: (input) => recordJobActivity(runtime, input),
  resumeJob: async (jobId, requestedBy) => {
    const job = await runtime.resumeJob(jobId, requestedBy);
    return job === undefined ? null : toHttpJob(job);
  },
});

const upsertDelegate = async (
  runtime: AgentWorkRuntime,
  repositoryId: string,
  ticketId: string,
  input: {
    readonly agentId: string;
    readonly assignedBy?: string;
    readonly enabled?: boolean;
    readonly model?: string | null;
    readonly notes?: string | null;
    readonly providerId?: string;
  },
): Promise<AgentWorkDelegate> => {
  const current = await runtime.store.getDelegate(repositoryId, ticketId);
  const settings = await runtime.getGlobalSettings();
  const now = new Date().toISOString();
  const delegate: AgentWorkDelegate = {
    agentId: input.agentId,
    assignedBy: input.assignedBy ?? "local-user",
    assignmentVersion: (current?.assignmentVersion ?? 0) + 1,
    createdAt: current?.createdAt ?? now,
    enabled: input.enabled ?? true,
    ...(input.model === undefined || input.model === null ? {} : { model: input.model }),
    ...(input.notes === undefined || input.notes === null ? {} : { notes: input.notes }),
    providerId: (input.providerId ?? settings.defaultProviderId) as AgentProviderId,
    repositoryId,
    ticketId,
    updatedAt: now,
  };
  await runtime.putDelegate(delegate);
  return delegate;
};

export const makeHttpAgentWorkRuntimeFromStore = (
  store: AgentWorkRuntimeStore,
  options: Omit<AgentWorkRuntimeOptions, "store"> = {},
): AgentWorkRuntimeShape => {
  const runtime = makeAgentWorkRuntime({ ...options, store });
  void runtime.reconcileStaleJobs();
  return makeHttpAgentWorkRuntime(runtime);
};

export const makeHttpInMemoryAgentWorkRuntime = (
  options: Omit<AgentWorkRuntimeOptions, "store"> = {},
): AgentWorkRuntimeShape => makeHttpAgentWorkRuntimeFromStore(makeInMemoryAgentWorkStore(), options);

const toStartJobInput = (input: AgentJobCreateInput) => ({
  agentId: input.agentId,
  authorityMode: input.authorityMode,
  dedupeKey: input.dedupeKey ?? input.logicalJobKey,
  logicalJobKey: input.logicalJobKey,
  metadata: toJsonObject(input.metadata),
  model: input.model ?? undefined,
  providerId: (input.providerId ?? "codex") as AgentProviderId,
  repositoryId: input.repositoryId,
  requestedBy: input.requestedBy,
  ticketId: input.ticketId,
  trigger: input.trigger,
});

const mentionAuthorityMode = (settings: {
  readonly allowDisposableWorktreeForMentions: boolean;
  readonly allowFullAccessJobs: boolean;
  readonly defaultMentionAuthorityMode: AgentSettings["defaultMentionAuthorityMode"];
}): AgentSettings["defaultMentionAuthorityMode"] => {
  if (
    settings.defaultMentionAuthorityMode === "disposable-worktree" &&
    !settings.allowDisposableWorktreeForMentions
  ) {
    return "ticket-context";
  }
  if (
    settings.defaultMentionAuthorityMode === "implementation-worktree" &&
    !settings.allowFullAccessJobs
  ) {
    return "ticket-context";
  }
  return settings.defaultMentionAuthorityMode;
};

const recordJobActivity = async (
  runtime: AgentWorkRuntime,
  input: AgentJobActivityInput,
): Promise<void> => {
  const job = await runtime.getJob(input.jobId);
  if (job === undefined) return;
  await runtime.recordActivity({
    jobId: input.jobId,
    kind: input.kind,
    message: input.message,
    payload: toJsonObject(input.payload),
    repositoryId: job.repositoryId,
    ticketId: job.ticketId,
  });
};

const toAgentWorkError = (failure: AgentJobFailureInput): AgentWorkError => ({
  code: (failure.code ?? "provider-turn-failed") as AgentWorkError["code"],
  message: failure.message,
  ...(failure.remediation === undefined ? {} : { remediation: failure.remediation }),
  ...(failure.retrySafe === undefined ? {} : { retrySafe: failure.retrySafe }),
});

const toHttpJob = (job: AgentWorkJob): AgentJob => ({
  agentId: job.agentId,
  attempt: job.attempt,
  authorityMode: job.authorityMode,
  branchAssociationId: job.branchAssociationId ?? null,
  completedAt: job.completedAt ?? null,
  createdAt: job.createdAt,
  currentGate: job.currentGate,
  dedupeKey: job.dedupeKey,
  executionId: job.executionId,
  jobId: job.jobId,
  lastError: job.lastError?.message ?? null,
  lastHeartbeatAt: job.lastHeartbeatAt ?? null,
  lastProviderEventAt: job.lastProviderEventAt ?? null,
  logicalJobKey: job.logicalJobKey,
  maxAttempts: job.maxAttempts,
  metadata: job.metadata,
  model: job.model ?? null,
  providerId: job.providerId,
  providerSessionId: job.providerSessionId ?? null,
  repositoryId: job.repositoryId,
  requestedBy: job.requestedBy,
  schemaVersion: 1,
  startedAt: job.startedAt ?? null,
  status: job.status,
  ticketId: job.ticketId,
  trigger: job.trigger,
  updatedAt: job.updatedAt,
  workflowId: job.workflowId,
  worktreeId: job.worktreeId ?? null,
});

const toHttpDelegate = (delegate: AgentWorkDelegate): AgentDelegate => ({
  agentId: delegate.agentId,
  assignedBy: delegate.assignedBy,
  assignmentVersion: delegate.assignmentVersion,
  createdAt: delegate.createdAt,
  enabled: delegate.enabled,
  model: delegate.model ?? null,
  notes: delegate.notes ?? null,
  providerId: delegate.providerId,
  repositoryId: delegate.repositoryId,
  ticketId: delegate.ticketId,
  updatedAt: delegate.updatedAt,
});

const toHttpSettings = (settings: {
  readonly allowDisposableWorktreeForMentions: boolean;
  readonly allowFullAccessJobs: boolean;
  readonly defaultMentionAuthorityMode: AgentSettings["defaultMentionAuthorityMode"];
  readonly defaultModel?: string;
  readonly defaultProviderId: string;
  readonly enabledProviders: readonly string[];
  readonly maxConcurrentJobs: number;
  readonly paused: boolean;
  readonly perAgentOverrides: AgentSettings["perAgentOverrides"];
}): AgentSettings => ({
  allowDisposableWorktreeForMentions: settings.allowDisposableWorktreeForMentions,
  allowFullAccessJobs: settings.allowFullAccessJobs,
  defaultMentionAuthorityMode: settings.defaultMentionAuthorityMode,
  defaultModel: settings.defaultModel ?? null,
  defaultProviderId: settings.defaultProviderId,
  enabledProviders: settings.enabledProviders,
  maxConcurrentJobs: settings.maxConcurrentJobs,
  paused: settings.paused,
  perAgentOverrides: settings.perAgentOverrides,
});

const toHttpRepositorySettings = (settings: {
  readonly agentWorkDisabled: boolean;
  readonly maxConcurrentJobs: number;
  readonly model?: string;
  readonly paused: boolean;
  readonly perAgentOverrides: RepositoryAgentSettings["perAgentOverrides"];
  readonly providerId?: string;
  readonly repositoryId: string;
  readonly updatedAt: string;
}): RepositoryAgentSettings => ({
  agentWorkDisabled: settings.agentWorkDisabled,
  maxConcurrentJobs: settings.maxConcurrentJobs,
  model: settings.model ?? null,
  paused: settings.paused,
  perAgentOverrides: settings.perAgentOverrides,
  providerId: settings.providerId ?? null,
  repositoryId: settings.repositoryId,
  updatedAt: settings.updatedAt,
});

const toHttpActivity = (event: LocalAgentWorkEvent): AgentActivity => ({
  actor: event.actor,
  dedupeKey: event.dedupeKey ?? null,
  eventId: event.eventId,
  eventType: event.eventType,
  eventVersion: event.eventVersion,
  jobId: event.jobId ?? null,
  occurredAt: event.occurredAt,
  payload: event.payload,
  repositoryId: event.repositoryId ?? null,
  sequence: event.sequence,
  source: event.source,
  ticketId: event.ticketId ?? null,
});

const statusHistoryMessage = (entry: {
  readonly fromStatus?: string;
  readonly gate?: string | null;
  readonly reason?: string;
  readonly toStatus: string;
}): string => {
  const transition =
    entry.fromStatus === undefined
      ? `Entered ${entry.toStatus}.`
      : `Moved from ${entry.fromStatus} to ${entry.toStatus}.`;
  const details = [entry.reason, entry.gate === null ? undefined : entry.gate].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return details.length === 0 ? transition : `${transition} ${details.join(" - ")}`;
};

const toLocalEventInput = (event: AgentWorkEventInput): LocalAgentWorkEventInput => ({
  actor: actorName(event.actor),
  dedupeKey: event.dedupeKey ?? undefined,
  eventId: event.eventId,
  eventType: event.eventType as LocalAgentWorkEventType,
  eventVersion: event.eventVersion ?? 1,
  jobId: event.jobId ?? undefined,
  occurredAt: event.occurredAt,
  payload: toJsonObject(event.payload),
  repositoryId: event.repositoryId ?? undefined,
  source: event.source === "api" ? "api" : "scheduler",
  ticketId: event.ticketId ?? undefined,
});

const fromSettingsPatch = (patch: Partial<AgentSettings>) =>
  stripUndefined({
    ...patch,
    defaultModel: patch.defaultModel ?? undefined,
    defaultProviderId: patch.defaultProviderId as AgentProviderId | undefined,
    enabledProviders: patch.enabledProviders as readonly AgentProviderId[] | undefined,
    perAgentOverrides: patch.perAgentOverrides as never,
  });

const fromRepositoryPatch = (patch: Partial<RepositoryAgentSettings>) =>
  stripUndefined({
    ...patch,
    model: patch.model ?? undefined,
    providerId: patch.providerId as AgentProviderId | undefined,
    perAgentOverrides: patch.perAgentOverrides as never,
  });

const actorName = (actor: unknown): string => {
  if (typeof actor === "string" && actor.trim().length > 0) return actor;
  if (typeof actor === "object" && actor !== null) {
    const name = (actor as { readonly name?: unknown }).name;
    if (typeof name === "string" && name.trim().length > 0) return name;
  }
  return "api";
};

const toJsonObject = (value: unknown): AgentWorkJsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AgentWorkJsonObject)
    : {};

const stripUndefined = <T extends Readonly<Record<string, unknown>>>(input: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
