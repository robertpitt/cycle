import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";

export type TicketTypeId = "bug" | "epic" | "feature" | "task";

export type AgentAuthorityMode =
  | "disposable-worktree"
  | "implementation-worktree"
  | "ticket-context";

export type AgentJobStatus =
  | "cancelled"
  | "cancelling"
  | "completed"
  | "failed"
  | "queued"
  | "resuming"
  | "retry-wait"
  | "running"
  | "starting"
  | "suspended"
  | "suspending"
  | "waiting-for-input";

export type AgentWorkJob = {
  readonly agentId: string;
  readonly attempt?: number;
  readonly authorityMode?: AgentAuthorityMode | string;
  readonly branchAssociationId?: string | null;
  readonly completedAt?: string | null;
  readonly createdAt?: string;
  readonly currentGate?: string | null;
  readonly jobId: string;
  readonly lastError?: string | null;
  readonly lastProviderEventAt?: string | null;
  readonly lastProviderEventSummary?: string | null;
  readonly maxAttempts?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly model?: string | null;
  readonly providerId?: string;
  readonly providerSessionId?: string | null;
  readonly repositoryId: string;
  readonly startedAt?: string | null;
  readonly status: AgentJobStatus | string;
  readonly ticketId?: string | null;
  readonly trigger?: string;
  readonly updatedAt?: string;
  readonly worktreeId?: string | null;
};

export type AgentDelegate = {
  readonly agentId: string;
  readonly assignedBy?: string;
  readonly assignmentVersion?: number;
  readonly createdAt?: string;
  readonly enabled: boolean;
  readonly model?: string | null;
  readonly notes?: string | null;
  readonly providerId: string;
  readonly repositoryId: string;
  readonly ticketId: string;
  readonly updatedAt?: string;
};

export type StartAgentDelegateJobInput = {
  readonly agentId: string;
  readonly instructions?: string | null;
  readonly model?: string | null;
  readonly notes?: string | null;
  readonly providerId?: string;
};

export type AgentDelegateJobResult = {
  readonly delegate: AgentDelegate;
  readonly job: AgentWorkJob;
};

export type AgentSettings = {
  readonly allowDisposableWorktreeForMentions: boolean;
  readonly allowFullAccessJobs: boolean;
  readonly defaultMentionAuthorityMode: AgentAuthorityMode;
  readonly defaultModel?: string | null;
  readonly defaultProviderId: string;
  readonly enabledProviders: readonly string[];
  readonly maxConcurrentJobs: number | null;
  readonly paused: boolean;
  readonly perAgentOverrides?: Readonly<Record<string, unknown>>;
};

export type AgentSettingsPatch = Partial<AgentSettings>;

export type RepositoryAgentSettings = {
  readonly agentWorkDisabled: boolean;
  readonly errorCount?: number;
  readonly failedJobCount?: number;
  readonly health?: string;
  readonly maxConcurrentJobs: number | null;
  readonly model?: string | null;
  readonly paused: boolean;
  readonly providerId?: string | null;
  readonly queuedJobCount?: number;
  readonly repositoryId: string;
  readonly runningJobCount?: number;
  readonly updatedAt?: string;
  readonly waitingJobCount?: number;
};

export type RepositoryAgentSettingsPatch = Partial<
  Omit<RepositoryAgentSettings, "repositoryId" | "updatedAt">
>;

export type AgentActivity = {
  readonly failedCount: number;
  readonly globalPaused: boolean;
  readonly jobs: readonly AgentWorkJob[];
  readonly queuedCount: number;
  readonly runningCount: number;
  readonly suspendedCount: number;
  readonly waitingCount: number;
};

export type AgentJobLogEntry = {
  readonly actor?: string | null;
  readonly entryId: string;
  readonly kind: "activity" | "checkpoint" | "event" | "status" | string;
  readonly message: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly source?: string | null;
  readonly status?: string | null;
  readonly title: string;
};

export type AgentJobLog = {
  readonly entries: readonly AgentJobLogEntry[];
  readonly job: AgentWorkJob;
};

const visibleActivityStatuses = new Set<string>([
  "cancelling",
  "failed",
  "queued",
  "resuming",
  "retry-wait",
  "running",
  "starting",
  "suspended",
  "suspending",
  "waiting-for-input",
]);

export const canonicalTicketTypes = [
  {
    description: "Large outcome or parent workstream",
    id: "epic",
    label: "Epic",
  },
  {
    description: "New user-facing capability",
    id: "feature",
    label: "Feature",
  },
  {
    description: "Incorrect behavior or regression",
    id: "bug",
    label: "Bug",
  },
  {
    description: "Implementation or maintenance work",
    id: "task",
    label: "Task",
  },
] as const satisfies ReadonlyArray<{
  readonly description: string;
  readonly id: TicketTypeId;
  readonly label: string;
}>;

export const agentAuthorityModeItems = [
  {
    label: "Ticket context",
    value: "ticket-context",
  },
  {
    disabled: true,
    label: "Disposable worktree unavailable",
    value: "disposable-worktree",
  },
  {
    disabled: true,
    label: "Implementation worktree unavailable",
    value: "implementation-worktree",
  },
] as const;

export const defaultAgentSettings = (
  providers: readonly DetectedAgentProvider[] = [],
): AgentSettings => {
  const providerIds = providers.map((provider) => provider.id);
  const availableProvider = providers.find((provider) => provider.status === "available");
  const codexProvider = providerIds.includes("codex") ? "codex" : providerIds[0];

  return {
    allowDisposableWorktreeForMentions: true,
    allowFullAccessJobs: false,
    defaultMentionAuthorityMode: "ticket-context",
    defaultModel: null,
    defaultProviderId: availableProvider?.id ?? codexProvider ?? "codex",
    enabledProviders: availableProvider ? [availableProvider.id] : providerIds,
    maxConcurrentJobs: 1,
    paused: false,
  };
};

export const isCanonicalTicketType = (value: string | undefined): value is TicketTypeId =>
  value === "bug" || value === "epic" || value === "feature" || value === "task";

export const normalizeCreateTicketType = (value: string | undefined): TicketTypeId | undefined => {
  if (isCanonicalTicketType(value)) return value;
  if (value === "initiative") return "epic";
  if (value === "issue") return "task";
  return undefined;
};

export const ticketTypeLabel = (value: string | null | undefined): string => {
  const canonical = normalizeCreateTicketType(value ?? undefined);
  if (canonical) {
    return canonicalTicketTypes.find((type) => type.id === canonical)?.label ?? canonical;
  }
  return value && value.trim().length > 0 ? value : "Missing legacy type";
};

export const jobStatusTone = (
  status: string,
): "danger" | "info" | "neutral" | "success" | "warning" => {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
    case "cancelled":
      return "danger";
    case "retry-wait":
    case "suspended":
    case "suspending":
    case "waiting-for-input":
      return "warning";
    case "queued":
      return "neutral";
    default:
      return "info";
  }
};

export const statusLabel = (value: string): string =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asNullableString = (value: unknown): string | null | undefined =>
  value === null ? null : asString(value);

const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const asConcurrencyLimit = (value: unknown): number | null | undefined =>
  value === null ? null : asNumber(value);

const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

const asStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

export const parseAgentSettings = (
  value: unknown,
  providers: readonly DetectedAgentProvider[] = [],
): AgentSettings => {
  const record = asRecord(value);
  const defaults = defaultAgentSettings(providers);
  const authority = asString(record.defaultMentionAuthorityMode);
  const maxConcurrentJobs = asConcurrencyLimit(record.maxConcurrentJobs);

  return {
    allowDisposableWorktreeForMentions:
      asBoolean(record.allowDisposableWorktreeForMentions) ??
      defaults.allowDisposableWorktreeForMentions,
    allowFullAccessJobs: asBoolean(record.allowFullAccessJobs) ?? defaults.allowFullAccessJobs,
    defaultMentionAuthorityMode: authority === "ticket-context" ? authority : "ticket-context",
    defaultModel: asNullableString(record.defaultModel) ?? defaults.defaultModel,
    defaultProviderId: asString(record.defaultProviderId) ?? defaults.defaultProviderId,
    enabledProviders:
      asStringArray(record.enabledProviders).length > 0
        ? asStringArray(record.enabledProviders)
        : defaults.enabledProviders,
    maxConcurrentJobs:
      maxConcurrentJobs === undefined ? defaults.maxConcurrentJobs : maxConcurrentJobs,
    paused: asBoolean(record.paused) ?? defaults.paused,
    perAgentOverrides: asRecord(record.perAgentOverrides),
  };
};

export const parseRepositoryAgentSettings = (
  value: unknown,
  repositoryId: string,
): RepositoryAgentSettings => {
  const record = asRecord(value);
  const maxConcurrentJobs = asConcurrencyLimit(record.maxConcurrentJobs);

  return {
    agentWorkDisabled: asBoolean(record.agentWorkDisabled) ?? false,
    errorCount: asNumber(record.errorCount),
    failedJobCount: asNumber(record.failedJobCount),
    health: asString(record.health),
    maxConcurrentJobs: maxConcurrentJobs === undefined ? 1 : maxConcurrentJobs,
    model: asNullableString(record.model),
    paused: asBoolean(record.paused) ?? false,
    providerId: asNullableString(record.providerId),
    queuedJobCount: asNumber(record.queuedJobCount),
    repositoryId: asString(record.repositoryId) ?? repositoryId,
    runningJobCount: asNumber(record.runningJobCount),
    updatedAt: asString(record.updatedAt),
    waitingJobCount: asNumber(record.waitingJobCount),
  };
};

export const parseAgentJob = (value: unknown): AgentWorkJob | null => {
  const record = asRecord(value);
  const jobId = asString(record.jobId);
  const repositoryId = asString(record.repositoryId);
  const agentId = asString(record.agentId);
  const status = asString(record.status);
  if (!jobId || !repositoryId || !agentId || !status) return null;

  return {
    agentId,
    attempt: asNumber(record.attempt),
    authorityMode: asString(record.authorityMode),
    branchAssociationId: asNullableString(record.branchAssociationId),
    completedAt: asNullableString(record.completedAt),
    createdAt: asString(record.createdAt),
    currentGate: asNullableString(record.currentGate),
    jobId,
    lastError: asNullableString(record.lastError),
    lastProviderEventAt: asNullableString(record.lastProviderEventAt),
    lastProviderEventSummary: asNullableString(record.lastProviderEventSummary),
    maxAttempts: asNumber(record.maxAttempts),
    metadata: asRecord(record.metadata),
    model: asNullableString(record.model),
    providerId: asString(record.providerId),
    providerSessionId: asNullableString(record.providerSessionId),
    repositoryId,
    startedAt: asNullableString(record.startedAt),
    status,
    ticketId: asNullableString(record.ticketId),
    trigger: asString(record.trigger),
    updatedAt: asString(record.updatedAt),
    worktreeId: asNullableString(record.worktreeId),
  };
};

export const parseAgentDelegate = (value: unknown): AgentDelegate | null => {
  const record = asRecord(value);
  const repositoryId = asString(record.repositoryId);
  const ticketId = asString(record.ticketId);
  const agentId = asString(record.agentId);
  const providerId = asString(record.providerId);
  if (!repositoryId || !ticketId || !agentId || !providerId) return null;

  return {
    agentId,
    assignedBy: asString(record.assignedBy),
    assignmentVersion: asNumber(record.assignmentVersion),
    createdAt: asString(record.createdAt),
    enabled: asBoolean(record.enabled) ?? true,
    model: asNullableString(record.model),
    notes: asNullableString(record.notes),
    providerId,
    repositoryId,
    ticketId,
    updatedAt: asString(record.updatedAt),
  };
};

export const parseAgentDelegateJobResult = (value: unknown): AgentDelegateJobResult | null => {
  const record = asRecord(value);
  const delegate = parseAgentDelegate(record.delegate);
  const job = parseAgentJob(record.job);
  if (delegate === null || job === null) return null;
  return { delegate, job };
};

const parseAgentJobLogEntry = (value: unknown): AgentJobLogEntry | null => {
  const record = asRecord(value);
  const entryId = asString(record.entryId);
  const kind = asString(record.kind);
  const message = asString(record.message);
  const occurredAt = asString(record.occurredAt);
  const title = asString(record.title);
  if (!entryId || !kind || !message || !occurredAt || !title) return null;

  return {
    actor: asNullableString(record.actor),
    entryId,
    kind,
    message,
    occurredAt,
    payload: asRecord(record.payload),
    source: asNullableString(record.source),
    status: asNullableString(record.status),
    title,
  };
};

export const parseAgentJobLog = (value: unknown): AgentJobLog | null => {
  const record = asRecord(value);
  const job = parseAgentJob(record.job);
  if (job === null) return null;

  return {
    entries: Array.isArray(record.entries)
      ? record.entries.flatMap((entry) => {
          const parsed = parseAgentJobLogEntry(entry);
          return parsed === null ? [] : [parsed];
        })
      : [],
    job,
  };
};

export const summarizeAgentActivity = (
  values: Iterable<unknown>,
  input: { readonly globalPaused?: boolean } = {},
): AgentActivity => {
  const jobsById = new Map<string, AgentWorkJob>();
  for (const value of values) {
    const job = parseAgentJob(value);
    if (job !== null) jobsById.set(job.jobId, job);
  }

  const jobs = [...jobsById.values()].filter((job) => visibleActivityStatuses.has(job.status));

  return {
    failedCount: jobs.filter((job) => job.status === "failed").length,
    globalPaused: input.globalPaused ?? false,
    jobs,
    queuedCount: jobs.filter((job) => job.status === "queued").length,
    runningCount: jobs.filter((job) =>
      ["cancelling", "resuming", "running", "starting", "suspending"].includes(job.status),
    ).length,
    suspendedCount: jobs.filter((job) => job.status === "suspended").length,
    waitingCount: jobs.filter(
      (job) => job.status === "retry-wait" || job.status === "waiting-for-input",
    ).length,
  };
};

export const parseAgentActivity = (value: unknown): AgentActivity => {
  const record = asRecord(value);
  const rawEntries = Array.isArray(value)
    ? value
    : Array.isArray(record.jobs)
      ? record.jobs
      : Array.isArray(record.data)
        ? record.data
        : [];
  const rawJobs = rawEntries.flatMap((entry) => {
    const direct = parseAgentJob(entry);
    if (direct !== null) return [direct];
    const event = asRecord(entry);
    const fromPayload = parseAgentJob(event.payload);
    return fromPayload === null ? [] : [fromPayload];
  });
  const activity = summarizeAgentActivity(rawJobs, {
    globalPaused: asBoolean(record.globalPaused) ?? asBoolean(record.paused),
  });

  return {
    failedCount: asNumber(record.failedCount) ?? activity.failedCount,
    globalPaused: activity.globalPaused,
    jobs: activity.jobs,
    queuedCount: asNumber(record.queuedCount) ?? activity.queuedCount,
    runningCount: asNumber(record.runningCount) ?? activity.runningCount,
    suspendedCount: asNumber(record.suspendedCount) ?? activity.suspendedCount,
    waitingCount: asNumber(record.waitingCount) ?? activity.waitingCount,
  };
};
