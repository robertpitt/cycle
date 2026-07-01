import { ViewIssue, type ViewIssueActivityEvent, type ViewIssueComment } from "@cycle/ui/organisms";
import { Button, DateTime, Input, Select, StatusIndicator, Textarea } from "@cycle/ui/atoms";
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseButton,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogViewport,
  IssueAssigneeMark,
  IssuePriorityMark,
  IssuePropertyOptionMenu,
  IssuePropertyPopover,
  IssueStatusMark,
  PanelState,
  type IssuePropertyMenuOption,
} from "@cycle/ui/molecules";
import { BarChart3, CalendarDays, Gauge } from "lucide-react";
import * as React from "react";
import type {
  CreateTicketInput,
  HistoryCommit,
  LinkedRecord,
  TicketDocument,
} from "@cycle/contracts";
import {
  useAddIssueCommentMutation,
  useCancelAgentJobMutation,
  useCreateIssueMutation,
  useResumeAgentJobMutation,
  useStartIssueAgentDelegateJobMutation,
  useUpdateIssueMutation,
} from "../mutations/index.ts";
import {
  useAgentJobsQuery,
  useInitiativeProgressQuery,
  useIssueAgentDelegateQuery,
  useIssueDetailQuery,
  useIssueHistoryQuery,
  useIssueListQuery,
  useIssueRecordsQuery,
  useLabelListQuery,
  useUserListQuery,
} from "../queries/index.ts";
import { createMarkdownTagSuggestions } from "../lib/markdownTagSuggestions.ts";
import { labelColorClassName } from "../screens/workspace/createIssueOptions.tsx";
import type { RepositoryRecord } from "../../shared/AppConfig.ts";
import type { DetectedAgentProvider } from "../../shared/AgentProviders.ts";
import {
  jobStatusTone,
  statusLabel,
  type AgentDelegate,
  type AgentWorkJob,
} from "../lib/agentWork.ts";

type ViewIssuePanelProps = {
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly issueId?: string;
  readonly repositories?: readonly RepositoryRecord[];
  readonly repositoryId?: string;
};

const initialsForName = (name: string): string =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const formatDate = (value: string | undefined): React.ReactNode => {
  if (!value) return undefined;

  return <DateTime dateStyle="short" fallback={value} format="date" value={value} />;
};

const formatActivityTimestamp = (value: string | undefined): React.ReactNode => {
  if (!value) return undefined;

  return (
    <DateTime
      dateStyle="medium"
      fallback={value}
      format="datetime"
      timeStyle="short"
      value={value}
    />
  );
};

const getCommentBody = (record: LinkedRecord): string => {
  if (
    record.payload !== null &&
    typeof record.payload === "object" &&
    "body" in record.payload &&
    typeof record.payload.body === "string"
  ) {
    return record.payload.body;
  }

  return "";
};

const authorFromName = (name: string) => ({
  initials: initialsForName(name),
  name,
});

const commentFromRecord = (record: LinkedRecord): ViewIssueComment => ({
  author: authorFromName(record.createdBy.name),
  body: getCommentBody(record),
  id: record.id,
  occurredAt: record.createdAt,
  timestamp: formatActivityTimestamp(record.createdAt),
});

const externalLinkTitle = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const issueResources = (issue: TicketDocument) =>
  (issue.frontmatter.externalLinks ?? []).map((link) => ({
    description: link.url,
    id: link.url,
    meta: "Link",
    title: link.title ?? link.source ?? externalLinkTitle(link.url),
  }));

const sentenceFragment = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;

  return `${trimmed[0]?.toLowerCase() ?? ""}${trimmed.slice(1)}`;
};

const historyMessageFragment = (entry: HistoryCommit): string => {
  const message = entry.message?.trim();
  if (!message) return "updated the issue";

  if (entry.authorName) {
    const prefix = `${entry.authorName} `;
    if (message.startsWith(prefix)) {
      return message.slice(prefix.length);
    }
  }

  return sentenceFragment(message);
};

const isCommentHistoryEntry = (entry: HistoryCommit): boolean => {
  const fragment = historyMessageFragment(entry).toLowerCase();
  return fragment.startsWith("commented on ") || fragment.includes(" commented on ");
};

const isCreatedHistoryEntry = (entry: HistoryCommit): boolean =>
  historyMessageFragment(entry).toLowerCase().startsWith("created ");

const issueCreatedActivity = (issue: TicketDocument): ViewIssueActivityEvent => ({
  author: authorFromName(issue.frontmatter.createdBy.name),
  body: "created the issue",
  id: `${issue.id}:created`,
  occurredAt: issue.frontmatter.createdAt,
  timestamp: formatActivityTimestamp(issue.frontmatter.createdAt),
});

const issueActivity = (
  issue: TicketDocument,
  historyEntries: readonly HistoryCommit[],
): readonly ViewIssueActivityEvent[] => {
  const historyEvents = historyEntries
    .filter((entry) => !isCommentHistoryEntry(entry))
    .map((entry) => {
      const authorName = entry.authorName ?? entry.authorEmail ?? issue.frontmatter.createdBy.name;

      return {
        author: authorFromName(authorName),
        body: historyMessageFragment(entry),
        id: entry.snapshotId,
        occurredAt: entry.committedAt,
        timestamp: formatActivityTimestamp(entry.committedAt),
      } satisfies ViewIssueActivityEvent;
    });

  return historyEntries.some(isCreatedHistoryEntry)
    ? historyEvents
    : [issueCreatedActivity(issue), ...historyEvents];
};

const issueHistoryPageLimit = 100;

const renderPanelState = (message: string, kind: "error" | "loading") => (
  <PanelState kind={kind} message={message} />
);

const propertyIconClassName = "size-4 text-muted-foreground";
const propertyMenuIconClassName = "size-4";

const priorityOptions = ["none", "urgent", "high", "medium", "low"] as const;
const statusOptions = [
  "backlog",
  "todo",
  "in-progress",
  "needs-review",
  "in-review",
  "done",
  "canceled",
] as const;

const titleForValue = (value: string): string =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const priorityLabel = (priority: string): string =>
  priority === "none" ? "No priority" : titleForValue(priority);

const IssueDueDateControl = ({
  disabled = false,
  onChange,
  value,
}: {
  readonly disabled?: boolean;
  readonly onChange: (value: string | null) => void;
  readonly value: string;
}) => {
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <IssuePropertyPopover
      disabled={disabled}
      label="Change issue due date"
      onOpenChange={(open) => {
        if (open) setDraft(value);
      }}
      trigger={<CalendarDays aria-hidden className={propertyMenuIconClassName} />}
    >
      {(close) => (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const nextDueDate = draft.trim();
            if (nextDueDate !== value) {
              onChange(nextDueDate.length > 0 ? nextDueDate : null);
            }
            close();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            <span>Due date</span>
            <Input
              aria-label="Issue due date"
              onChange={(event) => setDraft(event.currentTarget.value)}
              type="date"
              value={draft}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={() => {
                if (value.length > 0) onChange(null);
                close();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
            <Button size="sm" type="submit">
              Apply
            </Button>
          </div>
        </form>
      )}
    </IssuePropertyPopover>
  );
};

const IssueEstimateControl = ({
  disabled = false,
  onChange,
  value,
}: {
  readonly disabled?: boolean;
  readonly onChange: (value: string | null) => void;
  readonly value: string;
}) => {
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <IssuePropertyPopover
      disabled={disabled}
      label="Change issue estimate"
      onOpenChange={(open) => {
        if (open) setDraft(value);
      }}
      trigger={<Gauge aria-hidden className={propertyMenuIconClassName} />}
    >
      {(close) => (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const nextEstimate = draft.trim();
            if (nextEstimate !== value) {
              onChange(nextEstimate.length > 0 ? nextEstimate : null);
            }
            close();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            <span>Estimate</span>
            <Input
              aria-label="Issue estimate"
              inputMode="decimal"
              onChange={(event) => setDraft(event.currentTarget.value)}
              placeholder="None"
              value={draft}
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={() => {
                if (value.length > 0) onChange(null);
                close();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
            <Button size="sm" type="submit">
              Apply
            </Button>
          </div>
        </form>
      )}
    </IssuePropertyPopover>
  );
};

const terminalAgentJobStatuses = new Set(["cancelled", "completed", "failed"]);
const resumableAgentJobStatuses = new Set([
  "retry-wait",
  "suspended",
  "waiting-for-input",
]);

const agentJobTime = (job: AgentWorkJob): number => {
  const value = job.updatedAt ?? job.startedAt ?? job.createdAt;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const latestAgentJob = (jobs: readonly AgentWorkJob[]): AgentWorkJob | undefined =>
  [...jobs].sort((left, right) => agentJobTime(right) - agentJobTime(left))[0];

const activeAgentJob = (jobs: readonly AgentWorkJob[]): AgentWorkJob | undefined =>
  latestAgentJob(jobs.filter((job) => !terminalAgentJobStatuses.has(job.status)));

const metadataString = (
  job: AgentWorkJob | undefined,
  key: string,
): string | undefined => {
  const value = job?.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const providerName = (
  providers: readonly DetectedAgentProvider[],
  providerId: string | undefined,
): string =>
  providers.find((provider) => provider.id === providerId)?.name ?? providerId ?? "Agent";

const AgentDelegateSidebar = ({
  cancelPending,
  delegate,
  jobs,
  onCancel,
  onResume,
  providers,
  resumePending,
}: {
  readonly cancelPending: boolean;
  readonly delegate?: AgentDelegate | null;
  readonly jobs: readonly AgentWorkJob[];
  readonly onCancel: (jobId: string) => void;
  readonly onResume: (jobId: string) => void;
  readonly providers: readonly DetectedAgentProvider[];
  readonly resumePending: boolean;
}) => {
  const currentJob = activeAgentJob(jobs) ?? latestAgentJob(jobs);
  const branchName = metadataString(currentJob, "branchName");
  const commitSha = metadataString(currentJob, "commitSha");
  const worktreePath = metadataString(currentJob, "worktreePath");
  const canCancel = currentJob !== undefined && !terminalAgentJobStatuses.has(currentJob.status);
  const canResume = currentJob !== undefined && resumableAgentJobStatuses.has(currentJob.status);

  return (
    <div className="grid gap-3 text-sm">
      <div className="grid gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Assigned agent
        </div>
        <div className="truncate font-medium text-foreground">
          {delegate
            ? providerName(providers, delegate.providerId)
            : "No agent assigned"}
        </div>
        {delegate?.model ? (
          <div className="truncate text-xs text-muted-foreground">{delegate.model}</div>
        ) : null}
      </div>

      {currentJob ? (
        <div className="grid gap-2 rounded-md border border-border bg-subtle/45 p-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <StatusIndicator
                label={statusLabel(currentJob.status)}
                tone={jobStatusTone(currentJob.status)}
              />
              <span className="truncate font-medium">{statusLabel(currentJob.status)}</span>
            </div>
            <span className="shrink-0 rounded-sm bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
              Implementation
            </span>
          </div>
          {currentJob.currentGate ? (
            <div className="text-xs text-warning">{currentJob.currentGate}</div>
          ) : null}
          {currentJob.lastError ? (
            <div className="text-xs text-destructive">{currentJob.lastError}</div>
          ) : null}
          {branchName ? (
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Branch</span>
              <span className="break-all text-xs text-foreground">{branchName}</span>
            </div>
          ) : null}
          {commitSha ? (
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Commit</span>
              <span className="break-all text-xs text-foreground">{commitSha.slice(0, 12)}</span>
            </div>
          ) : null}
          {worktreePath ? (
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Worktree</span>
              <span className="break-all text-xs text-foreground">{worktreePath}</span>
            </div>
          ) : null}
          {canCancel || canResume ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {canCancel ? (
                <Button
                  loading={cancelPending}
                  onClick={() => onCancel(currentJob.jobId)}
                  size="sm"
                  tone="danger"
                  variant="outline"
                >
                  Cancel
                </Button>
              ) : null}
              {canResume ? (
                <Button
                  loading={resumePending}
                  onClick={() => onResume(currentJob.jobId)}
                  size="sm"
                  variant="outline"
                >
                  Resume
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No delegate jobs yet.</div>
      )}
    </div>
  );
};

const DelegateToAgentDialog = ({
  agentId,
  error,
  instructions,
  model,
  notes,
  onAgentIdChange,
  onInstructionsChange,
  onModelChange,
  onNotesChange,
  onOpenChange,
  onProviderIdChange,
  onSubmit,
  open,
  pending,
  providerId,
  providers,
}: {
  readonly agentId: string;
  readonly error?: string;
  readonly instructions: string;
  readonly model: string;
  readonly notes: string;
  readonly onAgentIdChange: (value: string) => void;
  readonly onInstructionsChange: (value: string) => void;
  readonly onModelChange: (value: string) => void;
  readonly onNotesChange: (value: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onProviderIdChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly open: boolean;
  readonly pending: boolean;
  readonly providerId: string;
  readonly providers: readonly DetectedAgentProvider[];
}) => {
  const providerItems = providers.map((provider) => ({
    disabled: provider.status !== "available",
    label: provider.name,
    value: provider.id,
  }));
  const hasAvailableProvider = providers.some((provider) => provider.status === "available");

  return (
    <DialogRoot onOpenChange={onOpenChange} open={open}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPanel width="md">
            <DialogHeader>
              <div>
                <DialogTitle>Delegate to agent</DialogTitle>
                <DialogDescription>
                  Start an implementation job in an isolated worktree.
                </DialogDescription>
              </div>
              <DialogCloseButton />
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              <DialogBody className="grid gap-4">
                <div className="grid gap-1.5">
                  <div className="text-sm font-medium text-foreground">Mode</div>
                  <div className="rounded-md border border-border bg-subtle px-3 py-2 text-sm">
                    Implementation
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    disabled={pending || providerItems.length === 0}
                    items={providerItems}
                    label="Provider"
                    onValueChange={(value) => {
                      if (value !== null) onProviderIdChange(value);
                    }}
                    placeholder="Select provider"
                    value={providerId}
                  />
                  <Select
                    disabled={pending || providerItems.length === 0}
                    items={providerItems}
                    label="Agent"
                    onValueChange={(value) => {
                      if (value !== null) onAgentIdChange(value);
                    }}
                    placeholder="Select agent"
                    value={agentId}
                  />
                </div>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Model
                  <Input
                    disabled={pending}
                    onChange={(event) => onModelChange(event.currentTarget.value)}
                    placeholder="Provider default"
                    value={model}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Notes
                  <Input
                    disabled={pending}
                    onChange={(event) => onNotesChange(event.currentTarget.value)}
                    placeholder="Optional assignment note"
                    value={notes}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-foreground">
                  Instructions
                  <Textarea
                    disabled={pending}
                    onChange={(event) => onInstructionsChange(event.currentTarget.value)}
                    placeholder="Optional implementation instructions"
                    value={instructions}
                  />
                </label>
                {!hasAvailableProvider ? (
                  <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                    No available agent provider was detected.
                  </div>
                ) : null}
                {error ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
                  Cancel
                </Button>
                <Button
                  disabled={!hasAvailableProvider || !providerId || !agentId}
                  loading={pending}
                  type="submit"
                >
                  Delegate
                </Button>
              </DialogFooter>
            </form>
          </DialogPanel>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
};

export const ViewIssuePanel = ({
  agentProviders = [],
  issueId,
  repositories = [],
  repositoryId,
}: ViewIssuePanelProps) => {
  const issueQuery = useIssueDetailQuery(repositoryId, issueId);
  const issueHistoryQuery = useIssueHistoryQuery(repositoryId, issueId, {
    limit: issueHistoryPageLimit,
  });
  const issueListQuery = useIssueListQuery(repositoryId);
  const recordsQuery = useIssueRecordsQuery(repositoryId, issueId);
  const usersQuery = useUserListQuery(repositoryId, {
    disabled: false,
  });
  const labelsQuery = useLabelListQuery(repositoryId, {
    archived: false,
  });
  const delegateQuery = useIssueAgentDelegateQuery(repositoryId, issueId);
  const agentJobsQuery = useAgentJobsQuery({
    repositoryId,
    ticketId: issueId,
  });
  const updateIssue = useUpdateIssueMutation({
    issueId,
    repositoryId,
  });
  const createSubIssue = useCreateIssueMutation({
    repositoryId,
  });
  const addComment = useAddIssueCommentMutation({
    issueId,
    repositoryId,
  });
  const startDelegateJob = useStartIssueAgentDelegateJobMutation({
    issueId,
    repositoryId,
  });
  const cancelAgentJob = useCancelAgentJobMutation();
  const resumeAgentJob = useResumeAgentJobMutation();
  const initiativeProgressQuery = useInitiativeProgressQuery(
    repositoryId,
    issueQuery.data?.type === "initiative" ? issueQuery.data.id : undefined,
  );
  const availableAgentProviders = React.useMemo(
    () => agentProviders.filter((provider) => provider.status === "available"),
    [agentProviders],
  );
  const defaultAgentProviderId =
    availableAgentProviders.find((provider) => provider.id === "codex")?.id ??
    availableAgentProviders[0]?.id ??
    "";
  const [delegateDialogOpen, setDelegateDialogOpen] = React.useState(false);
  const [delegateAgentId, setDelegateAgentId] = React.useState<string>(defaultAgentProviderId);
  const [delegateProviderId, setDelegateProviderId] =
    React.useState<string>(defaultAgentProviderId);
  const [delegateModel, setDelegateModel] = React.useState("");
  const [delegateNotes, setDelegateNotes] = React.useState("");
  const [delegateInstructions, setDelegateInstructions] = React.useState("");

  React.useEffect(() => {
    if (!delegateDialogOpen || !defaultAgentProviderId) return;
    if (!delegateAgentId) setDelegateAgentId(defaultAgentProviderId);
    if (!delegateProviderId) setDelegateProviderId(defaultAgentProviderId);
  }, [defaultAgentProviderId, delegateAgentId, delegateDialogOpen, delegateProviderId]);

  const openDelegateDialog = () => {
    const delegate = delegateQuery.data;
    const fallbackProviderId = delegate?.providerId ?? defaultAgentProviderId;
    setDelegateProviderId(fallbackProviderId);
    setDelegateAgentId(delegate?.agentId ?? fallbackProviderId);
    setDelegateModel(delegate?.model ?? "");
    setDelegateNotes(delegate?.notes ?? "");
    setDelegateInstructions("");
    setDelegateDialogOpen(true);
  };

  const submitDelegateJob = () => {
    const agentId = delegateAgentId.trim();
    const providerId = delegateProviderId.trim();
    if (!agentId || !providerId) return;

    startDelegateJob.mutate(
      {
        agentId,
        instructions: delegateInstructions.trim() || undefined,
        model: delegateModel.trim() || undefined,
        notes: delegateNotes.trim() || undefined,
        providerId,
      },
      {
        onSuccess: () => setDelegateDialogOpen(false),
      },
    );
  };

  if (!issueId || !repositoryId) {
    return renderPanelState("Choose an issue to view details.", "error");
  }

  if (issueQuery.isLoading) {
    return renderPanelState("Loading issue details.", "loading");
  }

  if (issueQuery.error instanceof Error) {
    return renderPanelState(issueQuery.error.message, "error");
  }

  const issue = issueQuery.data;

  if (!issue) {
    return renderPanelState("Issue was not found.", "error");
  }

  const users = usersQuery.data?.entries ?? [];
  const labels = labelsQuery.data?.entries ?? [];
  const delegateJobs = (agentJobsQuery.data ?? []).filter(
    (job) => job.trigger === "agent-delegate" || job.authorityMode === "implementation-worktree",
  );
  const tagSuggestions = createMarkdownTagSuggestions({
    agentProviders,
    issues: issueListQuery.data?.entries,
    repositories,
    users,
  });
  const userMap = new Map(users.map((user) => [user.id, user] as const));
  const labelMap = new Map(labels.map((label) => [label.id, label] as const));
  const rawAssignee = issue.frontmatter.assignee?.trim() || "";
  const assigneeName = rawAssignee
    ? (userMap.get(rawAssignee)?.displayName ?? rawAssignee)
    : undefined;

  const updateTitle = (title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle === issue.frontmatter.title) return;

    updateIssue.mutate({
      frontmatter: {
        title: trimmedTitle,
      },
    });
  };

  const updateDescription = (description: string) => {
    if (description === issue.body) return;

    updateIssue.mutate({
      body: description,
    });
  };
  const updateFrontmatter = (frontmatter: Record<string, unknown>, message: string) => {
    updateIssue.mutate({
      frontmatter,
      message,
    });
  };
  const currentDueDate =
    typeof issue.frontmatter.dueDate === "string" ? issue.frontmatter.dueDate : "";
  const currentEstimate =
    issue.frontmatter.estimate === null || issue.frontmatter.estimate === undefined
      ? ""
      : String(issue.frontmatter.estimate);
  const statusMenuOptions = statusOptions.map((status) => ({
    icon: <IssueStatusMark status={status} />,
    label: titleForValue(status),
    value: status,
  })) satisfies readonly IssuePropertyMenuOption[];
  const priorityMenuOptions = priorityOptions.map((priority) => ({
    icon: <IssuePriorityMark priority={priority} size="md" />,
    label: priorityLabel(priority),
    value: priority,
  })) satisfies readonly IssuePropertyMenuOption[];
  const assigneeMenuOptions = [
    {
      icon: <IssueAssigneeMark />,
      label: "No assignee",
      value: "none",
    },
    ...users.map((user) => ({
      icon: <IssueAssigneeMark name={user.displayName} />,
      label: user.displayName,
      rightMeta: user.email,
      value: user.id,
    })),
    ...(rawAssignee && !userMap.has(rawAssignee)
      ? [
          {
            icon: <IssueAssigneeMark name={rawAssignee} />,
            label: rawAssignee,
            value: rawAssignee,
          },
        ]
      : []),
  ] satisfies readonly IssuePropertyMenuOption[];
  const issueProperties = [
    {
      icon: (
        <IssuePropertyOptionMenu
          disabled={updateIssue.isPending}
          label="Change issue status"
          onChange={(status) => {
            if (status === issue.frontmatter.status) return;
            updateFrontmatter({ status }, `Updated ${issue.id} status to ${status}`);
          }}
          options={statusMenuOptions}
          trigger={<IssueStatusMark status={issue.frontmatter.status} />}
          value={issue.frontmatter.status}
        />
      ),
      id: "status",
      label: "Status",
      value: titleForValue(issue.frontmatter.status),
    },
    {
      icon: (
        <IssuePropertyOptionMenu
          disabled={updateIssue.isPending}
          label="Change issue priority"
          onChange={(priority) => {
            if (priority === issue.frontmatter.priority) return;
            updateFrontmatter({ priority }, `Updated ${issue.id} priority to ${priority}`);
          }}
          options={priorityMenuOptions}
          trigger={<IssuePriorityMark priority={issue.frontmatter.priority} size="md" />}
          value={issue.frontmatter.priority}
        />
      ),
      id: "priority",
      label: "Priority",
      value: priorityLabel(issue.frontmatter.priority),
    },
    {
      icon: (
        <IssuePropertyOptionMenu
          disabled={updateIssue.isPending}
          label="Change issue assignee"
          onChange={(assignee) => {
            const nextAssignee = assignee === "none" ? null : assignee;
            if ((issue.frontmatter.assignee ?? null) === nextAssignee) return;
            updateFrontmatter({ assignee: nextAssignee }, `Updated ${issue.id} assignee`);
          }}
          options={assigneeMenuOptions}
          trigger={<IssueAssigneeMark name={assigneeName} />}
          value={rawAssignee || "none"}
          widthClassName="w-[300px]"
        />
      ),
      id: "assignee",
      label: "Assignee",
      muted: !assigneeName,
      value: assigneeName ?? "No assignee",
    },
    {
      icon: (
        <IssueDueDateControl
          disabled={updateIssue.isPending}
          onChange={(dueDate) => {
            updateFrontmatter({ dueDate }, `Updated ${issue.id} due date`);
          }}
          value={currentDueDate}
        />
      ),
      id: "due-date",
      label: "Due date",
      muted: currentDueDate.length === 0,
      value:
        formatDate(currentDueDate) ?? (currentDueDate.length > 0 ? currentDueDate : "No due date"),
    },
    {
      icon: (
        <IssueEstimateControl
          disabled={updateIssue.isPending}
          onChange={(estimate) => {
            updateFrontmatter({ estimate }, `Updated ${issue.id} estimate`);
          }}
          value={currentEstimate}
        />
      ),
      id: "estimate",
      label: "Estimate",
      muted: currentEstimate.length === 0,
      value: currentEstimate.length > 0 ? currentEstimate : "None",
    },
    ...(issue.type === "initiative"
      ? [
          {
            icon: <BarChart3 aria-hidden className={propertyIconClassName} />,
            id: "progress",
            label: "Progress",
            value: initiativeProgressQuery.data
              ? `${initiativeProgressQuery.data.completedIssues}/${initiativeProgressQuery.data.issueTotal} issues`
              : "No child issues",
          },
        ]
      : []),
  ];

  return (
    <>
      <ViewIssue
        activityEvents={issueActivity(issue, issueHistoryQuery.data?.entries ?? [])}
        agentWork={
          <AgentDelegateSidebar
            cancelPending={cancelAgentJob.isPending}
            delegate={delegateQuery.data}
            jobs={delegateJobs}
            onCancel={(jobId) => cancelAgentJob.mutate(jobId)}
            onResume={(jobId) => resumeAgentJob.mutate(jobId)}
            providers={agentProviders}
            resumePending={resumeAgentJob.isPending}
          />
        }
        assignee={
          assigneeName
            ? {
                initials: initialsForName(assigneeName),
                name: assigneeName,
              }
            : undefined
        }
        comments={(recordsQuery.data?.entries ?? []).map(commentFromRecord)}
        defaultDescription={issue.body}
        defaultTitle={issue.frontmatter.title}
        descriptionDefaultPreviewOpen
        dueDate={formatDate(
          typeof issue.frontmatter.dueDate === "string" ? issue.frontmatter.dueDate : undefined,
        )}
        labels={(issue.frontmatter.labels ?? []).map((labelId) => ({
          colorClassName: labelColorClassName(labelMap.get(labelId)?.color),
          id: labelId,
          label: labelMap.get(labelId)?.name ?? labelId,
        }))}
        onAgentDelegate={openDelegateDialog}
        onCommentCreate={(comment) => addComment.mutate(comment)}
        onDescriptionSave={updateDescription}
        onFilesSelect={(files) => {
          console.info(
            "Selected issue attachment files",
            [...files].map((file) => file.name),
          );
        }}
        onSubIssueCreate={(draft) => {
          const input = {
            body: draft.description,
            parent: issue.id,
            priority: draft.priority ?? undefined,
            status: draft.status ?? undefined,
            title: draft.title,
            type: "task",
          } satisfies Omit<CreateTicketInput, "repository">;

          createSubIssue.mutate(input);
        }}
        onTitleSave={updateTitle}
        priority={issue.frontmatter.priority}
        properties={issueProperties}
        resources={issueResources(issue)}
        status={issue.frontmatter.status}
        tagSuggestions={tagSuggestions}
        title={issue.frontmatter.title}
        viewer={{
          initials: initialsForName(issue.frontmatter.createdBy.name),
          name: issue.frontmatter.createdBy.name,
        }}
      />
      <DelegateToAgentDialog
        agentId={delegateAgentId}
        error={startDelegateJob.error instanceof Error ? startDelegateJob.error.message : undefined}
        instructions={delegateInstructions}
        model={delegateModel}
        notes={delegateNotes}
        onAgentIdChange={setDelegateAgentId}
        onInstructionsChange={setDelegateInstructions}
        onModelChange={setDelegateModel}
        onNotesChange={setDelegateNotes}
        onOpenChange={setDelegateDialogOpen}
        onProviderIdChange={setDelegateProviderId}
        onSubmit={submitDelegateJob}
        open={delegateDialogOpen}
        pending={startDelegateJob.isPending}
        providerId={delegateProviderId}
        providers={agentProviders}
      />
    </>
  );
};
