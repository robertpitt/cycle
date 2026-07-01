export type AgentAuthorityMode =
  | "ticket-context"
  | "disposable-worktree"
  | "implementation-worktree";

export type AgentJobStatus =
  | "queued"
  | "starting"
  | "running"
  | "waiting-for-input"
  | "suspending"
  | "suspended"
  | "resuming"
  | "retry-wait"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentWorkTrigger =
  | "assignment-pickup"
  | "agent-delegate"
  | "agent-mention"
  | "follow-up-implementation"
  | "manual-command"
  | "retry"
  | "resume";

export type AgentSettings = {
  readonly paused: boolean;
  readonly maxConcurrentJobs: number;
  readonly defaultProviderId: string;
  readonly defaultModel?: string | null;
  readonly enabledProviders: readonly string[];
  readonly defaultMentionAuthorityMode: AgentAuthorityMode;
  readonly allowDisposableWorktreeForMentions: boolean;
  readonly allowFullAccessJobs: boolean;
  readonly perAgentOverrides: Readonly<Record<string, unknown>>;
};

export type AgentSettingsPatch = Partial<AgentSettings>;

export type RepositoryAgentSettings = {
  readonly repositoryId: string;
  readonly paused: boolean;
  readonly maxConcurrentJobs: number;
  readonly agentWorkDisabled: boolean;
  readonly providerId?: string | null;
  readonly model?: string | null;
  readonly perAgentOverrides: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
};

export type RepositoryAgentSettingsPatch = Partial<
  Omit<RepositoryAgentSettings, "repositoryId" | "updatedAt">
>;

export type AgentDelegate = {
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly agentId: string;
  readonly providerId: string;
  readonly model?: string | null;
  readonly enabled: boolean;
  readonly assignedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly assignmentVersion: number;
  readonly notes?: string | null;
};

export type AgentDelegateInput = {
  readonly agentId: string;
  readonly providerId?: string;
  readonly model?: string | null;
  readonly enabled?: boolean;
  readonly assignedBy?: string;
  readonly notes?: string | null;
};

export type AgentDelegateJobInput = AgentDelegateInput & {
  readonly instructions?: string | null;
};

export type AgentJob = {
  readonly schemaVersion: 1;
  readonly jobId: string;
  readonly executionId: string;
  readonly logicalJobKey: string;
  readonly dedupeKey: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly trigger: AgentWorkTrigger;
  readonly agentId: string;
  readonly providerId: string;
  readonly model?: string | null;
  readonly authorityMode: AgentAuthorityMode;
  readonly status: AgentJobStatus;
  readonly currentGate?: string | null;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly requestedBy: string;
  readonly workflowId?: string | null;
  readonly providerSessionId?: string | null;
  readonly worktreeId?: string | null;
  readonly branchAssociationId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly lastHeartbeatAt?: string | null;
  readonly lastProviderEventAt?: string | null;
  readonly lastError?: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type AgentDelegateJob = {
  readonly delegate: AgentDelegate;
  readonly job: AgentJob;
};

export type AgentWorktreeInput = {
  readonly worktreeId: string;
  readonly repositoryId: string;
  readonly jobId: string;
  readonly mode: "disposable" | "implementation";
  readonly path: string;
  readonly baseRef?: string;
  readonly baseSha?: string;
  readonly branchName?: string;
  readonly branchRef?: string;
  readonly status: "creating" | "ready" | "cleaning" | "cleaned" | "failed" | "retained";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cleanedAt?: string;
  readonly retentionReason?: string;
  readonly lastError?: string;
};

export type AgentBranchAssociationInput = {
  readonly branchAssociationId: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly jobId: string;
  readonly branchName: string;
  readonly branchRef: string;
  readonly baseSha?: string;
  readonly headSha?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: "active" | "superseded" | "failed" | "abandoned";
  readonly handoverCommentId?: string;
};

export type AgentActivity = {
  readonly sequence: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly occurredAt: string;
  readonly repositoryId?: string | null;
  readonly ticketId?: string | null;
  readonly jobId?: string | null;
  readonly actor?: unknown;
  readonly source: string;
  readonly dedupeKey?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type AgentJobLogEntry = {
  readonly entryId: string;
  readonly kind: "activity" | "checkpoint" | "event" | "status";
  readonly occurredAt: string;
  readonly title: string;
  readonly message: string;
  readonly actor?: string | null;
  readonly source?: string | null;
  readonly status?: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type AgentJobLog = {
  readonly job: AgentJob;
  readonly entries: readonly AgentJobLogEntry[];
};

export type AgentJobActivityInput = {
  readonly jobId: string;
  readonly kind: string;
  readonly message: string;
  readonly payload?: Readonly<Record<string, unknown>>;
};

export type AgentJobFailureInput = {
  readonly code?: string;
  readonly message: string;
  readonly remediation?: string;
  readonly retrySafe?: boolean;
  readonly actor?: string;
};

export type AgentJobWaitingInput = {
  readonly message: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly actor?: string;
};

export type AgentWorkEventInput = Omit<
  AgentActivity,
  "eventId" | "eventVersion" | "occurredAt" | "sequence"
> & {
  readonly eventId?: string;
  readonly eventVersion?: number;
  readonly occurredAt?: string;
};

export type AgentJobCreateInput = {
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly trigger: AgentWorkTrigger;
  readonly agentId: string;
  readonly providerId?: string;
  readonly model?: string | null;
  readonly authorityMode: AgentAuthorityMode;
  readonly requestedBy: string;
  readonly logicalJobKey: string;
  readonly dedupeKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type AgentJobListQuery = {
  readonly repositoryId?: string;
  readonly ticketId?: string;
  readonly status?: string;
};

export type AgentActivityQuery = {
  readonly after?: number;
  readonly limit?: number;
  readonly repositoryId?: string;
};

export type AgentWorkRuntimeShape = {
  readonly getSettings: () => Promise<AgentSettings>;
  readonly patchSettings: (patch: AgentSettingsPatch) => Promise<AgentSettings>;
  readonly getRepositorySettings: (repositoryId: string) => Promise<RepositoryAgentSettings>;
  readonly patchRepositorySettings: (
    repositoryId: string,
    patch: RepositoryAgentSettingsPatch,
  ) => Promise<RepositoryAgentSettings>;
  readonly getDelegate: (repositoryId: string, ticketId: string) => Promise<AgentDelegate | null>;
  readonly putDelegate: (
    repositoryId: string,
    ticketId: string,
    input: AgentDelegateInput,
  ) => Promise<AgentDelegate>;
  readonly createDelegateJob: (
    repositoryId: string,
    ticketId: string,
    input: AgentDelegateJobInput,
  ) => Promise<AgentDelegateJob>;
  readonly deleteDelegate: (repositoryId: string, ticketId: string) => Promise<boolean>;
  readonly createJob: (input: AgentJobCreateInput) => Promise<AgentJob>;
  readonly listJobs: (query?: AgentJobListQuery) => Promise<readonly AgentJob[]>;
  readonly getJob: (jobId: string) => Promise<AgentJob | null>;
  readonly getJobLog: (jobId: string) => Promise<AgentJobLog | null>;
  readonly recordJobActivity: (activity: AgentJobActivityInput) => Promise<void>;
  readonly completeJob: (
    jobId: string,
    input?: {
      readonly message?: string;
      readonly payload?: Readonly<Record<string, unknown>>;
      readonly actor?: string;
    },
  ) => Promise<AgentJob | null>;
  readonly failJob: (jobId: string, failure: AgentJobFailureInput) => Promise<AgentJob | null>;
  readonly markJobWaitingForInput: (
    jobId: string,
    input: AgentJobWaitingInput,
  ) => Promise<AgentJob | null>;
  readonly resumeJob: (jobId: string, requestedBy?: string) => Promise<AgentJob | null>;
  readonly cancelJob: (
    jobId: string,
    reason?: string,
    requestedBy?: string,
  ) => Promise<AgentJob | null>;
  readonly attachWorktree: (worktree: AgentWorktreeInput) => Promise<AgentJob | null>;
  readonly attachBranchAssociation: (
    association: AgentBranchAssociationInput,
  ) => Promise<AgentJob | null>;
  readonly listActivity: (query?: AgentActivityQuery) => Promise<readonly AgentActivity[]>;
  readonly emit: (event: AgentWorkEventInput) => Promise<AgentActivity>;
  readonly evaluateAssignmentPickup: (input: {
    readonly repositoryId: string;
    readonly ticketId: string;
    readonly ticketStatus?: string;
    readonly requestedBy?: string;
  }) => Promise<AgentJob | null>;
  readonly handleSuccessfulComment: (input: {
    readonly repositoryId: string;
    readonly ticketId: string;
    readonly commentId: string;
    readonly body: string;
    readonly actor?: unknown;
    readonly source?: string;
  }) => Promise<readonly AgentJob[]>;
};

const defaultSettings: AgentSettings = {
  allowDisposableWorktreeForMentions: true,
  allowFullAccessJobs: false,
  defaultMentionAuthorityMode: "ticket-context",
  defaultModel: null,
  defaultProviderId: "codex",
  enabledProviders: ["codex"],
  maxConcurrentJobs: 1,
  paused: false,
  perAgentOverrides: {},
};

const terminalStatuses: ReadonlySet<AgentJobStatus> = new Set(["completed", "failed", "cancelled"]);

export const makeInMemoryAgentWorkRuntime = (options: { readonly now?: () => Date } = {}) => {
  const now = () => (options.now ?? (() => new Date()))().toISOString();
  let settings = defaultSettings;
  let sequence = 0;
  const repositorySettings = new Map<string, RepositoryAgentSettings>();
  const delegates = new Map<string, AgentDelegate>();
  const jobs = new Map<string, AgentJob>();
  const activity: AgentActivity[] = [];

  const runtime: AgentWorkRuntimeShape = {
    cancelJob: async (jobId, reason, requestedBy = "local-user") => {
      const job = jobs.get(jobId);
      if (job === undefined) return null;
      const updated = updateJob(job, {
        completedAt: now(),
        lastError: reason ?? null,
        metadata: { ...job.metadata, cancelRequestedBy: requestedBy },
        status: "cancelled",
      });
      await runtime.emit(jobStatusEvent(updated, "cancel"));
      return updated;
    },
    createJob: async (input) => {
      const existing = [...jobs.values()].find(
        (job) => job.logicalJobKey === input.logicalJobKey && !terminalStatuses.has(job.status),
      );
      if (existing !== undefined) return existing;

      const timestamp = now();
      const job: AgentJob = {
        agentId: input.agentId,
        attempt: 0,
        authorityMode: input.authorityMode,
        branchAssociationId: null,
        completedAt: null,
        createdAt: timestamp,
        currentGate: null,
        dedupeKey: input.dedupeKey ?? input.logicalJobKey,
        executionId: id("agent_exec"),
        jobId: id("agent_job"),
        lastError: null,
        lastHeartbeatAt: null,
        lastProviderEventAt: null,
        logicalJobKey: input.logicalJobKey,
        maxAttempts: 3,
        metadata: input.metadata ?? {},
        model: input.model ?? null,
        providerId: input.providerId ?? settings.defaultProviderId,
        providerSessionId: null,
        repositoryId: input.repositoryId,
        requestedBy: input.requestedBy,
        schemaVersion: 1,
        startedAt: null,
        status: "queued",
        ticketId: input.ticketId,
        trigger: input.trigger,
        updatedAt: timestamp,
        workflowId: null,
        worktreeId: null,
      };
      jobs.set(job.jobId, job);
      await runtime.emit({
        dedupeKey: job.dedupeKey,
        eventType: "local.agent_job_created",
        jobId: job.jobId,
        payload: { job },
        repositoryId: job.repositoryId,
        source: "agent-work-runtime",
        ticketId: job.ticketId,
      });
      return job;
    },
    createDelegateJob: async (repositoryId, ticketId, input) => {
      const delegate = await runtime.putDelegate(repositoryId, ticketId, input);
      const logicalJobKey = [
        "delegate",
        repositoryId,
        ticketId,
        delegate.agentId,
        delegate.assignmentVersion,
      ].join(":");
      const job = await runtime.createJob({
        agentId: delegate.agentId,
        authorityMode: "implementation-worktree",
        dedupeKey: logicalJobKey,
        logicalJobKey,
        metadata: {
          assignmentVersion: delegate.assignmentVersion,
          ...(delegate.notes === null ? {} : { notes: delegate.notes }),
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
      return { delegate, job };
    },
    completeJob: async (jobId, input = {}) => {
      const job = jobs.get(jobId);
      if (job === undefined) return null;
      if (terminalStatuses.has(job.status)) return job;
      if (input.message !== undefined) {
        await runtime.recordJobActivity({
          jobId,
          kind: "completion",
          message: input.message,
          payload: input.payload,
        });
      }
      const updated = updateJob(job, {
        completedAt: now(),
        lastError: null,
        metadata: { ...job.metadata, completedBy: input.actor ?? "workflow" },
        status: "completed",
      });
      await runtime.emit(jobStatusEvent(updated, "complete"));
      return updated;
    },
    deleteDelegate: async (repositoryId, ticketId) => {
      const key = delegateKey(repositoryId, ticketId);
      const current = delegates.get(key);
      const deleted = delegates.delete(key);
      if (deleted) {
        await runtime.emit({
          dedupeKey: key,
          eventType: "local.agent_delegate_changed",
          payload: { action: "deleted", delegate: current ?? null },
          repositoryId,
          source: "agent-work-runtime",
          ticketId,
        });
      }
      return deleted;
    },
    emit: async (event) => {
      const record: AgentActivity = {
        actor: event.actor,
        dedupeKey: event.dedupeKey ?? null,
        eventId: event.eventId ?? id("evt"),
        eventType: event.eventType,
        eventVersion: event.eventVersion ?? 1,
        jobId: event.jobId ?? null,
        occurredAt: event.occurredAt ?? now(),
        payload: event.payload,
        repositoryId: event.repositoryId ?? null,
        sequence: ++sequence,
        source: event.source,
        ticketId: event.ticketId ?? null,
      };
      activity.push(record);
      return record;
    },
    attachBranchAssociation: async (association) => {
      const job = jobs.get(association.jobId);
      if (job === undefined) return null;
      const updated = updateJob(job, {
        branchAssociationId: association.branchAssociationId,
        metadata: {
          ...job.metadata,
          branchAssociationId: association.branchAssociationId,
          branchName: association.branchName,
          branchRef: association.branchRef,
          commitSha: association.headSha ?? null,
        },
      });
      await runtime.emit({
        dedupeKey: `branch:${association.branchAssociationId}:${association.updatedAt}`,
        eventType: "git.branch_updated",
        jobId: job.jobId,
        payload: { association },
        repositoryId: job.repositoryId,
        source: "agent-work-runtime",
        ticketId: job.ticketId,
      });
      return updated;
    },
    attachWorktree: async (worktree) => {
      const job = jobs.get(worktree.jobId);
      if (job === undefined) return null;
      const updated = updateJob(job, {
        metadata: {
          ...job.metadata,
          baseRef: worktree.baseRef ?? null,
          baseSha: worktree.baseSha ?? null,
          branchName: worktree.branchName ?? null,
          branchRef: worktree.branchRef ?? null,
          worktreePath: worktree.path,
          worktreeStatus: worktree.status,
        },
        worktreeId: worktree.worktreeId,
      });
      await runtime.emit({
        dedupeKey: `worktree:${worktree.worktreeId}:${worktree.updatedAt}`,
        eventType: "local.worktree_created",
        jobId: job.jobId,
        payload: { worktree },
        repositoryId: job.repositoryId,
        source: "agent-work-runtime",
        ticketId: job.ticketId,
      });
      return updated;
    },
    evaluateAssignmentPickup: async (input) => {
      if (input.ticketStatus !== "todo") return null;
      const delegate = delegates.get(delegateKey(input.repositoryId, input.ticketId));
      if (delegate === undefined || !delegate.enabled) return null;

      const logicalJobKey = [
        "assignment",
        input.repositoryId,
        input.ticketId,
        delegate.agentId,
        delegate.assignmentVersion,
      ].join(":");

      return runtime.createJob({
        agentId: delegate.agentId,
        authorityMode: "implementation-worktree",
        dedupeKey: logicalJobKey,
        logicalJobKey,
        metadata: {
          assignmentVersion: delegate.assignmentVersion,
          ticketStatus: input.ticketStatus,
        },
        model: delegate.model,
        providerId: delegate.providerId,
        repositoryId: input.repositoryId,
        requestedBy: input.requestedBy ?? "assignment-pickup",
        ticketId: input.ticketId,
        trigger: "assignment-pickup",
      });
    },
    failJob: async (jobId, failure) => {
      const job = jobs.get(jobId);
      if (job === undefined) return null;
      if (terminalStatuses.has(job.status)) return job;
      await runtime.recordJobActivity({
        jobId,
        kind: "error",
        message: failure.message,
        payload: {
          code: failure.code ?? "provider-turn-failed",
          remediation: failure.remediation,
          retrySafe: failure.retrySafe,
        },
      });
      const updated = updateJob(job, {
        completedAt: now(),
        lastError: failure.message,
        metadata: {
          ...job.metadata,
          failedBy: failure.actor ?? "workflow",
          failureCode: failure.code ?? "provider-turn-failed",
        },
        status: "failed",
      });
      await runtime.emit(jobStatusEvent(updated, "fail"));
      return updated;
    },
    getDelegate: async (repositoryId, ticketId) =>
      delegates.get(delegateKey(repositoryId, ticketId)) ?? null,
    getJob: async (jobId) => jobs.get(jobId) ?? null,
    getJobLog: async (jobId) => {
      const job = jobs.get(jobId);
      if (job === undefined) return null;
      return {
        entries: activity
          .filter((entry) => entry.jobId === jobId)
          .map((entry) => ({
            actor: agentWorkActorName(entry.actor),
            entryId: entry.eventId,
            kind: "event" as const,
            message: entry.eventType,
            occurredAt: entry.occurredAt,
            payload: entry.payload,
            source: entry.source,
            title: entry.eventType,
          })),
        job,
      };
    },
    getRepositorySettings: async (repositoryId) =>
      repositorySettings.get(repositoryId) ?? defaultRepositorySettings(repositoryId, now()),
    getSettings: async () => settings,
    handleSuccessfulComment: async (input) => {
      const mentions = parseStructuredAgentMentions(input.body);
      const created: AgentJob[] = [];
      for (const agentId of mentions) {
        const logicalJobKey = mentionLogicalJobKey({
          agentId,
          commentId: input.commentId,
          repositoryId: input.repositoryId,
          ticketId: input.ticketId,
        });
        const job = await runtime.createJob({
          agentId,
          authorityMode: settings.defaultMentionAuthorityMode,
          logicalJobKey,
          metadata: { commentBody: input.body, commentId: input.commentId },
          repositoryId: input.repositoryId,
          requestedBy: "comment-mention",
          ticketId: input.ticketId,
          trigger: "agent-mention",
        });
        created.push(job);
      }
      return created;
    },
    listActivity: async (query = {}) => {
      const after = query.after ?? 0;
      const limit = query.limit ?? 100;
      return activity
        .filter((event) => event.sequence > after)
        .filter(
          (event) => query.repositoryId === undefined || event.repositoryId === query.repositoryId,
        )
        .slice(0, limit);
    },
    listJobs: async (query = {}) =>
      [...jobs.values()]
        .filter(
          (job) => query.repositoryId === undefined || job.repositoryId === query.repositoryId,
        )
        .filter((job) => query.ticketId === undefined || job.ticketId === query.ticketId)
        .filter((job) => query.status === undefined || job.status === query.status)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    markJobWaitingForInput: async (jobId, input) => {
      const job = jobs.get(jobId);
      if (job === undefined) return null;
      if (terminalStatuses.has(job.status)) return job;
      await runtime.recordJobActivity({
        jobId,
        kind: "question",
        message: input.message,
        payload: input.payload,
      });
      const updated = updateJob(job, {
        lastError: input.message,
        metadata: { ...job.metadata, waitingRequestedBy: input.actor ?? "provider" },
        status: "waiting-for-input",
      });
      await runtime.emit(jobStatusEvent(updated, "wait"));
      return updated;
    },
    patchRepositorySettings: async (repositoryId, patch) => {
      const current =
        repositorySettings.get(repositoryId) ?? defaultRepositorySettings(repositoryId, now());
      const next = {
        ...current,
        ...patch,
        repositoryId,
        updatedAt: now(),
      };
      validateRepositorySettings(next);
      repositorySettings.set(repositoryId, next);
      await runtime.emit({
        dedupeKey: `repository-settings:${repositoryId}:${next.updatedAt}`,
        eventType: "local.agent_settings_changed",
        payload: { repositorySettings: next },
        repositoryId,
        source: "agent-work-runtime",
      });
      return next;
    },
    patchSettings: async (patch) => {
      const next = {
        ...settings,
        ...patch,
        perAgentOverrides: patch.perAgentOverrides ?? settings.perAgentOverrides,
      };
      validateSettings(next);
      settings = next;
      await runtime.emit({
        dedupeKey: `global-settings:${now()}`,
        eventType: "local.agent_settings_changed",
        payload: { settings },
        source: "agent-work-runtime",
      });
      return settings;
    },
    putDelegate: async (repositoryId, ticketId, input) => {
      const key = delegateKey(repositoryId, ticketId);
      const current = delegates.get(key);
      const timestamp = now();
      const delegate: AgentDelegate = {
        agentId: input.agentId,
        assignedBy: input.assignedBy ?? "local-user",
        assignmentVersion: (current?.assignmentVersion ?? 0) + 1,
        createdAt: current?.createdAt ?? timestamp,
        enabled: input.enabled ?? true,
        model: input.model ?? null,
        notes: input.notes ?? null,
        providerId: input.providerId ?? settings.defaultProviderId,
        repositoryId,
        ticketId,
        updatedAt: timestamp,
      };
      delegates.set(key, delegate);
      await runtime.emit({
        dedupeKey: `${key}:${delegate.assignmentVersion}`,
        eventType: "local.agent_delegate_changed",
        payload: { action: current === undefined ? "created" : "updated", delegate },
        repositoryId,
        source: "agent-work-runtime",
        ticketId,
      });
      return delegate;
    },
    recordJobActivity: async (input) => {
      const job = jobs.get(input.jobId);
      if (job === undefined) return;
      await runtime.emit({
        dedupeKey: `${input.jobId}:activity:${id("activity")}`,
        eventType: "local.workflow_checkpointed",
        jobId: input.jobId,
        payload: {
          kind: input.kind,
          message: input.message,
          ...(input.payload === undefined ? {} : { payload: input.payload }),
        },
        repositoryId: job.repositoryId,
        source: "agent-work-runtime",
        ticketId: job.ticketId,
      });
      updateJob(job, { lastProviderEventAt: now() });
    },
    resumeJob: async (jobId, requestedBy = "local-user") => {
      const job = jobs.get(jobId);
      if (job === undefined) return null;
      const updated = updateJob(job, {
        completedAt: null,
        lastError: null,
        metadata: { ...job.metadata, resumeRequestedBy: requestedBy },
        status: "queued",
      });
      await runtime.emit(jobStatusEvent(updated, "resume"));
      return updated;
    },
  };

  const updateJob = (job: AgentJob, patch: Partial<AgentJob>): AgentJob => {
    const updated = {
      ...job,
      ...patch,
      updatedAt: now(),
    };
    jobs.set(updated.jobId, updated);
    return updated;
  };

  return runtime;
};

const agentWorkActorName = (actor: unknown): string => {
  if (typeof actor === "string" && actor.trim().length > 0) return actor;
  if (typeof actor === "object" && actor !== null) {
    const name = (actor as { readonly name?: unknown }).name;
    if (typeof name === "string" && name.trim().length > 0) return name;
  }
  return "api";
};

export const parseStructuredAgentMentions = (body: string): readonly string[] => {
  const ids = new Set<string>();
  const pattern = /\bcycle-agent:([A-Za-z0-9][A-Za-z0-9._-]{0,127})\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    ids.add(match[1]!);
  }
  return [...ids];
};

export const mentionLogicalJobKey = (input: {
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly commentId: string;
  readonly agentId: string;
}): string => `mention:${input.repositoryId}:${input.ticketId}:${input.commentId}:${input.agentId}`;

const delegateKey = (repositoryId: string, ticketId: string): string =>
  `${repositoryId}:${ticketId}`;

const defaultRepositorySettings = (
  repositoryId: string,
  updatedAt: string,
): RepositoryAgentSettings => ({
  agentWorkDisabled: false,
  maxConcurrentJobs: 1,
  model: null,
  paused: false,
  perAgentOverrides: {},
  providerId: null,
  repositoryId,
  updatedAt,
});

const validateSettings = (settings: AgentSettings): void => {
  if (settings.maxConcurrentJobs < 1) throw new Error("maxConcurrentJobs must be at least 1.");
  if (
    !["ticket-context", "disposable-worktree", "implementation-worktree"].includes(
      settings.defaultMentionAuthorityMode,
    )
  ) {
    throw new Error("defaultMentionAuthorityMode is invalid.");
  }
  if (settings.defaultProviderId.length === 0) throw new Error("defaultProviderId is required.");
};

const validateRepositorySettings = (settings: RepositoryAgentSettings): void => {
  if (settings.maxConcurrentJobs < 1) throw new Error("maxConcurrentJobs must be at least 1.");
};

const jobStatusEvent = (job: AgentJob, action: string): AgentWorkEventInput => ({
  dedupeKey: `${job.jobId}:${action}:${job.updatedAt}`,
  eventType: "local.agent_job_status_changed",
  jobId: job.jobId,
  payload: { action, job },
  repositoryId: job.repositoryId,
  source: "agent-work-runtime",
  ticketId: job.ticketId,
});

const id = (prefix: string): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
};
