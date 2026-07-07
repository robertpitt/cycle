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
} from "@cycle/backend/client";
import {
  useAddIssueCommentMutation,
  useArchiveIssueMutation,
  useCancelAgentTaskMutation,
  useCreateIssueMutation,
  useRetryAgentTaskMutation,
  useStartIssueAgentChatMutation,
  useUpdateIssueMutation,
} from "../mutations/index.ts";
import {
  useAgentTasksQuery,
  useInitiativeProgressQuery,
  useIssueDetailQuery,
  useIssueHistoryQuery,
  useIssueListQuery,
  useIssueRecordsQuery,
  useLabelListQuery,
  useUserListQuery,
} from "../queries/index.ts";
import { createMarkdownTagSuggestions } from "../lib/markdownTagSuggestions.ts";
import { labelColorClassName } from "../screens/workspace/createIssueOptions.tsx";
import type { RepositoryRecord } from "@cycle/backend/client";
import type { DetectedAgentProvider } from "@cycle/backend/client";
import {
  taskStatusTone,
  statusLabel,
  terminalAgentTaskStatuses,
  resumableAgentTaskStatuses,
  type AgentTask,
} from "../lib/agentTasks.ts";

type ViewIssuePanelProps = {
  readonly agentProviders?: readonly DetectedAgentProvider[];
  readonly issueId?: string;
  readonly onArchived?: () => void;
  readonly onChatOpen?: () => void;
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

const agentTaskTime = (task: AgentTask): number => {
  const value = task.updatedAt ?? task.startedAt ?? task.createdAt;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const latestAgentTask = (tasks: readonly AgentTask[]): AgentTask | undefined =>
  [...tasks].sort((left, right) => agentTaskTime(right) - agentTaskTime(left))[0];

const activeAgentTask = (tasks: readonly AgentTask[]): AgentTask | undefined =>
  latestAgentTask(tasks.filter((task) => !terminalAgentTaskStatuses.has(task.status)));

const metadataString = (task: AgentTask | undefined, key: string): string | undefined => {
  const value = task?.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
};

const providerName = (
  providers: readonly DetectedAgentProvider[],
  providerId: string | undefined,
): string =>
  providers.find((provider) => provider.id === providerId)?.name ?? providerId ?? "Agent";

const AgentTaskSidebar = ({
  cancelPending,
  tasks,
  onCancel,
  onRetry,
  providers,
  retryPending,
}: {
  readonly cancelPending: boolean;
  readonly tasks: readonly AgentTask[];
  readonly onCancel: (taskId: string) => void;
  readonly onRetry: (taskId: string) => void;
  readonly providers: readonly DetectedAgentProvider[];
  readonly retryPending: boolean;
}) => {
  const currentTask = activeAgentTask(tasks) ?? latestAgentTask(tasks);
  const branchName = metadataString(currentTask, "branchName");
  const commitSha = metadataString(currentTask, "commitSha");
  const worktreePath = currentTask?.workspace?.path ?? metadataString(currentTask, "worktreePath");
  const canCancel = currentTask !== undefined && !terminalAgentTaskStatuses.has(currentTask.status);
  const canRetry = currentTask !== undefined && resumableAgentTaskStatuses.has(currentTask.status);

  return (
    <div className="grid gap-3 text-sm">
      <div className="grid gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Agent task
        </div>
        <div className="truncate font-medium text-foreground">
          {currentTask ? providerName(providers, currentTask.providerId) : "No task started"}
        </div>
        {currentTask?.model ? (
          <div className="truncate text-xs text-muted-foreground">{currentTask.model}</div>
        ) : null}
      </div>

      {currentTask ? (
        <div className="grid gap-2 rounded-md border border-border bg-subtle/45 p-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <StatusIndicator
                label={statusLabel(currentTask.status)}
                tone={taskStatusTone(currentTask.status)}
              />
              <span className="truncate font-medium">{statusLabel(currentTask.status)}</span>
            </div>
            <span className="shrink-0 rounded-sm bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
              Task
            </span>
          </div>
          {currentTask.lastError ? (
            <div className="text-xs text-destructive">{currentTask.lastError.message}</div>
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
          {canCancel || canRetry ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {canCancel ? (
                <Button
                  loading={cancelPending}
                  onClick={() => onCancel(currentTask.taskId)}
                  size="sm"
                  tone="danger"
                  variant="outline"
                >
                  Cancel
                </Button>
              ) : null}
              {canRetry ? (
                <Button
                  loading={retryPending}
                  onClick={() => onRetry(currentTask.taskId)}
                  size="sm"
                  variant="outline"
                >
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No agent tasks yet.</div>
      )}
    </div>
  );
};

const StartAgentTaskDialog = ({
  agentId,
  error,
  instructions,
  model,
  onAgentIdChange,
  onInstructionsChange,
  onModelChange,
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
  readonly onAgentIdChange: (value: string) => void;
  readonly onInstructionsChange: (value: string) => void;
  readonly onModelChange: (value: string) => void;
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
                <DialogTitle>Start agent chat</DialogTitle>
                <DialogDescription>
                  Open an implementation chat from this issue's current context.
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
                  Start chat
                </Button>
              </DialogFooter>
            </form>
          </DialogPanel>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
};

const ArchiveIssueDialog = ({
  issueId,
  issueTitle,
  onConfirm,
  onOpenChange,
  open,
  pending,
}: {
  readonly issueId: string;
  readonly issueTitle: string;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly pending: boolean;
}) => (
  <DialogRoot
    onOpenChange={(nextOpen) => {
      if (!pending) onOpenChange(nextOpen);
    }}
    open={open}
  >
    <DialogPortal>
      <DialogBackdrop />
      <DialogViewport>
        <DialogPanel width="sm">
          <DialogHeader>
            <div>
              <DialogTitle>Archive issue?</DialogTitle>
              <DialogDescription>
                This removes the issue from active lists and normal app views.
              </DialogDescription>
            </div>
            <DialogCloseButton disabled={pending} />
          </DialogHeader>
          <DialogBody className="grid gap-3">
            <div className="rounded-md border border-border bg-subtle px-3 py-2">
              <div className="text-sm font-medium text-foreground">{issueTitle}</div>
              <div className="mt-1 text-xs font-medium text-muted-foreground">{issueId}</div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button disabled={pending} onClick={() => onOpenChange(false)} variant="ghost">
              Cancel
            </Button>
            <Button loading={pending} onClick={onConfirm} tone="danger">
              Archive issue
            </Button>
          </DialogFooter>
        </DialogPanel>
      </DialogViewport>
    </DialogPortal>
  </DialogRoot>
);

export const ViewIssuePanel = ({
  agentProviders = [],
  issueId,
  onArchived,
  onChatOpen,
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
  const agentTasksQuery = useAgentTasksQuery({
    repositoryId,
    ticketId: issueId,
  });
  const updateIssue = useUpdateIssueMutation({
    issueId,
    repositoryId,
  });
  const archiveIssue = useArchiveIssueMutation({
    issueId,
    onArchived,
    repositoryId,
  });
  const createSubIssue = useCreateIssueMutation({
    repositoryId,
  });
  const addComment = useAddIssueCommentMutation({
    issueId,
    repositoryId,
  });
  const issueRepository = repositories.find((repository) => repository.id === repositoryId) ?? null;
  const startAgentChat = useStartIssueAgentChatMutation({
    issue: issueQuery.data ?? null,
    repository: issueRepository,
  });
  const cancelAgentTask = useCancelAgentTaskMutation();
  const retryAgentTask = useRetryAgentTaskMutation();
  const initiativeProgressQuery = useInitiativeProgressQuery(
    repositoryId,
    issueQuery.data?.type === "initiative" ? issueQuery.data.id : undefined,
  );
  const availableAgentProviders = React.useMemo(
    () => agentProviders.filter((provider) => provider.status === "available"),
    [agentProviders],
  );
  const defaultAgentProviderId = availableAgentProviders[0]?.id ?? "";
  const [agentTaskDialogOpen, setAgentTaskDialogOpen] = React.useState(false);
  const [agentTaskAgentId, setAgentTaskAgentId] = React.useState<string>(defaultAgentProviderId);
  const [agentTaskProviderId, setAgentTaskProviderId] =
    React.useState<string>(defaultAgentProviderId);
  const [agentTaskModel, setAgentTaskModel] = React.useState("");
  const [agentTaskInstructions, setAgentTaskInstructions] = React.useState("");
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (!agentTaskDialogOpen || !defaultAgentProviderId) return;
    if (!agentTaskAgentId) setAgentTaskAgentId(defaultAgentProviderId);
    if (!agentTaskProviderId) setAgentTaskProviderId(defaultAgentProviderId);
  }, [agentTaskAgentId, agentTaskDialogOpen, agentTaskProviderId, defaultAgentProviderId]);

  const openAgentTaskDialog = () => {
    setAgentTaskProviderId(defaultAgentProviderId);
    setAgentTaskAgentId(defaultAgentProviderId);
    setAgentTaskModel("");
    setAgentTaskInstructions("");
    setAgentTaskDialogOpen(true);
  };

  const submitAgentTask = () => {
    const agentId = agentTaskAgentId.trim();
    const providerId = agentTaskProviderId.trim();
    if (!agentId || !providerId) return;

    startAgentChat.mutate(
      {
        authority: { mode: "workspace-write" },
        agentId,
        instructions: agentTaskInstructions.trim() || undefined,
        model: agentTaskModel.trim() || undefined,
        providerId,
        requestedBy: "user",
      },
      {
        onSuccess: () => {
          setAgentTaskDialogOpen(false);
          onChatOpen?.();
        },
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
  const agentTasks = agentTasksQuery.data ?? [];
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
          <AgentTaskSidebar
            cancelPending={cancelAgentTask.isPending}
            tasks={agentTasks}
            onCancel={(taskId) => cancelAgentTask.mutate(taskId)}
            onRetry={(taskId) => retryAgentTask.mutate(taskId)}
            providers={agentProviders}
            retryPending={retryAgentTask.isPending}
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
        onAgentDelegate={openAgentTaskDialog}
        archiveDisabled={archiveIssue.isPending || Boolean(issue.archivedAt)}
        archivePending={archiveIssue.isPending}
        onCommentCreate={(comment) => addComment.mutate(comment)}
        onDescriptionSave={updateDescription}
        onArchive={() => setArchiveDialogOpen(true)}
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
      <StartAgentTaskDialog
        agentId={agentTaskAgentId}
        error={startAgentChat.error instanceof Error ? startAgentChat.error.message : undefined}
        instructions={agentTaskInstructions}
        model={agentTaskModel}
        onAgentIdChange={setAgentTaskAgentId}
        onInstructionsChange={setAgentTaskInstructions}
        onModelChange={setAgentTaskModel}
        onOpenChange={setAgentTaskDialogOpen}
        onProviderIdChange={setAgentTaskProviderId}
        onSubmit={submitAgentTask}
        open={agentTaskDialogOpen}
        pending={startAgentChat.isPending}
        providerId={agentTaskProviderId}
        providers={agentProviders}
      />
      <ArchiveIssueDialog
        issueId={issue.id}
        issueTitle={issue.frontmatter.title}
        onConfirm={() => archiveIssue.mutate()}
        onOpenChange={setArchiveDialogOpen}
        open={archiveDialogOpen}
        pending={archiveIssue.isPending}
      />
    </>
  );
};
